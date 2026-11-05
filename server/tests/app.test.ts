import { describe, it, expect, afterEach, mock, spyOn } from 'bun:test';
import mongoose from 'mongoose';
import { metrics, trace, ProxyTracerProvider } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { createApp } from '../app';
import { env } from '../env';
import { httpRequestCounter, httpRequestDuration } from '../instrumentation';
import { google } from '../services/google';
import { logger } from '../services/logger';
import { afterResponseHooks, authCookie, makeRequest, readJson, useTestGoogleKeys } from './helpers';

// Overrides mongoose.connection.readyState (a prototype getter) for one test
const setReadyState = (state: number) =>
  Object.defineProperty(mongoose.connection, 'readyState', { value: state, configurable: true });

// onAfterResponse (the HTTP metrics) runs after the response is returned: wait
// until the expected call is in (up to ~1 s) instead of assuming it lands
// within one tick. The assertions that follow still decide.
const waitUntil = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) await Bun.sleep(10);
};

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

  it('lets the browser read Retry-After (429s of the booking rate limits)', async () => {
    const result = await makeRequest(createApp(), '/health', { headers: { Origin: env.ALLOWED_DOMAINS[0] } });

    expect(result.headers.get('access-control-expose-headers')).toBe('Retry-After');
  });

  it('does not allow other origins', async () => {
    const result = await preflight('https://evil.example.com');

    expect(result.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('request bodies', () => {
  afterEach(() => {
    mock.restore();
  });

  // What an HTML form on another site can send without a CORS preflight
  it.each([
    ['POST', '/experiences', 'multipart/form-data; boundary=x'],
    ['POST', '/domain/claim', 'application/x-www-form-urlencoded'],
    ['PUT', '/domain/jane.doe', 'text/plain;charset=UTF-8'],
    ['POST', '/login', 'text/plain']
  ])('answers 415 to %s %s with %s, before any handler', async (method, path, contentType) => {
    const verifyIdToken = spyOn(google, 'verifyIdToken');

    const result = await makeRequest(createApp(), path, {
      method,
      headers: { 'Content-Type': contentType, Cookie: await authCookie() },
      body: 'name=x'
    });

    expect(result.status).toBe(415);
    expect(await result.text()).toBe('Unsupported Media Type');
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('logs and counts rejected non-JSON requests like any other 4xx', async () => {
    const cookie = await authCookie();
    // An earlier test's late POST must not land in the spy and stand in for this one
    await afterResponseHooks();
    const warn = spyOn(logger, 'warn');
    const add = spyOn(httpRequestCounter, 'add');

    const result = await makeRequest(createApp(), '/experiences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
      body: 'title=x'
    });
    await waitUntil(() => add.mock.calls.some(([, attributes]) => attributes?.method === 'POST'));

    expect(result.status).toBe(415);
    expect(warn).toHaveBeenCalledWith('Unsupported Media Type', expect.objectContaining({ status: 415, method: 'POST' }));
    expect(add).toHaveBeenCalledWith(1, expect.objectContaining({ method: 'POST' }));
  });

  describe('size', () => {
    const MB = 1024 * 1024;

    /** A JSON POST whose Content-Length is `bytes`, as a browser sends it (a Request built in code has none) */
    const postOfSize = (path: string, bytes: number, headers: Record<string, string> = {}) => {
      // {"title":""} is 12 characters
      const body = JSON.stringify({ title: 'x'.repeat(bytes - 12) });
      expect(body.length).toBe(bytes);
      return makeRequest(createApp(), path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(bytes), ...headers },
        body
      });
    };

    it('answers 413 above 1 MB, before any handler, with the CORS headers', async () => {
      const origin = env.ALLOWED_DOMAINS[0];
      const verifyIdToken = spyOn(google, 'verifyIdToken');

      for (const path of ['/experiences', '/login', '/domain/claim']) {
        const result = await postOfSize(path, MB + 1, { Origin: origin, Cookie: await authCookie() });
        expect({ path, status: result.status }).toEqual({ path, status: 413 });
        expect(await result.text()).toBe('Payload Too Large');
        expect(result.headers.get('access-control-allow-origin')).toBe(origin);
      }
      expect(verifyIdToken).not.toHaveBeenCalled();
    });

    it('lets 1 MB through to the route', async () => {
      // No session: the route's own 401, not the size guard's 413
      expect((await postOfSize('/experiences', MB)).status).toBe(401);
    });

    /** A body that records whether anything read it (pulled only on read) */
    const watchedBody = (bytes: number) => {
      const watch = { read: 0 };
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            const chunk = Math.min(64 * 1024, bytes - watch.read);
            if (chunk <= 0) return controller.close();
            controller.enqueue(new Uint8Array(chunk).fill(0x20));
            watch.read += chunk;
          }
        },
        { highWaterMark: 0 }
      );
      return { stream, watch };
    };

    /** A JSON POST without Content-Length (chunked, as a proxy or an HTTP/2 client may forward it) */
    const streamedPost = (path: string, body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) =>
      createApp().fetch(
        new Request(`http://localhost${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body,
          duplex: 'half'
        } as RequestInit)
      );

    it('answers 413 to a body over 1 MB sent without Content-Length, reading no more than 1 MB of it', async () => {
      const origin = env.ALLOWED_DOMAINS[0];
      const verifyIdToken = spyOn(google, 'verifyIdToken');

      for (const path of ['/login', '/experiences']) {
        const { stream, watch } = watchedBody(8 * MB);
        const result = await streamedPost(path, stream, { Origin: origin });
        expect({ path, status: result.status }).toEqual({ path, status: 413 });
        expect(await result.text()).toBe('Payload Too Large');
        expect(result.headers.get('access-control-allow-origin')).toBe(origin);
        expect(watch.read).toBeLessThanOrEqual(MB + 64 * 1024);
      }
      expect(verifyIdToken).not.toHaveBeenCalled();
    });

    it('reads a body of exactly 1 MB sent without Content-Length, and refuses invalid JSON with 400', async () => {
      // {"title":""} is 12 characters; no session: the route's own 401
      const body = new TextEncoder().encode(JSON.stringify({ title: 'x'.repeat(MB - 12) }));
      const exact = await streamedPost('/experiences', new Blob([body]).stream());
      expect(exact.status).toBe(401);

      const invalid = await streamedPost('/login', new Blob(['{"token":']).stream());
      expect(invalid.status).toBe(400);
      expect(await invalid.text()).toBe('Bad Request');
    });

    it('refuses the résumé import without a session cookie before reading its body, with the CORS headers', async () => {
      const origin = env.ALLOWED_DOMAINS[0];
      const { stream, watch } = watchedBody(5 * MB);

      const result = await streamedPost('/experiences/import', stream, { Origin: origin, Cookie: 'other=1; auth=' });
      expect(result.status).toBe(401);
      expect(await result.text()).toBe('Unauthorized');
      expect(result.headers.get('access-control-allow-origin')).toBe(origin);
      expect(watch.read).toBe(0);
    });

    it('lets the résumé import (a base64 PDF) above 1 MB through to its route', async () => {
      // An invalid session: the route's own 401, once the body is read
      expect((await postOfSize('/experiences/import', 5 * MB, { Cookie: 'auth=invalid' })).status).toBe(401);
      const chunked = new Blob([JSON.stringify({ file: 'x'.repeat(5 * MB) })]).stream();
      expect((await streamedPost('/experiences/import', chunked, { Cookie: 'auth=invalid' })).status).toBe(401);
      // Only POST: another method on that path keeps the 1 MB cap
      const put = await makeRequest(createApp(), '/experiences/import', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(MB + 1) },
        body: '{}'
      });
      expect(put.status).toBe(413);
    });

    it('logs and counts the 413 like any other 4xx, without the body', async () => {
      await afterResponseHooks();
      const warn = spyOn(logger, 'warn');

      const result = await postOfSize('/experiences', 2 * MB);

      expect(result.status).toBe(413);
      expect(warn).toHaveBeenCalledWith('Payload Too Large', expect.objectContaining({ status: 413, method: 'POST' }));
      expect(JSON.stringify(warn.mock.calls).length).toBeLessThan(1_000);
    });
  });

  it('lets JSON (with parameters) and body-less requests through', async () => {
    useTestGoogleKeys();

    const json = await makeRequest(createApp(), '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ token: 'not-a-jwt' })
    });
    expect(json.status).toBe(401);

    // No Content-Type: reaches the route, which then wants a session
    const bodyless = await makeRequest(createApp(), '/experiences', { method: 'POST' });
    expect(bodyless.status).toBe(401);
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
    // domain.test.ts requests the same path: its late hooks must not count here
    await afterResponseHooks();
    const record = spyOn(httpRequestDuration, 'record');
    const add = spyOn(httpRequestCounter, 'add');

    const result = await makeRequest(createApp(), '/wp-admin/setup.php');
    expect(result.status).toBe(404);
    // The hook counts the request, then records its duration
    await waitUntil(() => record.mock.calls.some(([, attributes]) => attributes?.route === 'unmatched'));

    expect(add).toHaveBeenCalledWith(1, { method: 'GET', route: 'unmatched' });
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
