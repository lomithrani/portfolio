// OTEL_SDK_DISABLED and OTEL_{TRACES,METRICS,LOGS}_EXPORTER=none, as used to
// bisect memory growth in production: each switch must stop exactly its
// signal. The SDK is built by the same factory instrumentation.ts uses, then
// a traced request, a metric and a log record go through it. The switches
// reach the factory only through the parsed environment, never through
// process.env, so an exporter NodeSDK would build on its own from the
// environment (default: otlp) would show up at the sink.
import { describe, it, expect, beforeAll, afterAll, afterEach, spyOn, mock } from 'bun:test';
import { Elysia } from 'elysia';
import { context, metrics, propagation, trace, ProxyTracerProvider } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import type { NodeSDK } from '@opentelemetry/sdk-node';
import { parseEnv } from '../env';
import {
  SENSITIVE_SPAN_ATTRIBUTES,
  createTelemetrySdk,
  createTracingPlugin,
  describeTelemetry
} from '../instrumentation';
import type { TelemetryExporters } from '../instrumentation';
import { logger } from '../services/logger';

const SESSION_SECRET = 'session-jwt-SENTINEL-4d1c';

const base = {
  MONGO_URL: 'mongodb://127.0.0.1:27017/portfolio',
  JWT_SECRET: 'test-secret',
  ALLOWED_DOMAINS: '["http://localhost:5173"]'
};

// --- A local OTLP/HTTP collector -------------------------------------------

type Received = { requests: number; bytes: number; contentTypes: string[]; body: string };
let sink: ReturnType<typeof Bun.serve>;
let received: Record<string, Received> = {};

beforeAll(() => {
  sink = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const body = new Uint8Array(await request.arrayBuffer());
      const entry = (received[path] ??= { requests: 0, bytes: 0, contentTypes: [], body: '' });
      entry.requests++;
      entry.bytes += body.byteLength;
      entry.contentTypes.push(request.headers.get('content-type') ?? '');
      // Protobuf stores strings as raw UTF-8
      entry.body += new TextDecoder().decode(body);
      return new Response(new Uint8Array(0), { headers: { 'content-type': 'application/x-protobuf' } });
    }
  });
});

afterAll(() => {
  sink.stop(true);
});

afterEach(() => {
  received = {};
  for (const name of ['OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_PROTOCOL']) delete process.env[name];
  // Back to the no-op API for the next case and the other test files
  trace.disable();
  metrics.disable();
  logs.disable();
  context.disable();
  propagation.disable();
  mock.restore();
});

// --- Running one configuration ---------------------------------------------

type SdkInternals = {
  _tracerProvider?: { _activeSpanProcessor: { _spanProcessors: { _exporter?: object }[] } };
  _meterProvider?: { _sharedState: { metricCollectors: { _metricReader: { _exporter?: object } }[] } };
  _loggerProvider?: { _sharedState: { registeredLogRecordProcessors: { _exporter?: object }[] } };
};

/** What the started SDK registered, read back from its providers */
const components = (sdk: NodeSDK | undefined) => {
  const internals = sdk as unknown as SdkInternals | undefined;
  const spanProcessors = internals?._tracerProvider?._activeSpanProcessor._spanProcessors ?? [];
  const metricReaders =
    internals?._meterProvider?._sharedState.metricCollectors.map((collector) => collector._metricReader) ?? [];
  const logProcessors = internals?._loggerProvider?._sharedState.registeredLogRecordProcessors ?? [];
  const exporterNames = (parts: { _exporter?: object }[]) =>
    parts.map((part) => part._exporter?.constructor.name ?? 'none');
  return {
    providers: {
      tracer: internals?._tracerProvider !== undefined,
      meter: internals?._meterProvider !== undefined,
      logger: internals?._loggerProvider !== undefined
    },
    spanProcessors: spanProcessors.map((processor) => processor.constructor.name),
    metricReaders: metricReaders.map((reader) => reader.constructor.name),
    logProcessors: logProcessors.map((processor) => processor.constructor.name),
    exporters: {
      traces: exporterNames(spanProcessors),
      metrics: exporterNames(metricReaders),
      logs: exporterNames(logProcessors)
    }
  };
};

const run = async (variables: Record<string, string>, exporters?: TelemetryExporters) => {
  const consoleLog = spyOn(console, 'log').mockImplementation(() => {});
  const settings = parseEnv({
    ...base,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    ...variables
  });
  const sdk = createTelemetrySdk(settings, exporters);
  sdk?.start();
  const registered = components(sdk);

  const plugin = createTracingPlugin(settings);
  const app = new Elysia().use(plugin).get('/ping', () => 'pong');
  const response = await app.handle(
    new Request('http://localhost/ping', { headers: { cookie: `auth=${SESSION_SECRET}` } })
  );
  expect(response.status).toBe(200);
  metrics.getMeter('switch-test').createCounter('switch.test.counter').add(1);
  logger.info('switch test log record');

  // Root spans end after the response; shutdown flushes every signal
  await Bun.sleep(20);
  await sdk?.shutdown();
  const tracerDelegate = (trace.getTracerProvider() as ProxyTracerProvider).getDelegateTracer('check');
  return { settings, sdk, registered, plugin, consoleLog, tracerStarted: tracerDelegate !== undefined };
};

// --- OTLP exporters against the local sink --------------------------------

describe('switches with the production OTLP exporters', () => {
  const useSink = () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${sink.port}`;
    // Exporters NodeSDK built from the environment would send JSON; ours send protobuf
    process.env.OTEL_EXPORTER_OTLP_PROTOCOL = 'http/json';
  };

  const exported = () => ({
    traces: received['/v1/traces']?.bytes ?? 0,
    metrics: received['/v1/metrics']?.bytes ?? 0,
    logs: received['/v1/logs']?.bytes ?? 0
  });

  const expectProtobufOnly = () => {
    for (const entry of Object.values(received)) {
      expect(new Set(entry.contentTypes)).toEqual(new Set(['application/x-protobuf']));
    }
  };

  it('exports traces, metrics and logs by default, through the redacting span exporter', async () => {
    useSink();
    const { registered, settings } = await run({});

    expect(describeTelemetry(settings)).toBe('traces=otlp metrics=otlp logs=otlp');
    expect(registered).toEqual({
      providers: { tracer: true, meter: true, logger: true },
      spanProcessors: ['BatchSpanProcessor'],
      metricReaders: ['PeriodicExportingMetricReader'],
      logProcessors: ['BatchLogRecordProcessor'],
      // The span exporter is the redacting wrapper (a plain object) around OTLP
      exporters: { traces: ['Object'], metrics: ['OTLPMetricExporter'], logs: ['OTLPLogExporter'] }
    });
    const bytes = exported();
    expect(bytes.traces).toBeGreaterThan(0);
    expect(bytes.metrics).toBeGreaterThan(0);
    expect(bytes.logs).toBeGreaterThan(0);
    expectProtobufOnly();
    expect(received['/v1/traces'].body).toContain('GET /ping');
    expect(received['/v1/traces'].body).not.toContain(SESSION_SECRET);
    expect(received['/v1/metrics'].body).toContain('switch.test.counter');
    expect(received['/v1/logs'].body).toContain('switch test log record');
  });

  it('OTEL_METRICS_EXPORTER=none: no meter provider or reader, nothing sent to /v1/metrics', async () => {
    useSink();
    const { registered, settings } = await run({ OTEL_METRICS_EXPORTER: 'none' });

    expect(describeTelemetry(settings)).toBe('traces=otlp metrics=none logs=otlp');
    expect(registered.providers).toEqual({ tracer: true, meter: false, logger: true });
    expect(registered.metricReaders).toEqual([]);
    expect(registered.spanProcessors).toEqual(['BatchSpanProcessor']);
    expect(registered.logProcessors).toEqual(['BatchLogRecordProcessor']);
    const bytes = exported();
    expect(bytes.metrics).toBe(0);
    expect(bytes.traces).toBeGreaterThan(0);
    expect(bytes.logs).toBeGreaterThan(0);
    expectProtobufOnly();
  });

  it('OTEL_LOGS_EXPORTER=none: a logger provider without processors, nothing sent to /v1/logs', async () => {
    useSink();
    const { registered, consoleLog } = await run({ OTEL_LOGS_EXPORTER: 'none' });

    expect(registered.providers).toEqual({ tracer: true, meter: true, logger: true });
    expect(registered.logProcessors).toEqual([]);
    expect(registered.spanProcessors).toEqual(['BatchSpanProcessor']);
    expect(registered.metricReaders).toEqual(['PeriodicExportingMetricReader']);
    const bytes = exported();
    expect(bytes.logs).toBe(0);
    expect(bytes.traces).toBeGreaterThan(0);
    expect(bytes.metrics).toBeGreaterThan(0);
    expectProtobufOnly();
    // The logger still writes to the console
    expect(consoleLog).toHaveBeenCalledWith('[INFO]', 'switch test log record');
  });

  it('OTEL_TRACES_EXPORTER=none: no tracer provider, no tracing plugin, nothing sent to /v1/traces', async () => {
    useSink();
    const { registered, plugin, tracerStarted } = await run({ OTEL_TRACES_EXPORTER: 'none' });

    expect(registered.providers).toEqual({ tracer: false, meter: true, logger: true });
    expect(registered.spanProcessors).toEqual([]);
    // The OpenTelemetry plugin would have started a NodeSDK of its own
    expect(plugin.config.name).toBe('otel-disabled');
    expect(tracerStarted).toBe(false);
    const bytes = exported();
    expect(bytes.traces).toBe(0);
    expect(bytes.metrics).toBeGreaterThan(0);
    expect(bytes.logs).toBeGreaterThan(0);
    expectProtobufOnly();
  });

  it('every exporter none: the SDK starts with nothing to export', async () => {
    useSink();
    const { registered, settings } = await run({
      OTEL_TRACES_EXPORTER: 'none',
      OTEL_METRICS_EXPORTER: 'none',
      OTEL_LOGS_EXPORTER: 'none'
    });

    expect(describeTelemetry(settings)).toBe('traces=none metrics=none logs=none');
    expect(registered).toMatchObject({
      providers: { tracer: false, meter: false, logger: true },
      spanProcessors: [],
      metricReaders: [],
      logProcessors: []
    });
    expect(received).toEqual({});
  });

  it('OTEL_SDK_DISABLED=true: no SDK at all, nothing sent', async () => {
    useSink();
    const { sdk, plugin, settings, tracerStarted } = await run({ OTEL_SDK_DISABLED: 'true' });

    expect(describeTelemetry(settings)).toBe('off (OTEL_SDK_DISABLED=true)');
    expect(sdk).toBeUndefined();
    expect(plugin.config.name).toBe('otel-disabled');
    expect(tracerStarted).toBe(false);
    expect(received).toEqual({});
  });

  it('no endpoint: no SDK at all', async () => {
    const { sdk, settings } = await run({});

    expect(describeTelemetry(settings)).toBe('off (no OTEL_EXPORTER_OTLP_ENDPOINT)');
    expect(sdk).toBeUndefined();
  });
});

// --- In-memory exporters ----------------------------------------------------

// The in-memory exporters drop what they hold on shutdown; keep it to assert on
class KeptSpanExporter extends InMemorySpanExporter {
  override shutdown() {
    return Promise.resolve();
  }
}
class KeptLogRecordExporter extends InMemoryLogRecordExporter {
  override async shutdown() {}
}

const inMemory = () => {
  const spans = new KeptSpanExporter();
  const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const logRecords = new KeptLogRecordExporter();
  const exporters: TelemetryExporters = {
    traces: () => spans,
    metrics: () => metricExporter,
    logs: () => logRecords
  };
  const exported = () => ({
    traces: spans.getFinishedSpans().length,
    metrics: metricExporter
      .getMetrics()
      .flatMap((resourceMetrics) => resourceMetrics.scopeMetrics)
      .flatMap((scope) => scope.metrics).length,
    logs: logRecords.getFinishedLogRecords().length
  });
  return { spans, exporters, exported };
};

describe('switches with in-memory exporters', () => {
  const ENDPOINT = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9' };

  it.each([
    ['nothing', {}, { traces: true, metrics: true, logs: true }],
    ['OTEL_TRACES_EXPORTER=none', { OTEL_TRACES_EXPORTER: 'none' }, { traces: false, metrics: true, logs: true }],
    ['OTEL_METRICS_EXPORTER=none', { OTEL_METRICS_EXPORTER: 'none' }, { traces: true, metrics: false, logs: true }],
    ['OTEL_LOGS_EXPORTER=none', { OTEL_LOGS_EXPORTER: 'none' }, { traces: true, metrics: true, logs: false }],
    ['OTEL_SDK_DISABLED=true', { OTEL_SDK_DISABLED: 'true' }, { traces: false, metrics: false, logs: false }]
  ] as const)('switching off %s exports exactly the other signals', async (_label, variables, expected) => {
    const memory = inMemory();
    await run({ ...ENDPOINT, ...variables }, memory.exporters);

    const counts = memory.exported();
    expect({ traces: counts.traces > 0, metrics: counts.metrics > 0, logs: counts.logs > 0 }).toEqual(expected);
  });

  it('exported spans keep the request summary but no credentials', async () => {
    const memory = inMemory();
    await run(ENDPOINT, memory.exporters);

    const spans = memory.spans.getFinishedSpans();
    // Child spans (one per lifecycle hook) end before the root span
    const root = spans.find((span) => span.attributes['http.request.method'] !== undefined);
    expect(root?.name).toBe('GET /ping');
    expect(root?.attributes['http.route']).toBe('/ping');
    for (const span of spans) {
      for (const key of SENSITIVE_SPAN_ATTRIBUTES) expect(span.attributes).not.toHaveProperty(key);
      expect(JSON.stringify(span.attributes)).not.toContain(SESSION_SECRET);
    }
  });
});
