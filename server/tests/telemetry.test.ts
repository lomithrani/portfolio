// What the trace exporter receives when telemetry is on. Requests go through
// the real Elysia OpenTelemetry plugin and the app's routes; spans land in an
// in-memory exporter behind the same redacting wrapper production uses.
import { describe, it, expect, beforeAll, afterAll, afterEach, mock, spyOn } from 'bun:test';
import { Elysia } from 'elysia';
import { opentelemetry } from '@elysiajs/opentelemetry';
import { context, trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  StackContextManager,
  TracerProvider
} from '@opentelemetry/sdk-trace';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import { createApp } from '../app';
import { SENSITIVE_SPAN_ATTRIBUTES, redactingSpanExporter } from '../instrumentation';
import { User } from '../models/database';
import { authCookie, makeUser, parseCookie, signGoogleIdToken, useTestGoogleKeys } from './helpers';

let memory: InMemorySpanExporter;
let provider: TracerProvider;
let app: Elysia;

beforeAll(() => {
  memory = new InMemorySpanExporter();
  provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: redactingSpanExporter(memory) })]
  });
  // Registered before the plugin is created, so it uses this provider
  // instead of starting its own SDK
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(new StackContextManager().enable());
  app = new Elysia().use(opentelemetry({ serviceName: 'test' })).use(createApp()) as unknown as Elysia;
});

afterAll(async () => {
  await provider.shutdown();
  // Back to the no-op API for the other test files
  trace.disable();
  context.disable();
});

afterEach(() => {
  mock.restore();
  memory.reset();
});

/** Spans exported so far (root spans end after the response is sent) */
const exportedSpans = async (): Promise<ReadableSpan[]> => {
  await Bun.sleep(20);
  await provider.forceFlush();
  return memory.getFinishedSpans();
};

const request = (path: string, init: RequestInit = {}) =>
  app.handle(new Request(`http://localhost${path}`, init));

describe('exported spans', () => {
  it('carry no session cookie, Google ID token or body, but keep the request summary', async () => {
    useTestGoogleKeys();
    spyOn(User, 'findById').mockResolvedValue(makeUser() as never);
    spyOn(User, 'findOne').mockResolvedValue(makeUser() as never);
    const cookie = await authCookie();
    const sessionJwt = cookie.slice('auth='.length);
    const googleToken = await signGoogleIdToken();
    const sentinel = 'eyJGOOGLE-ID-TOKEN-SENTINEL.payload.sig';

    const isLogged = await request('/isLogged', { headers: { Cookie: cookie } });
    expect(isLogged.status).toBe(200);
    const login = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ token: googleToken })
    });
    expect(login.status).toBe(200);
    const issuedJwt = parseCookie(login.headers.get('Set-Cookie') ?? '')['auth'];
    expect(issuedJwt).toStartWith('ey');
    const rejected = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionJwt}` },
      body: JSON.stringify({ token: sentinel })
    });
    expect(rejected.status).toBe(401);

    const spans = await exportedSpans();
    const exported = JSON.stringify(
      spans.map((span) => ({ name: span.name, attributes: span.attributes, events: span.events }))
    );
    for (const secret of [sessionJwt, googleToken, sentinel, issuedJwt, 'test@gmail.com']) {
      expect(exported).not.toContain(secret);
    }
    for (const span of spans) {
      for (const key of SENSITIVE_SPAN_ATTRIBUTES) expect(span.attributes).not.toHaveProperty(key);
    }

    // One root span per request (they end in any order)
    const summaries = spans
      .filter((span) => span.attributes['http.request.method'] !== undefined)
      .map(({ name, attributes }) => ({
        name,
        method: attributes['http.request.method'],
        route: attributes['http.route'],
        status: attributes['http.response.status_code'],
        contentType: attributes['http.request.header.content-type']
      }))
      .sort((a, b) => `${a.name}${a.status}`.localeCompare(`${b.name}${b.status}`));
    expect(summaries).toEqual([
      { name: 'GET /isLogged', method: 'GET', route: '/isLogged', status: 200, contentType: undefined },
      { name: 'POST /login', method: 'POST', route: '/login', status: 200, contentType: 'application/json' },
      { name: 'POST /login', method: 'POST', route: '/login', status: 401, contentType: 'application/json' }
    ]);
  });
});
