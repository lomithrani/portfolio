// Job description import against a real MongoDB (MONGO_URL, which must be
// local or come from TEST_MONGO_URL): the plan's imports live on the user and
// the daily quotas are MongoDB counters. Claude is faked at the fetch layer:
// the real @anthropic-ai/sdk client builds every request, so the key and the
// PDF really go to api.anthropic.com, and nowhere else (no response, no log
// line). Each test creates its own users and counts on a site-wide quota key
// of its own, all named with a suffix unique to that test, and removes them
// after: tests pass in any order (--randomize).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose from 'mongoose';
import { Elysia } from 'elysia';
import { treaty } from '@elysiajs/eden';
import { opentelemetry } from '@elysiajs/opentelemetry';
import { context, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, StackContextManager, TracerProvider } from '@opentelemetry/sdk-trace';
import { SignJWT } from 'jose';
import { env } from '../env';
import { createApp } from '../app';
import { SENSITIVE_SPAN_ATTRIBUTES, createSpanProcessors } from '../instrumentation';
import { RateLimitCounter, User } from '../models/database';
import { JOB_EXTRACTION_SCHEMA } from '../services/jobExtraction';
import {
  JOB_IMPORT_DAILY_WINDOW_MS,
  JOB_IMPORT_MAX_OUTPUT_TOKENS,
  JOB_IMPORT_MODEL,
  MAX_JOB_INPUT_TOKENS,
  MAX_JOB_PDF_BYTES,
  jobImportAttemptsKey,
  jobImportCounters,
  jobImportTimeouts
} from '../services/jobImport';
import { logger } from '../services/logger';
import { peekRateLimit } from '../services/rateLimit';
import { enableRecruiterSpace } from '../services/recruiters';
import { authCookie, messageStream, messageStreamEvents, sseResponse } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `ji-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

/** Never a real key: tests/setup.ts removes ANTHROPIC_API_KEY, and fetch is faked */
const TEST_API_KEY = 'sk-ant-api03-job-import-test-key-0123456789';

/** A small PDF whose base64 is distinctive enough to search for */
const pdfBase64 = (marker: string) =>
  Buffer.from(`%PDF-1.7\n% ${marker}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`).toString('base64');

// ── Fake Claude API ─────────────────────────────────────────

interface ClaudeRequest {
  path: string;
  headers: Headers;
  body: Record<string, any>;
}

/** An answer of the fake API; `signal` is the fetch's (the SDK aborts it on a timeout or a deadline) */
type Answer = (signal: AbortSignal) => Response | Promise<Response>;

/** A Messages API error body, as Anthropic sends it; retry-after-ms 0 keeps the SDK's retry instant */
const apiError = (status: number, type: string, message: string): Answer => () =>
  Response.json(
    { type: 'error', error: { type, message }, request_id: 'req_error' },
    { status, headers: { 'request-id': 'req_error', 'retry-after-ms': '0' } }
  );

const connectionFailure: Answer = () => {
  throw new TypeError('fetch failed');
};

const usage = { input_tokens: 4_200, output_tokens: 1_800, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

/** A message of Claude Haiku 5.5, streamed: thinking first, then the JSON text */
const message = (text: string, overrides: Record<string, unknown> = {}) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: JOB_IMPORT_MODEL,
  content: [
    { type: 'thinking', thinking: '', signature: 'sig' },
    { type: 'text', text }
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  stop_details: null,
  usage,
  ...overrides
});

const streamed = (text: string, overrides: Record<string, unknown> = {}): Answer => () => messageStream(message(text, overrides));

/** The first event of a streamed message: the model has started */
const messageStart = () => messageStreamEvents(message('')).slice(0, 1);

// Paid calls that fail once the request was sent: the model may have run
/** No answer at all until the deadline */
const noAnswer: Answer = (signal) =>
  new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')), {
      once: true
    });
  });
/** The answer starts, then stalls until the deadline */
const stalledStream: Answer = (signal) => sseResponse(messageStart(), signal);
/** The answer starts, then the stream reports an error (after its 200) */
const streamError: Answer = () =>
  sseResponse([...messageStart(), { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]);

const extraction = (output: unknown) => streamed(JSON.stringify(output));

/** An output where the document stated nothing */
const BLANK = {
  title: '',
  company: '',
  description: '',
  city: '',
  postalCode: '',
  country: '',
  workMode: '',
  remoteDaysPerWeek: '',
  contractType: '',
  durationMonths: '',
  startDate: '',
  trialPeriodMonths: '',
  collectiveAgreement: '',
  workingTimeArrangement: '',
  hoursPerWeek: '',
  daysPerYear: '',
  rttDaysPerYear: '',
  payMin: '',
  payMax: '',
  payPeriod: '',
  payVariable: '',
  openings: '',
  directReports: '',
  peers: '',
  levelsToCeo: '',
  seniority: '',
  education: '',
  skills: [],
  languages: [],
  benefits: [],
  travel: ''
};

const ONE_JOB = {
  ...BLANK,
  title: 'Développeur Back-end',
  company: 'Acme',
  description: '## Mission\n\n- Construire la facturation',
  city: 'Lyon',
  country: 'France',
  workMode: 'on_site',
  contractType: 'cdi',
  workingTimeArrangement: 'weekly_hours',
  hoursPerWeek: '35',
  payMin: '45000',
  payMax: '55000',
  payPeriod: 'year'
};

const createFakeClaude = () => {
  const state = {
    requests: [] as ClaudeRequest[],
    /** Next answers of count_tokens / messages, in order; then the defaults below */
    counts: [] as Answer[],
    messages: [] as Answer[],
    inputTokens: 4_200,
    output: ONE_JOB as unknown
  };

  const install = () =>
    spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      const signal = init?.signal ?? request.signal;
      const url = new URL(request.url);
      if (url.origin !== 'https://api.anthropic.com') throw new Error(`Unexpected request to ${request.method} ${url}`);
      state.requests.push({ path: url.pathname, headers: request.headers, body: JSON.parse(await request.text()) });
      if (url.pathname === '/v1/messages/count_tokens') {
        return (state.counts.shift() ?? (() => Response.json({ input_tokens: state.inputTokens })))(signal);
      }
      if (url.pathname === '/v1/messages') return (state.messages.shift() ?? extraction(state.output))(signal);
      return apiError(404, 'not_found_error', 'Not found')(signal);
    }) as typeof fetch);

  const paths = () => state.requests.map((request) => request.path);
  return { state, install, paths };
};

let claude: ReturnType<typeof createFakeClaude>;

// ── API calls and logs, all recorded ────────────────────────

interface Recorded {
  label: string;
  /** Status, headers and body as sent, or a log call's arguments */
  text: string;
}

const responses: Recorded[] = [];
const logLines: Recorded[] = [];
let app: ReturnType<typeof createApp>;

const call = async (method: string, path: string, { body, cookie }: { body?: unknown; cookie?: string } = {}) => {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  const text = body === undefined ? undefined : JSON.stringify(body);
  if (text !== undefined) {
    headers['Content-Type'] = 'application/json';
    // What a browser sends (a Request built in code has none): the 1 MB guard reads it
    headers['Content-Length'] = String(Buffer.byteLength(text));
  }
  const response = await app.fetch(new Request(`http://localhost${path}`, { method, headers, body: text }));
  const responseText = await response.text();
  responses.push({
    label: `${method} ${path}`,
    text: `${response.status} ${JSON.stringify([...response.headers])}\n${responseText}`
  });
  return {
    status: response.status,
    text: responseText,
    headers: response.headers,
    json: <T = any>() => JSON.parse(responseText) as T
  };
};

/** POST /jobs/import of `file` as the test's recruiter */
const importFile = (file: string, extra: Record<string, unknown> = {}, cookie = recruiter.cookie) =>
  call('POST', '/jobs/import', { body: { file, ...extra }, cookie });

const status = (cookie = recruiter.cookie) => call('GET', '/jobs/import', { cookie });

/** A user of this test, with a session; a recruiter space unless `space` is false */
const createUser = async (name: string, { space = true, jobImportsUsed = 0 } = {}) => {
  const user = await User.create({ email: t.email(name) });
  const userId = user._id.toString();
  userIds.push(userId);
  if (space) {
    expect(await enableRecruiterSpace(userId)).toBe(true);
    if (jobImportsUsed) await User.updateOne({ _id: userId }, { $set: { 'recruiter.jobImportsUsed': jobImportsUsed } });
  }
  return { userId, cookie: await authCookie(userId) };
};

/** Removes what a test created: its users and the quota counters it used */
const removeTestData = async (suffix: string, ids: string[]) => {
  const counterKeys = [jobImportCounters.globalKey, ...ids.map((userId) => jobImportAttemptsKey(userId))];
  await RateLimitCounter.deleteMany({ _id: { $regex: `^(${counterKeys.join('|')}):` } });
  await User.deleteMany({ email: new RegExp(`-${suffix}@`) });
};

/** Every recorded response and log call that contains the key or the test's PDF */
const leaks = (recorded: Recorded[], secrets: string[]) =>
  recorded.flatMap(({ label, text }) => secrets.filter((secret) => text.includes(secret)).map(() => label));

let t: ReturnType<typeof testNames>;
let recruiter: { cookie: string; userId: string };
/** This test's PDF (base64) */
let pdf: string;
let userIds: string[];
let firstResponse = 0;
let firstLogLine = 0;
const saved = {
  key: env.ANTHROPIC_API_KEY,
  daily: env.JOB_IMPORT_DAILY_LIMIT,
  attempts: env.JOB_IMPORT_ATTEMPTS_PER_DAY,
  globalKey: jobImportCounters.globalKey,
  timeouts: { ...jobImportTimeouts }
};
let connected = false;

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([User.init(), RateLimitCounter.init()]);
});

afterAll(async () => {
  env.ANTHROPIC_API_KEY = saved.key;
  env.JOB_IMPORT_DAILY_LIMIT = saved.daily;
  env.JOB_IMPORT_ATTEMPTS_PER_DAY = saved.attempts;
  jobImportCounters.globalKey = saved.globalKey;
  Object.assign(jobImportTimeouts, saved.timeouts);
  if (connected) await mongoose.disconnect();
});

beforeEach(async () => {
  t = testNames();
  firstResponse = responses.length;
  firstLogLine = logLines.length;
  userIds = [];
  env.ANTHROPIC_API_KEY = TEST_API_KEY;
  env.JOB_IMPORT_DAILY_LIMIT = 30;
  env.JOB_IMPORT_ATTEMPTS_PER_DAY = 10;
  Object.assign(jobImportTimeouts, saved.timeouts);
  jobImportCounters.globalKey = `job-import:global:${t.id('test')}`;
  app = createApp();
  // Every log call, to check that neither the key nor the PDF is ever written
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    const original = logger[level];
    spyOn(logger, level).mockImplementation((text, attributes) => {
      logLines.push({ label: `logger.${level}(${text})`, text: `${text} ${JSON.stringify(attributes ?? {})}` });
      original(text, attributes);
    });
  }
  claude = createFakeClaude();
  claude.install();
  pdf = pdfBase64(`job-${t.suffix}`);
  recruiter = await createUser('recruiter');
});

afterEach(async () => {
  mock.restore();
  const secrets = [TEST_API_KEY, pdf];
  const leaked = [...leaks(responses.slice(firstResponse), secrets), ...leaks(logLines.slice(firstLogLine), secrets)];
  if (connected) await removeTestData(t.suffix, userIds);
  expect(leaked).toEqual([]);
});

/** Imports counted on the recruiter's plan (User.recruiter.jobImportsUsed) */
const planUsed = async (userId = recruiter.userId) =>
  (await User.findById(userId, { recruiter: 1 }).lean())?.recruiter?.jobImportsUsed;
const siteCount = async () =>
  (await peekRateLimit(jobImportCounters.globalKey, { windowMs: JOB_IMPORT_DAILY_WINDOW_MS })).count;
const attemptCount = async (userId = recruiter.userId) =>
  (await peekRateLimit(jobImportAttemptsKey(userId), { windowMs: JOB_IMPORT_DAILY_WINDOW_MS })).count;

const dayEnd = () => new Date((Math.floor(Date.now() / JOB_IMPORT_DAILY_WINDOW_MS) + 1) * JOB_IMPORT_DAILY_WINDOW_MS).toISOString();

/** Sets the site's count of the day, as if other recruiters had imported */
const setSiteCount = async (count: number) => {
  const day = Math.floor(Date.now() / JOB_IMPORT_DAILY_WINDOW_MS) * JOB_IMPORT_DAILY_WINDOW_MS;
  await RateLimitCounter.updateOne(
    { _id: `${jobImportCounters.globalKey}:${day}` },
    { $set: { count, expiresAt: new Date(day + JOB_IMPORT_DAILY_WINDOW_MS) } },
    { upsert: true }
  );
};

const PLAN_USED_UP = 'You have used the 3 job description imports included in the free plan. Paid plans are coming soon.';
const UNAVAILABLE = 'Job description import is temporarily unavailable, try again later';

describe('availability', () => {
  it('requires a session', async () => {
    expect((await call('GET', '/jobs/import')).status).toBe(401);
    expect((await call('POST', '/jobs/import', { body: { file: pdf } })).status).toBe(401);
    expect(claude.state.requests).toHaveLength(0);
  });

  it('requires a recruiter space (403), before reading the file or counting anything', async () => {
    const candidate = await createUser('candidate', { space: false });

    const read = await status(candidate.cookie);
    expect(read.status).toBe(403);
    expect(read.text).toBe('Create your recruiter space first');
    for (const file of [pdf, 'not base64!']) {
      const result = await importFile(file, {}, candidate.cookie);
      expect(result.status).toBe(403);
      expect(result.text).toBe('Create your recruiter space first');
    }
    expect(claude.state.requests).toHaveLength(0);
    expect(await siteCount()).toBe(0);
    expect(await attemptCount(candidate.userId)).toBe(0);
  });

  it('reports the full allowance of a recruiter who has not imported yet', async () => {
    const result = await status();
    expect(result.status).toBe(200);
    expect(result.json()).toEqual({ enabled: true, plan: 'free', limit: 3, used: 0, remaining: 3, resetsAt: null });
  });

  it.each([
    ['without ANTHROPIC_API_KEY', { key: undefined }],
    ['with JOB_IMPORT_DAILY_LIMIT=0', { daily: 0 }],
    ['with JOB_IMPORT_ATTEMPTS_PER_DAY=0', { attempts: 0 }]
  ])('is off %s: GET says so, POST answers 404 and nothing is counted', async (_label, settings) => {
    if ('key' in settings) env.ANTHROPIC_API_KEY = settings.key;
    if ('daily' in settings) env.JOB_IMPORT_DAILY_LIMIT = settings.daily!;
    if ('attempts' in settings) env.JOB_IMPORT_ATTEMPTS_PER_DAY = settings.attempts!;

    expect((await status()).json()).toEqual({
      enabled: false,
      plan: 'free',
      limit: 3,
      used: 0,
      remaining: 0,
      resetsAt: null
    });
    const result = await importFile(pdf);
    expect(result.status).toBe(404);
    expect(result.text).toBe('Job description import is not enabled on this server');
    expect(claude.state.requests).toHaveLength(0);
    expect(await planUsed()).toBe(0);
    expect(await attemptCount()).toBe(0);

    // Checked first: an account without a recruiter space is told the same
    const candidate = await createUser('candidate', { space: false });
    expect((await importFile(pdf, {}, candidate.cookie)).status).toBe(404);
  });
});

describe('the file', () => {
  it.each([
    ['plain text', Buffer.from('Développeur back-end, CDI, Lyon').toString('base64')],
    ['a PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString('base64')],
    ['an empty data URL', 'data:application/pdf;base64,']
  ])('refuses %s with 422, before counting anything', async (_label, file) => {
    const result = await importFile(file);
    expect(result.status).toBe(422);
    expect(result.text).toBe('Only PDF files can be imported');
    expect(claude.state.requests).toHaveLength(0);
    expect(await planUsed()).toBe(0);
    expect(await attemptCount()).toBe(0);
  });

  it.each([
    ['characters outside base64', 'JVBERi0x!!!'],
    ['a length that is not a multiple of 4', 'JVBERi0xLjcK1'],
    ['URL-safe base64', 'JVBERi0x_-8K'],
    ['line breaks', 'JVBERi0x\nLjcK']
  ])('refuses base64 with %s (422)', async (_label, file) => {
    const result = await importFile(file);
    expect(result.status).toBe(422);
    expect(result.text).toBe('The file is not valid base64');
    expect(claude.state.requests).toHaveLength(0);
  });

  it('refuses a PDF over 4 MB with 413, and takes one of exactly 4 MB', async () => {
    const pdfOfSize = (bytes: number) => {
      const buffer = Buffer.alloc(bytes, 0x20);
      buffer.write('%PDF-1.7\n');
      return buffer.toString('base64');
    };

    const tooLarge = await importFile(pdfOfSize(MAX_JOB_PDF_BYTES + 1));
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.text).toBe('The file is too large: job description import takes PDFs of up to 4 MB');
    expect(claude.state.requests).toHaveLength(0);
    expect(await planUsed()).toBe(0);

    const largest = await importFile(pdfOfSize(MAX_JOB_PDF_BYTES));
    expect(largest.status).toBe(200);
  });

  it('accepts a data URL and sends Claude the bare base64', async () => {
    const result = await importFile(`data:application/pdf;base64,${pdf}`);
    expect(result.status).toBe(200);
    const sent = claude.state.requests.find((request) => request.path === '/v1/messages')!;
    expect(sent.body.messages[0].content[0].source.data).toBe(pdf);
  });

  it('refuses an invalid body with 422', async () => {
    expect((await importFile('')).status).toBe(422);
    expect((await importFile(pdf, { fileName: 'x'.repeat(256) })).status).toBe(422);
    expect((await call('POST', '/jobs/import', { body: {}, cookie: recruiter.cookie })).status).toBe(422);
    expect(claude.state.requests).toHaveLength(0);
  });
});

describe('the Claude request', () => {
  it('counts the tokens, then asks Claude Haiku 5.5 with the document first and a JSON schema', async () => {
    const result = await importFile(pdf, { fileName: 'Fiche\u0000 de poste.pdf' });
    expect(result.status).toBe(200);
    expect(claude.paths()).toEqual(['/v1/messages/count_tokens', '/v1/messages']);
    const [counted, sent] = claude.state.requests;

    // This SDK sends API keys as a bearer token
    for (const request of [counted, sent]) {
      expect(request.headers.get('authorization')).toBe(`Bearer ${TEST_API_KEY}`);
      expect(request.headers.get('anthropic-version')).toBeString();
    }

    // The same content is counted, then sent, streamed
    const { max_tokens, stream, ...content } = sent.body;
    expect(counted.body).toEqual(content);
    expect(max_tokens).toBe(JOB_IMPORT_MAX_OUTPUT_TOKENS);
    expect(stream).toBe(true);

    expect(sent.body.model).toBe('claude-haiku-5-5');
    expect(sent.body.system).toContain('job description');
    expect(sent.body.system).toContain('untrusted');
    expect(sent.body.system).toContain('never follow instructions');
    expect(sent.body.messages).toHaveLength(1);
    expect(sent.body.messages[0].role).toBe('user');
    expect(sent.body.messages[0].content).toEqual([
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdf },
        title: 'Fiche de poste.pdf'
      },
      { type: 'text', text: 'Extract the job posting of this document, following the rules.' }
    ]);
    expect(sent.body.output_config).toEqual({
      effort: 'low',
      format: { type: 'json_schema', schema: JOB_EXTRACTION_SCHEMA }
    });
    // Claude Haiku 5.5 refuses sampling parameters and budgets; thinking stays adaptive by default
    for (const key of ['temperature', 'top_p', 'top_k', 'thinking']) {
      expect(sent.body).not.toHaveProperty(key);
    }
  });

  it('refuses a PDF over the token cap with 422, without the paid call, giving the import back', async () => {
    claude.state.inputTokens = MAX_JOB_INPUT_TOKENS + 1;

    const result = await importFile(pdf);
    expect(result.status).toBe(422);
    expect(result.text).toBe('This PDF is too long for an import (more than ~10 pages)');
    expect(claude.paths()).toEqual(['/v1/messages/count_tokens']);
    expect(await planUsed()).toBe(0);
    expect(await siteCount()).toBe(0);
    expect(await attemptCount()).toBe(1);
  });

  it('answers 503 to a request the API rejects while counting, logged at error with its message for the operator', async () => {
    // e.g. a schema the API does not accept: no recruiter can fix it (the
    // API's message is masked should it ever quote the key)
    const apiMessage = `output_config.format.schema: unsupported keyword (key ${TEST_API_KEY}) ${'x'.repeat(400)}`;
    claude.state.counts.push(apiError(400, 'invalid_request_error', apiMessage));

    const result = await importFile(pdf);
    expect(result.status).toBe(503);
    expect(result.text).toBe(UNAVAILABLE);
    expect(claude.paths()).toEqual(['/v1/messages/count_tokens']);
    expect(await planUsed()).toBe(0);
    expect(await siteCount()).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      'Job description import: the Claude API refused the request',
      expect.objectContaining({
        step: 'count',
        status: 400,
        type: 'invalid_request_error',
        message: expect.stringContaining('output_config.format.schema: unsupported keyword (key ***)')
      })
    );
    const logged = (logger.error as unknown as { mock: { calls: [string, { message: string }][] } }).mock.calls.find(
      ([text]) => text === 'Job description import: the Claude API refused the request'
    )!;
    expect(logged[1].message.length).toBeLessThanOrEqual(300);
  });
});

describe('a successful import', () => {
  it('returns the draft, normalised, counting one import of the plan', async () => {
    claude.state.output = {
      ...ONE_JOB,
      title: '  Lead   Developer ',
      company: 'Acme\u0000 Corp',
      workMode: 'Hybrid',
      remoteDaysPerWeek: '2',
      contractType: 'CDD',
      durationMonths: '18',
      hoursPerWeek: '35',
      payMin: '45 k€',
      payMax: '',
      payPeriod: 'YEAR',
      directReports: '4',
      levelsToCeo: '99',
      skills: ['TypeScript', 'typescript', 'Go'],
      country: 'Belgique'
    };

    const result = await importFile(pdf, { fileName: 'job.pdf' });
    expect(result.status).toBe(200);
    expect(result.json()).toEqual({
      draft: {
        title: 'Lead Developer',
        description: '## Mission\n\n- Construire la facturation',
        company: 'Acme Corp',
        status: 'draft',
        location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
        contract: { type: 'cdd', durationMonths: 18 },
        workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 35 },
        pay: { min: 45000, max: 45000, currency: 'EUR', period: 'year' },
        organization: { directReports: 4 },
        requirements: { skills: ['TypeScript', 'Go'] }
      },
      warnings: [
        'Only jobs in France are handled: check the location and the contract',
        'Left out the levels to the CEO ("99"): it must be a whole number from 0 to 30'
      ],
      // The plan holds the remaining imports: it never resets by itself
      quota: { plan: 'free', limit: 3, used: 1, remaining: 2, resetsAt: null }
    });

    // Counted once on the plan and once for the site; GET agrees
    expect(await planUsed()).toBe(1);
    expect(await siteCount()).toBe(1);
    expect(await attemptCount()).toBe(1);
    expect((await status()).json()).toEqual({
      enabled: true,
      plan: 'free',
      limit: 3,
      used: 1,
      remaining: 2,
      resetsAt: null
    });
  });

  it('logs one line per import: fields found, tokens and cost, nothing about the document', async () => {
    const result = await importFile(pdf);
    expect(result.status).toBe(200);

    const lines = logLines.slice(firstLogLine).filter((line) => line.label === 'logger.info(Job description import)');
    expect(lines).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith('Job description import', {
      // Title, description, company, city, work mode, contract type, arrangement, hours, pay min, max and period
      fields: 11,
      inputTokens: 4_200,
      outputTokens: 1_800,
      // 4,200 × $0.10 + 1,800 × $0.50 per million tokens
      estimatedCostUsd: 0.00132,
      stopReason: 'end_turn'
    });
  });

  it('counts an import that found nothing, and says so', async () => {
    claude.state.output = BLANK;

    const result = await importFile(pdf);
    expect(result.status).toBe(200);
    expect(result.json()).toMatchObject({
      draft: { status: 'draft', location: { country: 'FR' } },
      warnings: ['No job description was found in this file']
    });
    expect(await planUsed()).toBe(1);
  });

  it('counts an answer that is not JSON, returning an empty draft', async () => {
    claude.state.messages.push(streamed('Sorry, here is a summary instead.'));

    const result = await importFile(pdf);
    expect(result.status).toBe(200);
    expect(result.json()).toMatchObject({
      draft: { status: 'draft', location: { country: 'FR' } },
      warnings: ['No job description was found in this file']
    });
    expect(await planUsed()).toBe(1);
  });
});

describe('the plan', () => {
  it('stops the 4th import of the free plan with 402, before Claude and the daily counters', async () => {
    for (let index = 0; index < 3; index++) expect((await importFile(pdf)).status).toBe(200);
    const requestsBefore = claude.state.requests.length;

    const refused = await importFile(pdf);
    expect(refused.status).toBe(402);
    expect(refused.text).toBe(PLAN_USED_UP);
    expect(refused.headers.get('retry-after')).toBeNull();
    expect(claude.state.requests).toHaveLength(requestsBefore);

    expect(await planUsed()).toBe(3);
    expect(await siteCount()).toBe(3);
    expect(await attemptCount()).toBe(3);
    // Waiting does not help: no reset time
    expect((await status()).json()).toEqual({
      enabled: true,
      plan: 'free',
      limit: 3,
      used: 3,
      remaining: 0,
      resetsAt: null
    });
  });

  it('keeps the imports used for the lifetime of the account', async () => {
    const used = await createUser('used', { jobImportsUsed: 3 });

    const refused = await importFile(pdf, {}, used.cookie);
    expect(refused.status).toBe(402);
    expect(refused.text).toBe(PLAN_USED_UP);
    expect(claude.state.requests).toHaveLength(0);
    expect(await planUsed(used.userId)).toBe(3);
    expect(await attemptCount(used.userId)).toBe(0);
  });

  it('lets only one of two concurrent imports through the last one', async () => {
    const last = await createUser('last', { jobImportsUsed: 2 });

    const results = await Promise.all([importFile(pdf, {}, last.cookie), importFile(pdf, {}, last.cookie)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 402]);
    expect(await planUsed(last.userId)).toBe(3);
    expect(await siteCount()).toBe(1);
  });
});

describe('answers Claude did not finish', () => {
  it('answers 422 to a refusal, and counts it (it was paid for)', async () => {
    claude.state.messages.push(
      streamed('I cannot help with that.', { stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: null } })
    );

    const result = await importFile(pdf);
    expect(result.status).toBe(422);
    expect(result.text).toBe('This file could not be read as a job description');
    expect(await planUsed()).toBe(1);
    expect(await siteCount()).toBe(1);
    expect(logger.info).toHaveBeenCalledWith('Job description import', expect.objectContaining({ fields: 0, stopReason: 'refusal' }));
  });

  it('answers 422 when the answer ran out of tokens, and counts it', async () => {
    claude.state.messages.push(streamed('{"title":"Dévelop', { stop_reason: 'max_tokens' }));

    const result = await importFile(pdf);
    expect(result.status).toBe(422);
    expect(result.text).toBe('This job description has too much content to import at once. Try a shorter version');
    expect(await planUsed()).toBe(1);
    expect(await siteCount()).toBe(1);
  });
});

describe('failures on the operator side', () => {
  it.each([
    ['overloaded (529)', apiError(529, 'overloaded_error', 'Overloaded'), 'warn'],
    ['an internal error (500)', apiError(500, 'api_error', 'Internal server error'), 'warn'],
    ['rate limited (429)', apiError(429, 'rate_limit_error', 'Rate limited'), 'warn'],
    ['refusing the key (401)', apiError(401, 'authentication_error', 'invalid x-api-key'), 'error'],
    ['refusing the request (400, e.g. a spend limit)', apiError(400, 'invalid_request_error', 'You have reached your specified workspace API usage limits.'), 'error'],
    ['without access to the model (404)', apiError(404, 'not_found_error', 'model: claude-haiku-5-5'), 'error']
  ] as const)('answers 503 when Claude is %s (an error status, not billed): the import is given back, the attempt is not', async (_label, answer, level) => {
    claude.state.messages.push(answer);

    const result = await importFile(pdf);
    expect(result.status).toBe(503);
    expect(result.text).toBe(UNAVAILABLE);
    // Sent once: the paid call is never retried
    expect(claude.paths()).toEqual(['/v1/messages/count_tokens', '/v1/messages']);

    // Given back: the plan and the site are untouched, but the attempt counts
    expect(await planUsed()).toBe(0);
    expect(await siteCount()).toBe(0);
    expect(await attemptCount()).toBe(1);
    expect((await status()).json()).toMatchObject({ used: 0, remaining: 3, resetsAt: null });
    expect(logger[level]).toHaveBeenCalledWith(
      level === 'error'
        ? 'Job description import: the Claude API refused the request'
        : 'Job description import: the Claude API is unavailable',
      expect.objectContaining({ step: 'extract' })
    );
  });

  it.each([
    ['the connection fails', connectionFailure, false],
    ['no answer comes before the deadline', noAnswer, true],
    ['the answer stalls past the deadline', stalledStream, true],
    ['the stream reports an error after it started', streamError, false]
  ] as const)('counts the import when %s once the paid request was sent (the model may have run), without retrying', async (_label, answer, deadlineReached) => {
    jobImportTimeouts.extractMs = 200;
    claude.state.messages.push(answer);

    const result = await importFile(pdf);
    expect(result.status).toBe(503);
    expect(result.text).toBe(
      'The import did not finish. It still counts toward your imports (the job description may already have been read): try again later, or with a shorter document'
    );
    expect(claude.paths()).toEqual(['/v1/messages/count_tokens', '/v1/messages']);

    expect(await planUsed()).toBe(1);
    expect(await siteCount()).toBe(1);
    expect(await attemptCount()).toBe(1);
    expect((await status()).json()).toMatchObject({ used: 1, remaining: 2 });
    expect(logger.warn).toHaveBeenCalledWith(
      'Job description import: the Claude call did not finish, the import counts',
      expect.objectContaining({ step: 'extract', deadlineReached })
    );
  });

  it('retries counting tokens once when the API is unreachable (it is free), then gives the import back', async () => {
    claude.state.counts.push(connectionFailure, connectionFailure);

    const result = await importFile(pdf);
    expect(result.status).toBe(503);
    expect(result.text).toBe(UNAVAILABLE);
    expect(claude.paths()).toEqual(['/v1/messages/count_tokens', '/v1/messages/count_tokens']);
    expect(await planUsed()).toBe(0);
    expect(await siteCount()).toBe(0);
    expect(await attemptCount()).toBe(1);
  });

  it('gives counting tokens one deadline, the wait a 429 asks for before the retry included', async () => {
    jobImportTimeouts.countMs = 300;
    // Without the deadline, the SDK would wait 10 minutes before its retry
    claude.state.counts.push(() =>
      Response.json(
        { type: 'error', error: { type: 'rate_limit_error', message: 'Rate limited' }, request_id: 'req_429' },
        { status: 429, headers: { 'request-id': 'req_429', 'retry-after': '600' } }
      )
    );

    const started = performance.now();
    const result = await importFile(pdf);
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(result.status).toBe(503);
    expect(result.text).toBe(UNAVAILABLE);
    expect(claude.paths()).toEqual(['/v1/messages/count_tokens']);
    expect(await planUsed()).toBe(0);
  });

  it('answers 503 when counting tokens fails, and counts nothing', async () => {
    claude.state.counts.push(apiError(401, 'authentication_error', 'invalid x-api-key'));

    const result = await importFile(pdf);
    expect(result.status).toBe(503);
    expect(claude.paths()).toEqual(['/v1/messages/count_tokens']);
    expect(await planUsed()).toBe(0);
    expect(await siteCount()).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      'Job description import: the Claude API refused the request',
      expect.objectContaining({ step: 'count', status: 401, type: 'authentication_error' })
    );
  });
});

describe('daily quotas', () => {
  it('stops every recruiter at JOB_IMPORT_DAILY_LIMIT with 429 and Retry-After, giving back their plan import', async () => {
    env.JOB_IMPORT_DAILY_LIMIT = 1;
    const other = await createUser('other');
    expect((await importFile(pdf)).status).toBe(200);

    const refused = await importFile(pdf, {}, other.cookie);
    expect(refused.status).toBe(429);
    const reset = dayEnd();
    expect(refused.text).toBe(
      `Job description import has reached its daily limit on this site. Try again after ${reset.slice(0, 16).replace('T', ' ')} UTC`
    );
    const retryAfter = Number(refused.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(JOB_IMPORT_DAILY_WINDOW_MS / 1000);
    expect(claude.state.requests).toHaveLength(2);
    expect(await planUsed(other.userId)).toBe(0);
    expect(await siteCount()).toBe(1);

    // Their plan is intact, but nothing is left today
    expect((await status(other.cookie)).json()).toEqual({
      enabled: true,
      plan: 'free',
      limit: 3,
      used: 0,
      remaining: 0,
      resetsAt: reset
    });
  });

  it('stops a recruiter at JOB_IMPORT_ATTEMPTS_PER_DAY, failed attempts included, without using up their plan', async () => {
    env.JOB_IMPORT_ATTEMPTS_PER_DAY = 2;
    claude.state.messages.push(apiError(529, 'overloaded_error', 'Overloaded'), apiError(529, 'overloaded_error', 'Overloaded'));
    expect((await importFile(pdf)).status).toBe(503);
    expect((await importFile(pdf)).status).toBe(503);
    const requestsBefore = claude.state.requests.length;

    const refused = await importFile(pdf);
    expect(refused.status).toBe(429);
    const reset = dayEnd();
    expect(refused.text).toBe(
      `You have used your 2 job description import attempts for today. Try again after ${reset.slice(0, 16).replace('T', ' ')} UTC`
    );
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(Number(refused.headers.get('retry-after'))).toBeLessThanOrEqual(JOB_IMPORT_DAILY_WINDOW_MS / 1000);
    expect(claude.state.requests).toHaveLength(requestsBefore);

    // Their plan is untouched; nothing can start before tomorrow
    expect(await planUsed()).toBe(0);
    expect(await siteCount()).toBe(0);
    expect(await attemptCount()).toBe(3);
    expect((await status()).json()).toEqual({
      enabled: true,
      plan: 'free',
      limit: 3,
      used: 0,
      remaining: 0,
      resetsAt: reset
    });
  });

  it('gives a reset time only when a daily counter holds the remaining imports, with some used', async () => {
    // The site has 1 import left today, fewer than the plan's 3: tomorrow, more
    await setSiteCount(29);
    expect((await status()).json()).toEqual({
      enabled: true,
      plan: 'free',
      limit: 3,
      used: 0,
      remaining: 1,
      resetsAt: dayEnd()
    });

    // Tied with the plan (2 left each): the plan never resets by itself
    await setSiteCount(27);
    await User.updateOne({ _id: recruiter.userId }, { $set: { 'recruiter.jobImportsUsed': 1 } });
    expect((await status()).json()).toMatchObject({ used: 1, remaining: 2, resetsAt: null });

    // The plan used up: no reset time, even with the site's day used up too
    await setSiteCount(30);
    await User.updateOne({ _id: recruiter.userId }, { $set: { 'recruiter.jobImportsUsed': 3 } });
    expect((await status()).json()).toMatchObject({ used: 3, remaining: 0, resetsAt: null });
  });

  it('gives the typed client the reset time as the Date its type says', async () => {
    await setSiteCount(29);
    // The client of the web app: it turns ISO strings into Dates
    const { data, status: code } = await treaty(app).jobs.import.get({ headers: { Cookie: recruiter.cookie } });
    expect(code).toBe(200);
    const resetsAt: Date | null = data!.resetsAt;
    expect(resetsAt).toBeInstanceOf(Date);
    expect(resetsAt?.toISOString()).toBe(dayEnd());
  });
});

describe('the request body', () => {
  const MB = 1024 * 1024;

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
    app.fetch(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body,
        duplex: 'half'
      } as RequestInit)
    );

  const signedSession = (secret: string, expiresIn: string | number = '1h') =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(recruiter.userId)
      .setExpirationTime(expiresIn)
      .sign(new TextEncoder().encode(secret));

  it.each([
    ['no session cookie', async () => 'other=1'],
    ['a session cookie that is not a JWT', async () => 'auth=x'],
    ['a JWT signed with another secret', async () => `auth=${await signedSession('another secret')}`],
    ['an expired session', async () => `auth=${await signedSession(env.JWT_SECRET, Math.floor(Date.now() / 1000) - 60)}`]
  ])('refuses %s with 401 before reading the body, with the CORS headers', async (_label, cookie) => {
    const origin = env.ALLOWED_DOMAINS[0];
    const { stream, watch } = watchedBody(5 * MB);

    const result = await streamedPost('/jobs/import', stream, { Origin: origin, Cookie: await cookie() });
    expect(result.status).toBe(401);
    expect(await result.text()).toBe('Unauthorized');
    expect(result.headers.get('access-control-allow-origin')).toBe(origin);
    expect(watch.read).toBe(0);
    expect(claude.state.requests).toHaveLength(0);
  });

  it('takes a PDF above 1 MB sent without Content-Length (chunked), with a session', async () => {
    const buffer = Buffer.alloc(3 * MB, 0x20);
    buffer.write(`%PDF-1.7\n% chunked-${t.suffix}\n`);
    pdf = buffer.toString('base64');
    const body = new Blob([JSON.stringify({ file: pdf })]).stream();

    const result = await streamedPost('/jobs/import', body, { Cookie: recruiter.cookie });
    expect(result.status).toBe(200);
    expect(claude.paths()).toEqual(['/v1/messages/count_tokens', '/v1/messages']);
    expect(await planUsed()).toBe(1);
  });

  it('keeps the 1 MB cap for another method on that path', async () => {
    const put = await app.fetch(
      new Request('http://localhost/jobs/import', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(MB + 1), Cookie: recruiter.cookie },
        body: '{}'
      })
    );
    expect(put.status).toBe(413);
  });
});

describe('traces', () => {
  /** Literal keys: toHaveProperty('http.request.body') would look for a nested path */
  const sensitiveKeysOf = (attributes: object) =>
    Object.keys(attributes).filter((key) => SENSITIVE_SPAN_ATTRIBUTES.includes(key));

  it('carry neither the PDF, the key nor what Claude extracted, and the request span not the body', async () => {
    // The span processors production uses (redaction, then the batch queue),
    // for this test only: registered before the plugin is created, so it uses them
    const memory = new InMemorySpanExporter();
    const provider = new TracerProvider({ spanProcessors: createSpanProcessors(memory) });
    trace.setGlobalTracerProvider(provider);
    context.setGlobalContextManager(new StackContextManager().enable());
    try {
      const traced = new Elysia().use(opentelemetry({ serviceName: 'test' })).use(createApp()) as unknown as Elysia;
      const extractedTitle = `Telemetry Sentinel Recruiter ${t.suffix}`;
      claude.state.output = { ...ONE_JOB, title: extractedTitle };

      const result = await traced.handle(
        new Request('http://localhost/jobs/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: recruiter.cookie },
          body: JSON.stringify({ file: pdf, fileName: 'job.pdf' })
        })
      );
      expect(result.status).toBe(200);
      expect(((await result.json()) as { draft: { title: string } }).draft.title).toBe(extractedTitle);
      expect(claude.paths()).toEqual(['/v1/messages/count_tokens', '/v1/messages']);

      // Root spans end after the response is sent
      await Bun.sleep(20);
      await provider.forceFlush();
      const spans = memory.getFinishedSpans();
      const exported = JSON.stringify(
        spans.map((span) => ({ name: span.name, attributes: span.attributes, events: span.events }))
      );
      for (const secret of [pdf, TEST_API_KEY, extractedTitle]) expect(exported).not.toContain(secret);
      for (const span of spans) expect(sensitiveKeysOf(span.attributes)).toEqual([]);

      // The SDK traced both calls, metadata only
      const sdkSpans = spans.filter((span) => span.attributes['gen_ai.provider.name'] !== undefined);
      expect(sdkSpans.map((span) => span.name).sort()).toEqual(['anthropic.messages.count_tokens', 'anthropic.messages.create']);
      const contentAttributes = ['gen_ai.input.messages', 'gen_ai.output.messages', 'gen_ai.system_instructions'];
      for (const span of sdkSpans) {
        expect(Object.keys(span.attributes).filter((key) => contentAttributes.includes(key))).toEqual([]);
      }

      // The handler emptied the body's file: the request span measured a few bytes, not the PDF
      const root = spans.find((span) => span.attributes['http.route'] === '/jobs/import');
      expect(root).toBeDefined();
      expect(Number(root!.attributes['http.request.body.size'])).toBeLessThan(pdf.length);
    } finally {
      await provider.shutdown();
      // Back to the no-op API for the other tests
      trace.disable();
      context.disable();
    }
  });
});
