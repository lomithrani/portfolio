// Periodic 'memory' log line, to tell apart a growing JavaScript heap (and
// which object type grows) from native memory growth on Railway, where only
// the logs are at hand. Reads only: it never forces a garbage collection, so
// the values include garbage not yet collected (compare trends, not samples).
import { heapStats } from 'bun:jsc';
import { logger } from './logger';

export const TOP_OBJECT_TYPES = 8;

const BYTES_PER_MB = 1024 * 1024;
const toMB = (bytes: number) => Math.round((bytes / BYTES_PER_MB) * 10) / 10;

export type MemorySnapshot = {
  /** process.memoryUsage(), in MB with one decimal */
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  /** JavaScript cells on the heap, and those protected from collection by native code */
  objectCount: number;
  protectedObjectCount: number;
  /** The most numerous object types, e.g. "Function=4128 string=3907 ..." */
  topObjectTypes: string;
};

export const memorySnapshot = (): MemorySnapshot => {
  const usage = process.memoryUsage();
  const stats = heapStats();
  const topObjectTypes = Object.entries(stats.objectTypeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, TOP_OBJECT_TYPES)
    .map(([type, count]) => `${type}=${count}`)
    .join(' ');

  return {
    rss: toMB(usage.rss),
    heapUsed: toMB(usage.heapUsed),
    heapTotal: toMB(usage.heapTotal),
    external: toMB(usage.external),
    arrayBuffers: toMB(usage.arrayBuffers),
    objectCount: stats.objectCount,
    protectedObjectCount: stats.protectedObjectCount,
    topObjectTypes
  };
};

type Log = (message: string, attributes: MemorySnapshot) => void;

/**
 * Logs a 'memory' line now, then every intervalMs (0 turns it off). The
 * timer is unref'ed, so it never keeps the process alive. Returns the
 * function that stops it (call it on shutdown).
 */
export const startMemoryDiagnostics = (intervalMs: number, log: Log = logger.info): (() => void) => {
  if (intervalMs <= 0) return () => {};

  const sample = () => {
    try {
      log('memory', memorySnapshot());
    } catch (error) {
      // Diagnostics must never take the server down
      logger.warn('Memory diagnostics failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  sample();
  const timer = setInterval(sample, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
};
