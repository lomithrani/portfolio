import { describe, it, expect, afterEach, mock, spyOn } from 'bun:test';
import { TOP_OBJECT_TYPES, memorySnapshot, startMemoryDiagnostics } from '../services/memoryDiagnostics';
import type { MemorySnapshot } from '../services/memoryDiagnostics';
import { createShutdown } from '../services/shutdown';

const MEMORY_FIELDS = ['rss', 'heapUsed', 'heapTotal', 'external', 'arrayBuffers'] as const;

const isMegabytes = (value: number | undefined) =>
  typeof value === 'number' && value >= 0 && Math.round(value * 10) / 10 === value;

let stops: (() => void)[] = [];
const start = (intervalMs: number, log: (message: string, attributes: MemorySnapshot) => void) => {
  const stop = startMemoryDiagnostics(intervalMs, log);
  stops.push(stop);
  return stop;
};

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  mock.restore();
});

describe('memorySnapshot', () => {
  it('reports process memory in MB (one decimal) and the JavaScript heap object counts', () => {
    const snapshot = memorySnapshot();

    for (const field of MEMORY_FIELDS) expect(isMegabytes(snapshot[field])).toBe(true);
    expect(snapshot.rss).toBeGreaterThan(snapshot.heapUsed);
    expect(snapshot.heapUsed).toBeGreaterThan(0);
    expect(snapshot.objectCount).toBeInteger();
    expect(snapshot.objectCount).toBeGreaterThan(1000);
    expect(snapshot.protectedObjectCount).toBeInteger();

    const types = snapshot.topObjectTypes.split(' ').map((entry) => entry.split('='));
    expect(types).toHaveLength(TOP_OBJECT_TYPES);
    const counts = types.map(([, count]) => Number(count));
    for (const [type, count] of types) {
      expect(type).not.toBe('');
      expect(Number(count)).toBeInteger();
    }
    // Largest first
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });
});

describe('startMemoryDiagnostics', () => {
  it('logs a memory line at once, then on every interval', async () => {
    const log = mock((_message: string, _attributes: MemorySnapshot) => {});
    start(25, log);
    expect(log).toHaveBeenCalledTimes(1);

    await Bun.sleep(90);
    expect(log.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const [message, attributes] of log.mock.calls) {
      expect(message).toBe('memory');
      expect(Object.keys(attributes).sort()).toEqual(
        [...MEMORY_FIELDS, 'objectCount', 'protectedObjectCount', 'topObjectTypes'].sort()
      );
    }
  });

  it('writes one structured console line through the logger by default', () => {
    const consoleLog = spyOn(console, 'log').mockImplementation(() => {});
    start(60_000, undefined as never);
    expect(consoleLog).toHaveBeenCalledTimes(1);
    const [prefix, message, json] = consoleLog.mock.calls[0] as [string, string, string];
    expect(prefix).toBe('[INFO]');
    expect(message).toBe('memory');
    // One line: Railway shows every output line as a separate entry
    expect(json).not.toContain('\n');
    const attributes = JSON.parse(json) as MemorySnapshot;
    expect(Object.keys(attributes)).toEqual([...MEMORY_FIELDS, 'objectCount', 'protectedObjectCount', 'topObjectTypes']);
    expect(attributes.topObjectTypes.split(' ')).toHaveLength(TOP_OBJECT_TYPES);
  });

  it('does nothing with an interval of 0', async () => {
    const log = mock(() => {});
    start(0, log);
    await Bun.sleep(30);
    expect(log).not.toHaveBeenCalled();
  });

  it('never keeps the process alive (unref-ed timer)', () => {
    const unref = mock(() => {});
    const setIntervalSpy = spyOn(globalThis, 'setInterval').mockImplementation((() => ({
      unref
    })) as unknown as typeof setInterval);
    const clearIntervalSpy = spyOn(globalThis, 'clearInterval').mockImplementation(() => {});

    const stop = startMemoryDiagnostics(600_000, () => {});
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy.mock.calls[0][1]).toBe(600_000);
    expect(unref).toHaveBeenCalledTimes(1);

    stop();
    expect(clearIntervalSpy).toHaveBeenCalledWith(setIntervalSpy.mock.results[0].value);
  });

  it('logs a warning instead of throwing when a sample fails', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    start(20, () => {
      calls++;
      throw new Error('boom');
    });
    await Bun.sleep(60);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(warn).toHaveBeenCalledWith('[WARN]', 'Memory diagnostics failed', '{"error":"boom"}');
  });
});

describe('graceful shutdown', () => {
  const quietLogs = () => {
    spyOn(console, 'log').mockImplementation(() => {});
    spyOn(console, 'error').mockImplementation(() => {});
  };

  it('stops the memory timer, then runs the other steps in order and exits 0', async () => {
    quietLogs();
    const log = mock(() => {});
    const stopMemoryDiagnostics = start(20, log);
    const order: string[] = [];
    const exit = mock((_code: number) => {});

    const shutdown = createShutdown({
      steps: [
        { name: 'memory diagnostics', run: () => { order.push('memory'); stopMemoryDiagnostics(); } },
        { name: 'HTTP server', run: async () => { order.push('http'); } },
        { name: 'MongoDB', run: async () => { order.push('mongo'); } },
        { name: 'telemetry', run: async () => { order.push('telemetry'); } }
      ],
      exit
    });

    await shutdown('SIGTERM');
    expect(order).toEqual(['memory', 'http', 'mongo', 'telemetry']);
    expect(exit).toHaveBeenCalledWith(0);
    expect(console.log).toHaveBeenCalledWith('[INFO]', 'SIGTERM received, shutting down');

    // Several intervals later: no further memory line
    const linesAtShutdown = log.mock.calls.length;
    await Bun.sleep(80);
    expect(log.mock.calls.length).toBe(linesAtShutdown);
  });

  it('runs once, keeps going after a failed step and exits 1', async () => {
    quietLogs();
    const exit = mock((_code: number) => {});
    const telemetry = mock(async () => {});
    const shutdown = createShutdown({
      steps: [
        { name: 'MongoDB', run: async () => { throw new Error('socket closed'); } },
        { name: 'telemetry', run: telemetry }
      ],
      exit
    });

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    expect(telemetry).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith('[ERROR]', 'Shutdown: MongoDB failed', '{"error":"socket closed"}');
  });

  it('exits 1 when a step hangs past the timeout', async () => {
    quietLogs();
    const exit = mock((_code: number) => {});
    const shutdown = createShutdown({
      steps: [{ name: 'HTTP server', run: () => new Promise(() => {}) }],
      timeoutMs: 30,
      exit
    });

    void shutdown('SIGTERM');
    await Bun.sleep(60);
    expect(exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith('[ERROR]', 'Graceful shutdown timed out, exiting');
  });
});
