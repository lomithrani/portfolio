// Step suggestions (GET/POST /workflow/step-suggestions) against a real
// MongoDB (MONGO_URL, which must be local or come from TEST_MONGO_URL): the
// daily limits are MongoDB counters. GitHub is faked at the fetch layer, so
// the token really goes to api.github.com, and nowhere else (no response, no
// log line). Each test creates its own users and counts on a site-wide key
// of its own, named with a suffix unique to that test, and removes them
// after: tests pass in any order (--randomize).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose from 'mongoose';
import { STEP_SUGGESTION_LIMITS, parseStepSuggestion } from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import { Domain, RateLimitCounter, User } from '../models/database';
import { logger } from '../services/logger';
import { peekRateLimit } from '../services/rateLimit';
import {
  STEP_SUGGESTIONS_PER_DAY,
  STEP_SUGGESTIONS_PER_OWNER,
  STEP_SUGGESTION_ATTEMPTS_PER_OWNER,
  describeStepSuggestions,
  stepSuggestionCounters,
  stepSuggestionAttemptsKey,
  stepSuggestionIssue,
  stepSuggestionOwnerKey,
  stepSuggestionTimeouts
} from '../services/stepSuggestions';
import { authCookie } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `ss-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

/** Never a real token: tests/setup.ts removes GITHUB_ISSUES_TOKEN, and fetch is faked */
const TEST_TOKEN = 'github_pat_11STEPSUGGESTIONTEST0123456789';
const TEST_REPO = 'example-owner/example-repo';
const PATH = '/workflow/step-suggestions';
const UNAVAILABLE = 'Your suggestion could not be sent right now, try again later';

// ── Fake GitHub ─────────────────────────────────────────────

interface GithubRequest {
  method: string;
  url: string;
  headers: Headers;
  redirect: string | undefined;
  body: { title: string; body: string; labels: string[] };
}

type Answer = (signal: AbortSignal | null | undefined) => Response | Promise<Response>;

const created: Answer = () =>
  Response.json({ number: 123, html_url: `https://github.com/${TEST_REPO}/issues/123` }, { status: 201 });

let github: { requests: GithubRequest[]; answer: Answer };

const installFakeGithub = () => {
  github = { requests: [], answer: created };
  spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('https://api.github.com/')) throw new Error(`Unexpected request to ${url}`);
    github.requests.push({
      method: init?.method ?? 'GET',
      url,
      headers: new Headers(init?.headers),
      redirect: init?.redirect,
      body: JSON.parse(String(init?.body))
    });
    return github.answer(init?.signal);
  }) as typeof fetch);
};

// ── App, users, records ─────────────────────────────────────

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;
let userIds: string[];
const responses: { label: string; text: string }[] = [];
const logLines: { label: string; text: string }[] = [];
let firstResponse = 0;
let firstLogLine = 0;

const call = async (method: string, path: string, { body, cookie }: { body?: unknown; cookie?: string } = {}) => {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  const text = body === undefined ? undefined : JSON.stringify(body);
  if (text !== undefined) headers['Content-Type'] = 'application/json';
  const response = await app.fetch(new Request(`http://localhost${path}`, { method, headers, body: text }));
  const responseText = await response.text();
  responses.push({ label: `${method} ${path} → ${response.status}`, text: `${responseText} ${JSON.stringify([...response.headers])}` });
  return {
    status: response.status,
    headers: response.headers,
    text: responseText,
    json: <T = any>() => JSON.parse(responseText) as T
  };
};

interface TestUser {
  id: string;
  cookie: string;
}

const createUser = async (name: string, { domain = true }: { domain?: boolean } = {}): Promise<TestUser> => {
  const user = await User.create({ email: t.email(name), googleId: t.id(`sub-${name}`), name });
  const id = user._id.toString();
  userIds.push(id);
  if (domain) await Domain.create({ name: t.id(name), admin: user._id, experiences: [] });
  return { id, cookie: await authCookie(id) };
};

const suggestion = { name: 'Share the salary range', description: 'The recruiter gives the range before booking.' };

const suggest = (user: TestUser | undefined, body: unknown = suggestion) => call('POST', PATH, { body, cookie: user?.cookie });

const ownerCount = async (user: TestUser) => (await peekRateLimit(stepSuggestionOwnerKey(user.id), STEP_SUGGESTIONS_PER_OWNER)).count;
const attemptCount = async (user: TestUser) =>
  (await peekRateLimit(stepSuggestionAttemptsKey(user.id), STEP_SUGGESTION_ATTEMPTS_PER_OWNER)).count;
const siteCount = async () => (await peekRateLimit(stepSuggestionCounters.globalKey, STEP_SUGGESTIONS_PER_DAY)).count;

/** Sets the site's count of the day, as if other owners had sent suggestions */
const setSiteCount = async (count: number) => {
  const { windowMs } = STEP_SUGGESTIONS_PER_DAY;
  const day = Math.floor(Date.now() / windowMs) * windowMs;
  await RateLimitCounter.updateOne(
    { _id: `${stepSuggestionCounters.globalKey}:${day}` },
    { $set: { count, expiresAt: new Date(day + windowMs) } },
    { upsert: true }
  );
};

const removeTestData = async (suffix: string, ids: string[]) => {
  const counterKeys = [
    stepSuggestionCounters.globalKey,
    ...ids.flatMap((userId) => [stepSuggestionOwnerKey(userId), stepSuggestionAttemptsKey(userId)])
  ];
  await RateLimitCounter.deleteMany({ _id: { $regex: `^(${counterKeys.join('|')}):` } });
  const named = new RegExp(`-${suffix}(@|$)`);
  await Domain.deleteMany({ name: named });
  await User.deleteMany({ email: named });
};

/** The feature's own log lines of a level (the error handler also logs each 5xx it answers) */
const logged = (level: string) =>
  logLines.slice(firstLogLine).filter((line) => line.label.startsWith(`logger.${level}(Step suggestion`));

const saved = {
  token: env.GITHUB_ISSUES_TOKEN,
  repo: env.GITHUB_ISSUES_REPO,
  globalKey: stepSuggestionCounters.globalKey,
  timeouts: { ...stepSuggestionTimeouts }
};
let connected = false;

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5_000 });
  connected = true;
});

afterAll(async () => {
  env.GITHUB_ISSUES_TOKEN = saved.token;
  env.GITHUB_ISSUES_REPO = saved.repo;
  stepSuggestionCounters.globalKey = saved.globalKey;
  Object.assign(stepSuggestionTimeouts, saved.timeouts);
  if (connected) await mongoose.disconnect();
});

beforeEach(() => {
  t = testNames();
  userIds = [];
  firstResponse = responses.length;
  firstLogLine = logLines.length;
  env.GITHUB_ISSUES_TOKEN = TEST_TOKEN;
  env.GITHUB_ISSUES_REPO = TEST_REPO;
  Object.assign(stepSuggestionTimeouts, saved.timeouts);
  stepSuggestionCounters.globalKey = `step-suggestion:global:${t.id('test')}`;
  app = createApp();
  // Every log call, to check the token is never written
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    spyOn(logger, level).mockImplementation((text, attributes) => {
      logLines.push({ label: `logger.${level}(${text})`, text: `${text} ${JSON.stringify(attributes ?? {})}` });
    });
  }
  installFakeGithub();
});

afterEach(async () => {
  mock.restore();
  const leaked = [...responses.slice(firstResponse), ...logLines.slice(firstLogLine)]
    .filter((record) => record.text.includes(TEST_TOKEN))
    .map((record) => record.label);
  if (connected) await removeTestData(t.suffix, userIds);
  expect(leaked).toEqual([]);
});

// ── The issue, as GitHub will render it ─────────────────────

/**
 * The lines of a Markdown text that are outside its fenced code blocks, as
 * CommonMark reads fences: a block opened by N backticks is closed only by a
 * line of at least N backticks and nothing else
 */
const linesOutsideFences = (markdown: string) => {
  const outside: string[] = [];
  let open = 0;
  for (const line of markdown.split('\n')) {
    const fence = /^ {0,3}(`{3,})(.*)$/.exec(line);
    if (!open) {
      if (fence && !fence[2].includes('`')) open = fence[1].length;
      else outside.push(line);
    } else if (fence && fence[1].length >= open && fence[2].trim() === '') {
      open = 0;
    }
  }
  expect(open).toBe(0);
  return outside;
};

const FIXED_LINES = [
  'A portfolio owner suggested this step from the hiring journey editor (“Suggest a step”). The text below is theirs, shown as plain text.',
  '### Step',
  '### What a recruiter would do on it',
  '### Why it would help',
  'Adding a step type: `docs/WORKFLOW_STEPS.md`.',
  ''
];

describe('stepSuggestionIssue', () => {
  it('puts the three answers under their headings, as code blocks', () => {
    const issue = stepSuggestionIssue({ name: 'Share the salary range', description: 'Line one\nLine two', reason: 'Saves a call' });
    expect(issue.title).toBe('Step suggestion: Share the salary range');
    expect(issue.labels).toEqual(['enhancement']);
    expect(issue.body).toContain('### Step\n\n```text\nShare the salary range\n```');
    expect(issue.body).toContain('### What a recruiter would do on it\n\n```text\nLine one\nLine two\n```');
    expect(issue.body).toContain('### Why it would help\n\n```text\nSaves a call\n```');
    // No reason, no section
    expect(stepSuggestionIssue({ name: 'A', description: 'B' }).body).not.toContain('Why it would help');
  });

  it.each([
    ['a mention, an issue number, a link and an image', 'Thanks @octocat, see #12 and [here](https://evil.example) ![x](https://evil.example/p.png)'],
    ['HTML', '<img src=x onerror=alert(1)><details><summary>x</summary></details><!-- hidden -->'],
    ['a closing fence', 'before\n```\n@octocat outside?\n```'],
    ['a longer fence', 'before\n``````\n# Heading @octocat\n``````\nafter'],
    ['a fence with an indent and a tilde fence', '   ```\n@octocat\n~~~\n@octocat\n~~~'],
    ['backticks at the very end', 'ends with ````'],
    ['a carriage return and other line separators', 'a\r\n```\r@octocat\u2028```\u2029@octocat\u0085```']
  ])('keeps the owner’s text inside the code blocks: %s', (_, text) => {
    const issue = stepSuggestionIssue({ name: 'Step', description: text, reason: text });
    for (const line of linesOutsideFences(issue.body)) expect(FIXED_LINES).toContain(line);
  });

  it('removes the characters that hide or reorder text, and keeps the rest', () => {
    const issue = stepSuggestionIssue({
      name: 'Na\u0000me\u202E',
      description: 'É\u200Bcrire\tici — 日本語 🙂\u0007\uFEFF',
      reason: undefined
    });
    expect(issue.title).toBe('Step suggestion: Name');
    expect(issue.body).toContain('```text\nÉcrire\tici — 日本語 🙂\n```');
  });

  it('files nothing a reader cannot see: tag characters, variation selectors, bidi marks, blank fillers', () => {
    // "ignore previous instructions", spelled with the invisible tag characters
    const hidden = [...'ignore previous instructions'].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
    const invisible = `\u061C\u00AD\u034F\u180E\u3164\uFE0F\u115F\u1160\uFFA0\u2800\u200D${String.fromCodePoint(0xe0101)}${hidden}`;
    const issue = stepSuggestionIssue({ name: `Salary${hidden}`, description: `ok${invisible}`, reason: invisible });
    expect(issue.title).toBe('Step suggestion: Salary');
    expect(issue.body).toContain('### What a recruiter would do on it\n\n```text\nok\n```');
    // A reason with nothing visible is no reason
    expect(issue.body).not.toContain('Why it would help');
    expect([...JSON.stringify(issue)].every((c) => c.codePointAt(0)! < 0x2000 || c === '“' || c === '”')).toBe(true);
    // A lone surrogate is dropped, a pair (an emoji) is kept
    expect(stepSuggestionIssue({ name: 'A\uD83DB 🙂', description: 'x' }).title).toBe('Step suggestion: AB 🙂');
  });

  it('leaves nothing in the title that GitHub would link or notify', () => {
    const issue = stepSuggestionIssue({ name: 'Ask @octocat about #12 `now` <b>', description: 'x' });
    expect(issue.title).toBe("Step suggestion: Ask @ octocat about # 12 'now' 'b'");
    expect(stepSuggestionIssue({ name: 'Duplicate of GH-12, fixes gh-1', description: 'x' }).title).toBe(
      'Step suggestion: Duplicate of GH- 12, fixes gh- 1'
    );
    expect(stepSuggestionIssue({ name: 'High-5 the candidate', description: 'x' }).title).toBe(
      'Step suggestion: High-5 the candidate'
    );
    // A name that only looks odd stays readable
    expect(stepSuggestionIssue({ name: 'C# and email @ work', description: 'x' }).title).toBe('Step suggestion: C# and email @ work');
  });
});

describe('describeStepSuggestions', () => {
  it('says whether the feature is on, never the token', () => {
    expect(describeStepSuggestions({ GITHUB_ISSUES_TOKEN: undefined, GITHUB_ISSUES_REPO: TEST_REPO })).toBe('off (no GITHUB_ISSUES_TOKEN)');
    expect(describeStepSuggestions({ GITHUB_ISSUES_TOKEN: TEST_TOKEN, GITHUB_ISSUES_REPO: TEST_REPO })).toBe(
      'on (issues in example-owner/example-repo, 3 per owner and 20 for the site per day)'
    );
  });
});

// ── The routes ──────────────────────────────────────────────

describe('step suggestions', () => {
  it('files a suggestion as an issue in the repository, with the operator’s token', async () => {
    const owner = await createUser('owner');
    expect((await call('GET', PATH, { cookie: owner.cookie })).json()).toEqual({ enabled: true });

    const sent = await suggest(owner, { ...suggestion, name: '  Share the   salary range ', reason: ' It saves a call. ' });
    expect(sent.status).toBe(200);
    expect(sent.json()).toEqual({ created: true });

    expect(github.requests).toHaveLength(1);
    const [request] = github.requests;
    expect(request.method).toBe('POST');
    expect(request.url).toBe(`https://api.github.com/repos/${TEST_REPO}/issues`);
    expect(request.headers.get('authorization')).toBe(`Bearer ${TEST_TOKEN}`);
    expect(request.headers.get('accept')).toBe('application/vnd.github+json');
    expect(request.headers.get('user-agent')).toBe('portfolio-step-suggestions');
    // Never followed: a redirect would carry the token elsewhere
    expect(request.redirect).toBe('manual');
    expect(request.body).toEqual(
      stepSuggestionIssue({ name: 'Share the salary range', description: suggestion.description, reason: 'It saves a call.' })
    );
    // The issue names nobody: who sent it stays in the API's log
    const issueText = JSON.stringify(request.body);
    for (const personal of [owner.id, t.email('owner'), t.id('owner')]) expect(issueText).not.toContain(personal);
    expect(logged('info').map((line) => line.text)).toEqual([
      `Step suggestion filed ${JSON.stringify({ userId: owner.id, repository: TEST_REPO, issueNumber: 123 })}`
    ]);
    expect(await ownerCount(owner)).toBe(1);
    expect(await attemptCount(owner)).toBe(1);
    expect(await siteCount()).toBe(1);
  });

  it('is off without a token', async () => {
    env.GITHUB_ISSUES_TOKEN = undefined;
    const owner = await createUser('owner');
    expect((await call('GET', PATH, { cookie: owner.cookie })).json()).toEqual({ enabled: false });
    const refused = await suggest(owner);
    expect(refused.status).toBe(404);
    expect(refused.text).toBe('Step suggestions are not enabled on this server');
    expect(github.requests).toEqual([]);
  });

  it('takes suggestions from portfolio owners only', async () => {
    expect((await call('GET', PATH)).status).toBe(401);
    expect((await suggest(undefined)).status).toBe(401);

    const visitor = await createUser('visitor', { domain: false });
    const refused = await suggest(visitor);
    expect(refused.status).toBe(403);
    expect(refused.text).toBe('Only the owner of a portfolio can suggest a step');
    expect(github.requests).toEqual([]);
    expect(await ownerCount(visitor)).toBe(0);
  });

  it('refuses a suggestion that breaks a rule, naming the field, before counting it', async () => {
    const owner = await createUser('owner');
    const long = (length: number) => 'x'.repeat(length);
    const cases: [Record<string, unknown>, string, string][] = [
      [{ ...suggestion, name: '   ' }, 'name', 'Give the step a name.'],
      [{ ...suggestion, name: long(STEP_SUGGESTION_LIMITS.name + 1) }, 'name', 'The name is at most 80 characters.'],
      [{ ...suggestion, description: ' \n ' }, 'description', 'Say what a recruiter would do on this step.'],
      [
        { ...suggestion, description: long(STEP_SUGGESTION_LIMITS.description + 1) },
        'description',
        'This is at most 1500 characters.'
      ],
      [{ ...suggestion, reason: long(STEP_SUGGESTION_LIMITS.reason + 1) }, 'reason', 'This is at most 1500 characters.']
    ];
    for (const [body, property, message] of cases) {
      const refused = await suggest(owner, body);
      expect(refused.status).toBe(422);
      expect(refused.json()).toEqual({ type: 'validation', on: 'body', property, message });
    }
    // What the request schema refuses: other types, a missing field, far too long
    for (const body of [{ name: 'A' }, { ...suggestion, name: 12 }, { ...suggestion, reason: ['x'] }, { ...suggestion, name: long(500) }]) {
      expect((await suggest(owner, body)).status).toBe(422);
    }
    // Nothing visible is no answer: the rules are checked on the text as it would be filed
    const unseen = '\u200B\u2060\u200D';
    for (const [body, property] of [
      [{ ...suggestion, name: unseen }, 'name'],
      [{ ...suggestion, description: ` ${unseen}\u0001 ` }, 'description']
    ] as const) {
      const refused = await suggest(owner, body);
      expect(refused.status).toBe(422);
      expect(refused.json().property).toBe(property);
    }
    expect(github.requests).toEqual([]);
    expect(await ownerCount(owner)).toBe(0);
    expect(await attemptCount(owner)).toBe(0);
    // The lengths are counted on the trimmed text
    expect((await suggest(owner, { ...suggestion, name: ` ${long(STEP_SUGGESTION_LIMITS.name)} ` })).status).toBe(200);
  });

  it('caps the suggestions of an owner per day', async () => {
    const owner = await createUser('owner');
    const other = await createUser('other');
    for (let i = 0; i < STEP_SUGGESTIONS_PER_OWNER.limit; i++) expect((await suggest(owner)).status).toBe(200);

    const refused = await suggest(owner);
    expect(refused.status).toBe(429);
    expect(refused.text).toBe('You can send 3 suggestions a day: try again tomorrow');
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(github.requests).toHaveLength(STEP_SUGGESTIONS_PER_OWNER.limit);
    // The refused one does not count for the site, and another owner still can
    expect(await siteCount()).toBe(STEP_SUGGESTIONS_PER_OWNER.limit);
    expect((await suggest(other)).status).toBe(200);
  });

  it('caps the suggestions of the whole site per day, without counting the refused one for its owner', async () => {
    const owner = await createUser('owner');
    await setSiteCount(STEP_SUGGESTIONS_PER_DAY.limit);
    const refused = await suggest(owner);
    expect(refused.status).toBe(429);
    expect(refused.text).toBe('Too many suggestions were sent today: try again tomorrow');
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(github.requests).toEqual([]);
    expect(await ownerCount(owner)).toBe(0);
  });

  it.each([
    [307, 'Moved Permanently', 'error'],
    [401, 'Bad credentials', 'error'],
    [403, 'Resource not accessible by personal access token', 'error'],
    [404, 'Not Found', 'error'],
    [422, 'Validation Failed', 'error'],
    [429, 'API rate limit exceeded', 'warn'],
    [502, 'Server Error', 'warn']
  ] as const)('answers 503 and gives the suggestion back when GitHub answers %i', async (status, message, level) => {
    const owner = await createUser('owner');
    github.answer = () => Response.json({ message: `${message} (token ${TEST_TOKEN})`, documentation_url: 'https://docs.github.com' }, { status });

    const failed = await suggest(owner);
    expect(failed.status).toBe(503);
    expect(failed.text).toBe(UNAVAILABLE);
    expect(await ownerCount(owner)).toBe(0);
    expect(await siteCount()).toBe(0);
    // Given back, but the request did go to GitHub
    expect(await attemptCount(owner)).toBe(1);
    expect(logged(level).map((line) => line.text)).toEqual([
      `Step suggestion: GitHub did not create the issue ${JSON.stringify({
        userId: owner.id,
        repository: TEST_REPO,
        status,
        githubMessage: `${message} (token [token])`
      })}`
    ]);
  });

  it('stops sending an owner’s suggestions to GitHub once it refused them too many times in a day', async () => {
    const owner = await createUser('owner');
    const other = await createUser('other');
    github.answer = () => Response.json({ message: 'Bad credentials' }, { status: 401 });
    const { limit } = STEP_SUGGESTION_ATTEMPTS_PER_OWNER;
    for (let i = 0; i < limit; i++) expect((await suggest(owner)).status).toBe(503);
    expect(github.requests).toHaveLength(limit);

    const refused = await suggest(owner);
    expect(refused.status).toBe(429);
    expect(refused.text).toBe('Your suggestions could not be sent today: try again tomorrow');
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    // Nothing more was sent, and the refused one counts for nobody
    expect(github.requests).toHaveLength(limit);
    expect(await ownerCount(owner)).toBe(0);
    expect(await siteCount()).toBe(0);
    // Another owner is not held back by it
    github.answer = created;
    expect((await suggest(other)).status).toBe(200);
  });

  it('answers 503 when GitHub sends something else than the created issue', async () => {
    const owner = await createUser('owner');
    github.answer = () => new Response('<html>proxy</html>', { status: 200 });
    expect((await suggest(owner)).status).toBe(503);
    expect(await ownerCount(owner)).toBe(0);
    expect(logged('warn')).toHaveLength(1);
  });

  it('answers 503 and keeps the count when GitHub does not answer: the issue may exist', async () => {
    const owner = await createUser('owner');
    github.answer = () => {
      throw new TypeError('fetch failed');
    };
    const lost = await suggest(owner);
    expect(lost.status).toBe(503);
    expect(lost.text).toBe(UNAVAILABLE);
    expect(await ownerCount(owner)).toBe(1);

    stepSuggestionTimeouts.githubMs = 30;
    github.answer = (signal) =>
      new Promise<Response>((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true }));
    const slow = await suggest(owner);
    expect(slow.status).toBe(503);
    expect(await ownerCount(owner)).toBe(2);
    expect(logged('warn').map((line) => line.text)).toEqual([
      `Step suggestion: no answer from GitHub ${JSON.stringify({ userId: owner.id, reason: 'TypeError' })}`,
      `Step suggestion: no answer from GitHub ${JSON.stringify({ userId: owner.id, reason: 'TimeoutError' })}`
    ]);
  });

  it('agrees with the form on the rules (parseStepSuggestion)', () => {
    expect(parseStepSuggestion({ name: ' A  b ', description: ' c ', reason: ' ' })).toEqual({
      ok: true,
      suggestion: { name: 'A b', description: 'c' }
    });
  });
});
