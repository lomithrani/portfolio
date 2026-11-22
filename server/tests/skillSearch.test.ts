// The skill search of the experience editor (services/skillSearch.ts, GET
// /skills/search) against a real MongoDB (MONGO_URL, local or from
// TEST_MONGO_URL). The Skill collection is the whole site's and other suites
// write to it: every test names its skills with a suffix of its own, searches
// with that suffix, and removes them, so the tests pass in any order.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import mongoose from 'mongoose';
import { SKILL_SEARCH } from 'portfolio-common';
import type { SkillSuggestion } from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import { RateLimitCounter, Skill, User } from '../models/database';
import { logger } from '../services/logger';
import { SKILL_SEARCHES_PER_USER, suggestSkills } from '../services/skillSearch';
import { authCookie } from './helpers';
import { assertDisposableDatabase } from './testDatabase';

const testNames = () => {
  // Letters and digits only: a suffix that is the same text in a URL, a regular expression and a log line
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return { suffix, email: (name: string) => `ss-${name}-${suffix}@example.com` };
};

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;
let connected = false;
let logLines: string[] = [];

const call = async (path: string, cookie?: string, headers: Record<string, string> = {}) => {
  const response = await app.fetch(
    new Request(`http://localhost${path}`, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers } })
  );
  const text = await response.text();
  return { status: response.status, text, headers: response.headers, json: <T = any>() => JSON.parse(text) as T };
};

const search = (q: string, cookie?: string, headers?: Record<string, string>) =>
  call(`/skills/search?q=${encodeURIComponent(q)}`, cookie, headers);

const found = async (q: string, cookie: string): Promise<SkillSuggestion[]> => {
  const answer = await search(q, cookie);
  expect(answer.status).toBe(200);
  return answer.json<{ skills: SkillSuggestion[] }>().skills;
};

const createUser = async (name: string) => {
  const user = await User.create({ email: t.email(name), googleId: `ss-sub-${name}-${t.suffix}`, name });
  return { id: user._id.toString(), cookie: await authCookie(user._id.toString()) };
};

const status = (value: 'pending' | 'classified' | 'rejected' | 'manual') => ({
  status: value,
  at: new Date(),
  attempts: value === 'manual' ? 0 : 1
});

/** A skill of this test, stored as given: recognised (classified) unless told otherwise */
const skill = (displayName: string, fields: Record<string, unknown> = {}) =>
  Skill.create({ displayName, names: [displayName], classification: status('classified'), ...fields });

const clearCounters = () => RateLimitCounter.deleteMany({ _id: { $regex: '^skill-search' } });

const savedLimit = { ...SKILL_SEARCHES_PER_USER };

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([User.init(), Skill.init()]);
});

afterAll(async () => {
  if (connected) await mongoose.disconnect();
});

beforeEach(async () => {
  t = testNames();
  app = createApp();
  logLines = [];
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    spyOn(logger, level).mockImplementation((text, attributes) => {
      logLines.push(`${level} ${text} ${JSON.stringify(attributes ?? {})}`);
    });
  }
  if (connected) await clearCounters();
});

afterEach(async () => {
  mock.restore();
  Object.assign(SKILL_SEARCHES_PER_USER, savedLimit);
  if (!connected) return;
  await clearCounters();
  await User.deleteMany({ email: new RegExp(`-${t.suffix}@`) });
  await Skill.deleteMany({ displayName: new RegExp(t.suffix, 'i') });
});

describe('the skills that what was typed could be (GET /skills/search)', () => {
  it('is for signed-in accounts', async () => {
    await skill(`Kafka${t.suffix}`);
    const signedOut = await search(`kafka${t.suffix}`);
    expect(signedOut.status).toBe(401);
    expect(signedOut.text).not.toContain(t.suffix);
    expect((await search(`kafka${t.suffix}`, 'auth=not-a-session')).status).toBe(401);
  });

  it('answers with the skill, its category and the skill it is part of, and nothing else of the catalogue', async () => {
    const user = await createUser('shape');
    const parent = await skill(`Dotnet${t.suffix}`, { category: 'framework', classification: status('manual') });
    await skill(`Dotnet${t.suffix} Core`, { category: 'framework', parent: parent._id });
    const answer = await search(`  dotnet${t.suffix}   core `, user.cookie);
    expect(answer.status).toBe(200);
    // Exactly these: no id, no other spellings, nothing of the classifier
    expect(answer.json()).toEqual({
      skills: [{ name: `Dotnet${t.suffix} Core`, category: 'framework', parent: `Dotnet${t.suffix}` }]
    });
    // A skill without a category or a family has only its name
    await skill(`Plain${t.suffix}`);
    expect(await found(`plain${t.suffix}`, user.cookie)).toEqual([{ name: `Plain${t.suffix}` }]);
  });

  it('refuses a text that is empty or too long to be a skill (422 on q), in the language asked', async () => {
    const user = await createUser('invalid');
    const tooLong = 'a'.repeat(SKILL_SEARCH.maxLength + 1);
    for (const q of ['', '   ', tooLong]) {
      const refused = await search(q, user.cookie);
      expect(refused.status).toBe(422);
      expect(refused.json()).toEqual({
        type: 'validation',
        on: 'body',
        property: 'q',
        message: 'Type between 1 and 100 characters to search for a skill.'
      });
    }
    const french = await search('', user.cookie, { 'Accept-Language': 'fr' });
    expect(french.json<{ message: string }>().message).toBe(
      'Saisissez entre 1 et 100 caractères pour rechercher une compétence.'
    );
    // Without q at all: the request's own validation
    const missing = await call('/skills/search', user.cookie);
    expect(missing.status).toBe(422);
    expect(missing.json<{ property: string }>().property).toBe('q');
    // The longest name a skill can have is searched; spaces around it do not count
    expect((await search(` ${'a'.repeat(SKILL_SEARCH.maxLength)} `, user.cookie)).status).toBe(200);
    // A refused search is not counted
    expect(await RateLimitCounter.countDocuments({ _id: { $regex: '^skill-search' } })).toBe(1);
  });

  it('suggests only skills recognised as skills: never one still to classify or rejected, even typed exactly', async () => {
    const user = await createUser('recognised');
    await skill(`Classified${t.suffix}`);
    await skill(`Manual${t.suffix}`, { classification: status('manual') });
    await skill(`Untouched${t.suffix}`, { classification: undefined });
    await skill(`Pending${t.suffix}`, { classification: status('pending') });
    await skill(`Rejected${t.suffix}`, { classification: status('rejected') });

    expect(await found(`classified${t.suffix}`, user.cookie)).toEqual([{ name: `Classified${t.suffix}` }]);
    expect(await found(`manual${t.suffix}`, user.cookie)).toEqual([{ name: `Manual${t.suffix}` }]);
    for (const name of ['Untouched', 'Pending', 'Rejected']) {
      // Exactly, by its start, and by a part of it
      expect(await found(`${name}${t.suffix}`, user.cookie)).toEqual([]);
      expect(await found(`${name}${t.suffix.slice(0, 4)}`, user.cookie)).toEqual([]);
      expect(await found(`${name.slice(2)}${t.suffix}`, user.cookie)).toEqual([]);
    }
    expect((await found(t.suffix, user.cookie)).map(({ name }) => name)).toEqual([
      `Classified${t.suffix}`,
      `Manual${t.suffix}`
    ]);
  });

  it('says nothing of a skill not recognised yet through the skills that point at it', async () => {
    const user = await createUser('targets');
    // The classifier made these up as targets, to classify later
    const pendingTarget = await skill(`Target${t.suffix}`, { classification: undefined });
    const pendingParent = await skill(`Family${t.suffix}`, { classification: status('pending') });
    await skill(`Spelling${t.suffix}`, { aliasOf: pendingTarget._id });
    await skill(`Child${t.suffix}`, { parent: pendingParent._id, category: 'tool' });

    // Another spelling of a skill not recognised yet: nothing to suggest
    expect(await found(`spelling${t.suffix}`, user.cookie)).toEqual([]);
    // The skill is suggested, without the family not recognised yet
    expect(await found(`child${t.suffix}`, user.cookie)).toEqual([{ name: `Child${t.suffix}`, category: 'tool' }]);
    const everything = JSON.stringify(await found(t.suffix, user.cookie));
    expect(everything).not.toContain(`Target${t.suffix}`);
    expect(everything).not.toContain(`Family${t.suffix}`);
  });

  it('resolves another spelling to its skill, with the spelling that matched, through the document of that spelling', async () => {
    const user = await createUser('alias');
    // As the catalogue holds them: the skill knows the casings of its own name, the other spelling is a document
    // of its own that points at it
    const kubernetes = await skill(`Kubernetes${t.suffix}`, {
      names: [`Kubernetes${t.suffix}`, `kubernetes${t.suffix}`],
      category: 'infrastructure',
      classification: status('manual')
    });
    const k8s = await skill(`K8s${t.suffix}`, {
      names: [`K8s${t.suffix}`, `k8s${t.suffix}`],
      aliasOf: kubernetes._id,
      classification: status('manual')
    });

    const canonical = { name: `Kubernetes${t.suffix}`, category: 'infrastructure' as const };
    // Typed as the alias, in any case: the skill once, and the spelling as the catalogue writes it
    expect(await found(`k8S${t.suffix}`, user.cookie)).toEqual([{ ...canonical, alias: `K8s${t.suffix}` }]);
    expect(await found(`k8s${t.suffix.slice(0, 5)}`, user.cookie)).toEqual([{ ...canonical, alias: `K8s${t.suffix}` }]);
    // Typed as the skill: no alias, and another casing of its name is not one
    expect(await found(`kubernetes${t.suffix}`, user.cookie)).toEqual([canonical]);
    expect(await found(`KUBERNETES${t.suffix}`, user.cookie)).toEqual([canonical]);
    // Both by a part of their names: the skill once, under its own name
    expect(await found(t.suffix, user.cookie)).toEqual([canonical]);

    // The alias unset by hand: the spelling is a skill of its own again, and the skill no longer answers to it
    await Skill.updateOne({ _id: k8s._id }, { $unset: { aliasOf: 1 } });
    expect(await found(`k8s${t.suffix}`, user.cookie)).toEqual([{ name: `K8s${t.suffix}` }]);
    // Not recognised (the classifier rejected it, or it waits): the spelling suggests nothing, even of its skill
    await Skill.updateOne({ _id: k8s._id }, { $set: { aliasOf: kubernetes._id, classification: status('rejected') } });
    expect(await found(`k8s${t.suffix}`, user.cookie)).toEqual([]);
  });

  it('suggests a skill once when its name and another spelling both match, under its name', async () => {
    const user = await createUser('once');
    const node = await skill(`Node${t.suffix}.js`);
    await skill(`Node${t.suffix}JS`, { aliasOf: node._id });
    // Both start with what was typed
    expect(await found(`node${t.suffix}`, user.cookie)).toEqual([{ name: `Node${t.suffix}.js` }]);
    // Only the other spelling does
    expect(await found(`node${t.suffix}j`, user.cookie)).toEqual([
      { name: `Node${t.suffix}.js`, alias: `Node${t.suffix}JS` }
    ]);
    // A spelling whose skill is gone stands for itself
    const orphan = await skill(`Orphan${t.suffix}`, { aliasOf: new mongoose.Types.ObjectId() });
    expect(await found(`orphan${t.suffix}`, user.cookie)).toEqual([{ name: orphan.displayName }]);
  });

  it('lists the skill typed first, then those starting with it, then those containing it, each by name', async () => {
    const user = await createUser('order');
    const q = `zq${t.suffix}`;
    // Stored in an order that is none of the answer's
    await skill(`The ${q} toolkit`);
    await skill(`${q} Streams`);
    await skill(`A ${q}`);
    await skill(`${q} Connect`);
    await skill(q.toUpperCase());
    const exactAlias = await skill(`Canonical${t.suffix}`);
    await skill(`${q} core`, { aliasOf: exactAlias._id });

    expect((await found(q, user.cookie)).map(({ name, alias }) => (alias ? `${alias} → ${name}` : name))).toEqual([
      q.toUpperCase(),
      // Starting with it: by the name of the skill suggested, whatever spelling matched
      `${q} core → Canonical${t.suffix}`,
      `${q} Connect`,
      `${q} Streams`,
      `A ${q}`,
      `The ${q} toolkit`
    ]);
  });

  it('takes what was typed literally: the characters of a regular expression mean nothing', async () => {
    const user = await createUser('literal');
    const s = t.suffix;
    await skill(`C++x${s}`);
    await skill(`Ccx${s}`);
    await skill(`C#x${s}`);
    await skill(`.NETx${s}`);
    await skill(`aNETx${s}`);
    await skill(`Fn (cloud) ${s}`);
    await skill(`Back\\slash${s}`);
    await skill(`Star*${s}`);
    await skill(`Brackets[a-z]${s}`);

    const names = async (q: string) => (await found(q, user.cookie)).map(({ name }) => name);
    // 'c++' is not "one or more c"
    expect(await names(`c++x${s}`)).toEqual([`C++x${s}`]);
    expect(await names(`c#x${s}`)).toEqual([`C#x${s}`]);
    // '.net' is not "any character, then net"
    expect(await names(`.netx${s}`)).toEqual([`.NETx${s}`]);
    expect(await names(`(cloud) ${s}`)).toEqual([`Fn (cloud) ${s}`]);
    expect(await names(`\\slash${s}`)).toEqual([`Back\\slash${s}`]);
    expect(await names(`*${s}`)).toEqual([`Star*${s}`]);
    expect(await names(`[a-z]${s}`)).toEqual([`Brackets[a-z]${s}`]);
    // Alone, each is a text like any other, never a pattern that fails
    for (const q of ['(', ')', '\\', '[', '*', '+', '?', '.', '^', '$', '|', '{', '.*', '(?i)', '\\d']) {
      expect((await search(q, user.cookie)).status).toBe(200);
    }
    // A text that looks like a number, a boolean or a date is a text
    for (const q of ['2026', '3.14', 'true', 'null', '2026-11-22']) {
      expect((await search(q, user.cookie)).status).toBe(200);
    }
    await skill(`365${s}`);
    expect(await names(`365${s}`)).toEqual([`365${s}`]);
    expect(await names(`.*${s}`)).toEqual([]);
    expect(await names(`\\w+x${s}`)).toEqual([]);
  });

  it('suggests 8 skills at most, the first by name, and finds the skill typed among many that start like it', async () => {
    const user = await createUser('many');
    const q = `many${t.suffix}`;
    for (let index = 12; index >= 1; index--) await skill(`${q} ${String(index).padStart(2, '0')}`);
    await skill(`Before ${q}`);
    const first = await found(q, user.cookie);
    expect(first).toHaveLength(SKILL_SEARCH.results);
    expect(first.map(({ name }) => name)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8].map((index) => `${q} ${String(index).padStart(2, '0')}`)
    );
    await skill(q);
    expect((await found(q, user.cookie)).map(({ name }) => name)).toEqual([
      q,
      ...[1, 2, 3, 4, 5, 6, 7].map((index) => `${q} ${String(index).padStart(2, '0')}`)
    ]);
  });

  it('reads a few documents for a short text, never every skill that has it', async () => {
    const find = spyOn(Skill, 'find');
    await skill(`Lots${t.suffix}`);
    for (let index = 0; index < 9; index++) await skill(`Lots${t.suffix} ${index}`);
    expect(await suggestSkills(`lots${t.suffix}`)).toHaveLength(SKILL_SEARCH.results);
    // The skill typed, then those starting with it: the answer is full, nothing looks further
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('stops an account that searches too much in a minute, and only that account', async () => {
    const [user, other] = [await createUser('eager'), await createUser('other')];
    expect(SKILL_SEARCHES_PER_USER).toEqual({ limit: 120, windowMs: 60_000 });
    // A window no minute's end can split while the test runs
    Object.assign(SKILL_SEARCHES_PER_USER, { limit: 2, windowMs: 24 * 60 * 60_000 });
    await skill(`Limited${t.suffix}`);
    expect((await search(`limited${t.suffix}`, user.cookie)).status).toBe(200);
    expect((await search(`limited${t.suffix}`, user.cookie)).status).toBe(200);
    const refused = await search(`limited${t.suffix}`, user.cookie);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(refused.text).toContain('Too many skill searches. Try again in');
    expect(refused.text).not.toContain(t.suffix);
    const french = await search(`limited${t.suffix}`, user.cookie, { 'Accept-Language': 'fr' });
    expect(french.status).toBe(429);
    expect(french.text).toContain('Trop de recherches de compétences. Réessayez dans');
    expect((await search(`limited${t.suffix}`, other.cookie)).status).toBe(200);

    // Keyed by a hash of the account, never by its id
    const counters = await RateLimitCounter.find({ _id: { $regex: '^skill-search:user' } }).lean();
    expect(counters).toHaveLength(2);
    expect(counters.filter((counter) => String(counter._id).includes(user.id))).toEqual([]);
  });

  it('logs nothing of what was typed, whatever the answer', async () => {
    const user = await createUser('quiet');
    await skill(`Typed${t.suffix}`);
    const typed = `typed${t.suffix}`;
    Object.assign(SKILL_SEARCHES_PER_USER, { limit: 2, windowMs: 24 * 60 * 60_000 });
    expect((await search(typed)).status).toBe(401);
    expect((await search(typed, user.cookie)).status).toBe(200);
    expect((await search(`${typed} ${'a'.repeat(SKILL_SEARCH.maxLength)}`, user.cookie)).status).toBe(422);
    expect((await search(`nothing like ${typed}`, user.cookie)).status).toBe(200);
    expect((await search(typed, user.cookie)).status).toBe(429);
    // The refusals are logged (401, 422, 429), without the text
    expect(logLines.length).toBeGreaterThanOrEqual(3);
    expect(logLines.filter((line) => line.toLowerCase().includes(t.suffix))).toEqual([]);
    expect(logLines.filter((line) => line.includes('skills/search?'))).toEqual([]);
  });

  it('is listed with the routes, under a pattern that holds nothing typed', async () => {
    const routes = app.routes.filter((route) => route.path.startsWith('/skills'));
    expect(routes.map((route) => `${route.method} ${route.path}`)).toEqual(['GET /skills/search']);
  });
});
