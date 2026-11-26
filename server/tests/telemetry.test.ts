// What the trace exporter receives when telemetry is on. Requests go through
// the real Elysia OpenTelemetry plugin and the app's routes; spans land in an
// in-memory exporter behind the span processors production uses (redaction,
// then the batch queue, whose exporter is the redacting wrapper).
import { describe, it, expect, beforeAll, afterAll, afterEach, mock, spyOn } from 'bun:test';
import { Elysia } from 'elysia';
import { opentelemetry } from '@elysiajs/opentelemetry';
import { context, trace } from '@opentelemetry/api';
import {
  BatchSpanProcessor,
  InMemorySpanExporter,
  StackContextManager,
  TracerProvider
} from '@opentelemetry/sdk-trace';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import { createApp } from '../app';
import { env } from '../env';
import { SENSITIVE_SPAN_ATTRIBUTES, createSpanProcessors } from '../instrumentation';
import { Domain, RateLimitCounter, User } from '../models/database';
import { allowTestUserSessions, authCookie, makeUser, messageStream, parseCookie, signGoogleIdToken, useTestGoogleKeys } from './helpers';

let memory: InMemorySpanExporter;
let provider: TracerProvider;
let app: Elysia;

beforeAll(() => {
  memory = new InMemorySpanExporter();
  provider = new TracerProvider({ spanProcessors: createSpanProcessors(memory) });
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

/** Literal keys: toHaveProperty('http.request.body') would look for a nested path */
const sensitiveKeysOf = (attributes: object) =>
  Object.keys(attributes).filter((key) => SENSITIVE_SPAN_ATTRIBUTES.includes(key));

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
    spyOn(Domain, 'findOne').mockResolvedValue(null as never);
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
    for (const span of spans) expect(sensitiveKeysOf(span.attributes)).toEqual([]);

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

  it("keep the header that marks the web server's render of a page, which the dashboards leave out", async () => {
    // client/src/routes/[domain]/hire/+page.server.ts sends it; docs/grafana counts browsers only
    await request('/isLogged', { headers: { 'x-portfolio-render': 'server' } });
    await request('/isLogged');
    const marks = (await exportedSpans())
      .filter((span) => span.attributes['http.request.method'] !== undefined)
      .map((span) => span.attributes['http.request.header.x-portfolio-render'] ?? 'none')
      .sort();
    expect(marks).toEqual(['none', 'server']);
  });

  it('lose bodies, cookies and credentials before the batch queue: queued spans never hold them', async () => {
    useTestGoogleKeys();
    // What each span holds when the batch processor queues it (until the next export)
    const queued: { name: string; sensitive: string[]; bodySize: unknown }[] = [];
    const onEnd = BatchSpanProcessor.prototype.onEnd;
    spyOn(BatchSpanProcessor.prototype, 'onEnd').mockImplementation(function (this: BatchSpanProcessor, span: ReadableSpan) {
      queued.push({
        name: span.name,
        sensitive: sensitiveKeysOf(span.attributes),
        bodySize: span.attributes['http.request.body.size']
      });
      return onEnd.call(this, span);
    });

    spyOn(User, 'findById').mockResolvedValue(makeUser() as never);
    spyOn(User, 'findOne').mockResolvedValue(makeUser() as never);
    spyOn(Domain, 'findOne').mockResolvedValue(null as never);
    const body = JSON.stringify({ token: await signGoogleIdToken() });
    const login = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: await authCookie(), Authorization: 'Bearer abc' },
      body
    });
    expect(login.status).toBe(200);
    await exportedSpans();

    const root = queued.find((span) => span.name === 'POST /login');
    // The body was traced (its size is kept), then dropped as the span ended
    expect(root).toEqual({ name: 'POST /login', sensitive: [], bodySize: body.length });
    expect(queued.flatMap((span) => span.sensitive)).toEqual([]);
  });

  it('carry no query string, nor an address typed in the address search', async () => {
    allowTestUserSessions();
    spyOn(User, 'findById').mockResolvedValue(makeUser() as never);
    spyOn(User, 'findOne').mockResolvedValue(makeUser() as never);
    spyOn(Domain, 'findOne').mockResolvedValue(null as never);
    const cookie = await authCookie();
    const travelTimes = env.commuteTimesEnabled;
    // Off: the search answers without the database or the map service
    env.commuteTimesEnabled = false;
    try {
      // A query string, on any route: dropped
      expect((await request('/isLogged?from=7%20impasse%20du%20Secret', { headers: { Cookie: cookie } })).status).toBe(200);
      // The address search: a body, dropped like every body
      const search = await request('/addresses/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ q: '7 impasse du Secret', city: 'Villesecrète' })
      });
      expect(search.status).toBe(200);
      const office = await request('/addresses/office', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ address: '7 impasse du Secret', city: 'Villesecrète' })
      });
      expect(office.status).toBe(200);
    } finally {
      env.commuteTimesEnabled = travelTimes;
    }

    const spans = await exportedSpans();
    const exported = JSON.stringify(spans.map((span) => ({ name: span.name, attributes: span.attributes, events: span.events })));
    expect(exported).not.toMatch(/secret|villesecr/i);
    for (const span of spans) expect(sensitiveKeysOf(span.attributes)).toEqual([]);
    const roots = spans.filter((span) => span.attributes['http.request.method'] !== undefined);
    expect(roots.map((span) => span.attributes['url.full']).sort()).toEqual([
      'http://localhost/addresses/office',
      'http://localhost/addresses/search',
      'http://localhost/isLogged'
    ]);
    expect(roots.map((span) => span.attributes['url.query'])).toEqual([undefined, undefined, undefined]);
  });

  it('carry neither the résumé PDF nor the Anthropic API key of an import, the SDK spans included', async () => {
    const apiKey = 'sk-ant-api03-telemetry-test-key';
    const pdf = Buffer.from(`%PDF-1.7\n% telemetry-sentinel-${Date.now()}\n%%EOF\n`).toString('base64');
    const extractedTitle = `Telemetry Sentinel Engineer ${Date.now()}`;
    const savedKey = env.ANTHROPIC_API_KEY;
    env.ANTHROPIC_API_KEY = apiKey;
    try {
      // The caller (the unsaved test user) owns a domain; the quota counters answer "first import"
      allowTestUserSessions();
      spyOn(Domain, 'exists').mockResolvedValue({ _id: 'domain' } as never);
      spyOn(RateLimitCounter, 'findOneAndUpdate').mockReturnValue({ lean: async () => ({ count: 1 }) } as never);
      const anthropicPaths: string[] = [];
      spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.origin !== 'https://api.anthropic.com') throw new Error(`Unexpected request to ${url}`);
        anthropicPaths.push(url.pathname);
        if (url.pathname === '/v1/messages/count_tokens') return Response.json({ input_tokens: 3_000 });
        // The paid call is streamed
        return messageStream({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5-5',
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
