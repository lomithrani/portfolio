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
import { env } from '../env';
import { SENSITIVE_SPAN_ATTRIBUTES, redactingSpanExporter } from '../instrumentation';
import { Domain, RateLimitCounter, User } from '../models/database';
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
    // Literal keys: toHaveProperty('http.request.body') would look for a nested path
    for (const span of spans) {
      expect(Object.keys(span.attributes).filter((key) => SENSITIVE_SPAN_ATTRIBUTES.includes(key))).toEqual([]);
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

  it('carry neither the résumé PDF nor the Anthropic API key of an import, the SDK spans included', async () => {
    const apiKey = 'sk-ant-api03-telemetry-test-key';
    const pdf = Buffer.from(`%PDF-1.7\n% telemetry-sentinel-${Date.now()}\n%%EOF\n`).toString('base64');
    const extractedTitle = `Telemetry Sentinel Engineer ${Date.now()}`;
    const savedKey = env.ANTHROPIC_API_KEY;
    env.ANTHROPIC_API_KEY = apiKey;
    try {
      // The caller owns a domain; the quota counters answer "first import"
      spyOn(Domain, 'exists').mockResolvedValue({ _id: 'domain' } as never);
      spyOn(RateLimitCounter, 'findOneAndUpdate').mockReturnValue({ lean: async () => ({ count: 1 }) } as never);
      const anthropicPaths: string[] = [];
      spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.origin !== 'https://api.anthropic.com') throw new Error(`Unexpected request to ${url}`);
        anthropicPaths.push(url.pathname);
        if (url.pathname === '/v1/messages/count_tokens') return Response.json({ input_tokens: 3_000 });
        return Response.json({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-5-5',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                experiences: [
                  {
                    type: 'professional',
                    title: extractedTitle,
                    company: '',
                    location: '',
                    start: '',
                    end: '',
                    current: true,
                    summary: '',
                    projects: []
                  }
                ],
                unplacedSkills: []
              })
            }
          ],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 3_000, output_tokens: 50 }
        });
      }) as typeof fetch);

      const body = JSON.stringify({ file: pdf, fileName: 'resume.pdf' });
      const result = await request('/experiences/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: await authCookie() },
        body
      });
      expect(result.status).toBe(200);
      expect(((await result.json()) as { experiences: { title: string }[] }).experiences[0].title).toBe(extractedTitle);
      expect(anthropicPaths).toEqual(['/v1/messages/count_tokens', '/v1/messages']);

      const spans = await exportedSpans();
      const exported = JSON.stringify(
        spans.map((span) => ({ name: span.name, attributes: span.attributes, events: span.events }))
      );
      expect(exported).not.toContain(pdf);
      expect(exported).not.toContain(apiKey);

      // The SDK traced both calls, metadata only (even if ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE says content)
      const sdkSpans = spans.filter((span) => span.attributes['gen_ai.provider.name'] !== undefined);
      expect(sdkSpans.map((span) => span.name).sort()).toEqual(['anthropic.messages.count_tokens', 'anthropic.messages.create']);
      const contentAttributes = ['gen_ai.input.messages', 'gen_ai.output.messages', 'gen_ai.system_instructions'];
      for (const span of sdkSpans) {
        expect(Object.keys(span.attributes).filter((key) => contentAttributes.includes(key))).toEqual([]);
      }
      // What Claude extracted is personal data too (content mode would export it)
      expect(exported).not.toContain(extractedTitle);

      // The handler emptied the body's file: the request span measured a few bytes, not the PDF
      const root = spans.find((span) => span.attributes['http.route'] === '/experiences/import');
      expect(root).toBeDefined();
      expect(Number(root!.attributes['http.request.body.size'])).toBeLessThan(pdf.length);
    } finally {
      env.ANTHROPIC_API_KEY = savedKey;
    }
  });
});
