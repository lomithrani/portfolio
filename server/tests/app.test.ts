import { describe, it, expect, afterEach, mock, spyOn } from 'bun:test';
import mongoose from 'mongoose';
import { metrics, trace, ProxyTracerProvider } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { createApp } from '../app';
import { env } from '../env';
import { httpRequestCounter, httpRequestDuration } from '../instrumentation';
import { makeRequest, readJson } from './helpers';

// Overrides mongoose.connection.readyState (a prototype getter) for one test
const setReadyState = (state: number) =>
  Object.defineProperty(mongoose.connection, 'readyState', { value: state, configurable: true });

describe('GET /health', () => {
  afterEach(() => {
    delete (mongoose.connection as unknown as Record<string, unknown>).readyState;
  });

  it('returns 200 OK when MongoDB is connected', async () => {
    setReadyState(1);

    const result = await makeRequest(createApp(), '/health');

    expect(result.status).toBe(200);
    expect(await result.text()).toBe('OK');
  });

  it.each([0, 2, 3])('returns 503 when MongoDB is not connected (readyState %d)', async (state) => {
    setReadyState(state);

    const result = await makeRequest(createApp(), '/health');

    expect(result.status).toBe(503);
  });
});

describe('CORS', () => {
  const preflight = (origin: string) =>
    makeRequest(createApp(), '/experiences', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type,traceparent'
      }
    });

  it('allows the configured origins with credentials', async () => {
    const origin = env.ALLOWED_DOMAINS[0];
    const result = await preflight(origin);

    expect(result.headers.get('access-control-allow-origin')).toBe(origin);
    expect(result.headers.get('access-control-allow-credentials')).toBe('true');
    expect(result.headers.get('access-control-allow-methods')).toContain('DELETE');
    expect(result.headers.get('access-control-allow-headers')).toContain('traceparent');
    expect(Number(result.headers.get('access-control-max-age'))).toBeGreaterThanOrEqual(600);
  });

  it('does not allow other origins', async () => {
    const result = await preflight('https://evil.example.com');

    expect(result.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('OpenAPI docs', () => {
  it('are served outside production', async () => {
    const result = await makeRequest(createApp(), '/swagger/json');

    expect(result.status).toBe(200);
    expect((await readJson(result)).paths['/domain/{name}']).toBeDefined();
  });
});

describe('HTTP metrics', () => {
  afterEach(() => {
    mock.restore();
  });

  it('records a real duration for unmatched routes too', async () => {
    const record = spyOn(httpRequestDuration, 'record');
    const add = spyOn(httpRequestCounter, 'add');

    const result = await makeRequest(createApp(), '/wp-admin/setup.php');
    expect(result.status).toBe(404);
    // onAfterResponse runs once the response has been sent
    await Bun.sleep(10);

    expect(add).toHaveBeenCalledWith(1, { method: 'GET', route: 'unmatched' });
    // (other tests' requests may land in the spy too)
    const call = record.mock.calls.find(([, attributes]) => attributes?.route === 'unmatched');
    expect(call).toBeDefined();
    const duration = call![0];
    expect(Number.isFinite(duration)).toBe(true);
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});

describe('telemetry without OTEL_EXPORTER_OTLP_ENDPOINT', () => {
  it('registers no SDK, so nothing is exported (e.g. to localhost:4318)', async () => {
    // tests/setup.ts clears OTEL_* (even when server/.env sets them)
    expect(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    // Serve a request so every lazy code path has run
    await makeRequest(createApp(), '/health');

    const tracerProvider = trace.getTracerProvider() as ProxyTracerProvider;
    expect(tracerProvider).toBeInstanceOf(ProxyTracerProvider);
    // A registered SDK would be the delegate; none means spans are no-ops
    expect(tracerProvider.getDelegateTracer('check')).toBeUndefined();
    const loggerProvider = logs.getLoggerProvider() as unknown as {
      _getDelegateLogger(name: string): unknown;
    };
    expect(loggerProvider._getDelegateLogger('check')).toBeUndefined();
    expect(metrics.getMeterProvider().constructor.name).toBe('NoopMeterProvider');
  });
});
