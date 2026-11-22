// The skill catalogue against a real MongoDB (MONGO_URL, local or from
// TEST_MONGO_URL): the Skill model (a name looked up is the document of the
// spelling typed, never the skill it is another spelling of; the skills
// still to classify, those the search may suggest), how the API presents the
// skills of an experience (an alias resolved when read: shown as its skill,
// once per list, with its category and the skill it is part of, nothing
// private; never when written: what is stored, and what matching's anonymous
// card shows, is the spelling typed), and the curated list the seeds apply. Each test names what it
// creates with a suffix of its own and removes it: they pass in any order.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import {
  SKILL_CATEGORIES,
  SKILL_CLASSIFICATION,
  normalizeSkill,
  parseSkillClassification,
  skillTaxonomy
} from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import { Domain, Experience, Skill, User } from '../models/database';
import {
  PENDING_SKILLS,
  SUGGESTABLE_SKILLS,
  isPendingSkill,
  onPendingSkillResolved
} from '../models/database/skill';
import { anonymousCard } from '../services/candidateCard';
import { peekRateLimit } from '../services/rateLimit';
import { NEW_SKILL_NAMES_PER_USER, newSkillNamesKey } from '../services/skillAllowance';
import { presentExperience, presentSkill } from '../services/experiencePresentation';
import { applySkillClassification } from '../services/skillClassifier';
import {
  CONSENT,
  experienceRequestBody,
  makeRequest,
  parseCookie,
  postJson,
  postWithCookie,
  putWithCookie,
  signGoogleIdToken,
  useTestGoogleKeys,
  readJson
} from './helpers';
import { SEED_ALIAS, SEED_FAMILY, SEED_SKILLS, seedSkillCatalogue } from './seedSkills';
import type { SeedSkill } from './seedSkills';
import { assertDisposableDatabase } from './testDatabase';

/** Names unique to one test: everything it creates carries its suffix */
const testNames = () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const id = (name: string) => `sc-${name}-${suffix}`;
  return { suffix, id, email: (name: string) => `${id(name)}@example.com` };
};

const removeTestData = async (suffix: string) => {
  const named = new RegExp(`-${suffix}(@|$)`);
  const userIds = (await User.find({ email: named }, '_id')).map((user) => user._id);
  const domains = await Domain.find({ $or: [{ admin: { $in: userIds } }, { name: named }] });
  await Experience.deleteMany({ _id: { $in: domains.flatMap((domain) => domain.experiences.map(String)) } });
  await Domain.deleteMany({ _id: { $in: domains.map((domain) => domain._id) } });
  await User.deleteMany({ _id: { $in: userIds } });
  await Skill.deleteMany({ displayName: new RegExp(named.source, 'i') });
};

let app: ReturnType<typeof createApp>;
let t: ReturnType<typeof testNames>;
let connected = false;

const manual = () => ({ status: 'manual' as const, at: new Date(), attempts: 0 });
const classified = () => ({ status: 'classified' as const, at: new Date(), attempts: 1 });

/** A skill of this test, stored as given */
const skill = (name: string, fields: Record<string, unknown> = {}) =>
  Skill.create({ displayName: t.id(name), names: [t.id(name)], ...fields });

const loginWithDomain = async (name: string, domainName: string, email = t.email(name)) => {
  const result = await postJson(app, '/login', {
    token: await signGoogleIdToken({ claims: { sub: t.id(`sub-${name}`), email } })
  });
  expect(result.status).toBe(200);
  const cookie = `auth=${parseCookie(result.headers.get('Set-Cookie') ?? '')['auth']}`;
  const claim = await postWithCookie(app, '/domain/claim', { name: domainName, consent: CONSENT }, cookie);
  expect(claim.status).toBe(200);
  return { cookie };
};

/** A request for an experience with one project using these skills (names of this test) */
const experienceBody = (hard: string[], soft: string[] = [], title = 'Platform engineer') => ({
  ...experienceRequestBody,
  title,
  projects: [
    {
      name: 'Platform',
      summary: 'Runs things',
      hardSkills: hard.map((name, index) => ({ name: t.id(name), level: index })),
      softSkills: soft.map((name) => ({ name: t.id(name), level: -1 }))
    }
  ]
});

beforeAll(async () => {
  assertDisposableDatabase(env.MONGO_URL);
  await mongoose.connect(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  connected = true;
  await Promise.all([User.init(), Domain.init(), Skill.init()]);
});

afterAll(async () => {
  if (connected) await mongoose.disconnect();
});

beforeEach(() => {
  t = testNames();
  app = createApp();
  useTestGoogleKeys();
});

afterEach(async () => {
  mock.restore();
  if (connected) await removeTestData(t.suffix);
});

describe('the Skill model', () => {
  it('has the indexes the search and the classification job read with', async () => {
    const indexes = (await Skill.collection.indexes()).map((index) => JSON.stringify(index.key));
    expect(indexes).toContain(JSON.stringify({ 'classification.status': 1, _id: 1 }));
    // The search's: by status then name, under the collation it runs with (the skills still to
    // classify are never read)
    const search = (await Skill.collection.indexes()).filter((index) => String(index.name).startsWith('status_'));
    expect(search.map((index) => [index.name, JSON.stringify(index.key), index.collation?.locale, index.collation?.strength]).sort()).toEqual([
      ['status_displayName_ci', JSON.stringify({ 'classification.status': 1, displayName: 1 }), 'en', 2],
      ['status_names_ci', JSON.stringify({ 'classification.status': 1, names: 1 }), 'en', 2]
    ]);
    expect(indexes).toContain(JSON.stringify({ parent: 1 }));
    expect(indexes).toContain(JSON.stringify({ aliasOf: 1 }));
  });

  it('stores a category, a parent, an alias and a classification, and refuses values that are not ones', async () => {
    const parent = await skill('dotnet', { category: 'framework', classification: manual() });
    const child = await skill('dotnet-core', { category: 'framework', parent: parent._id, classification: classified() });

    const stored = await Skill.findById(child._id).lean();
    expect(stored?.category).toBe('framework');
    expect(String(stored?.parent)).toBe(String(parent._id));
    expect(stored?.classification).toMatchObject({ status: 'classified', attempts: 1 });
    // A skill someone just typed has none of it
    const typed = await Skill.findById(await Skill.findOrCreate(t.id('typed'))).lean();
    expect(typed).toEqual({ _id: typed!._id, displayName: t.id('typed'), names: [t.id('typed')], __v: 0 });

    await expect(skill('bad-category', { category: 'weapons' })).rejects.toThrow(/category/);
    await expect(skill('bad-status', { classification: { status: 'approved' } })).rejects.toThrow(/status/);
    for (const category of SKILL_CATEGORIES) {
      expect((await skill(`category-${category}`, { category })).category).toBe(category);
    }
  });

  it('looks another spelling of a skill up as its own document, never as that skill, creating nothing', async () => {
    // Whatever the catalogue says of the target: recognised by hand, by the classifier, or not yet
    for (const [name, classification] of [
      ['manual', manual()],
      ['classified', classified()],
      ['pending', undefined]
    ] as const) {
      const canonical = await skill(`Kubernetes-${name}`, { category: 'infrastructure', classification });
      const alias = await skill(`K8s-${name}`, { aliasOf: canonical._id, classification: classified() });

      // What an experience stores: the spelling typed
      expect(String(await Skill.findOrCreate(t.id(`K8s-${name}`)))).toBe(String(alias._id));
      expect(String(await Skill.findOrCreate(` ${t.id(`k8S-${name}`).toUpperCase()} `))).toBe(String(alias._id));
      expect(String(await Skill.findOrCreate(t.id(`kubernetes-${name}`)))).toBe(String(canonical._id));
      // The classifier's own lookup still follows the alias
      expect(String((await Skill.findCanonical(t.id(`k8s-${name}`)))?._id)).toBe(String(canonical._id));

      // Nothing of either document changed but the casings of its own name it knows
      const [storedAlias, storedCanonical] = [await Skill.findById(alias._id).lean(), await Skill.findById(canonical._id).lean()];
      expect(storedAlias?.displayName).toBe(t.id(`K8s-${name}`));
      expect(String(storedAlias?.aliasOf)).toBe(String(canonical._id));
      expect(storedAlias?.names.map(normalizeSkill)).toEqual([normalizeSkill(t.id(`K8s-${name}`))]);
      expect(storedCanonical?.displayName).toBe(t.id(`Kubernetes-${name}`));
      expect(storedCanonical?.names).toEqual([t.id(`Kubernetes-${name}`)]);
    }
    expect(await Skill.countDocuments({ displayName: new RegExp(`-${t.suffix}$`, 'i') })).toBe(6);
  });

  it('resolves a name the skill itself knows (names), and an alias whose skill is gone to itself', async () => {
    const canonical = await Skill.create({
      displayName: t.id('PostgreSQL'),
      names: [t.id('PostgreSQL'), t.id('Postgres')]
    });
    expect(String(await Skill.findOrCreate(t.id('postgres')))).toBe(String(canonical._id));

    const orphan = await skill('Orphan', { aliasOf: new Types.ObjectId() });
    expect(String(await Skill.findOrCreate(t.id('orphan')))).toBe(String(orphan._id));
    expect(String((await Skill.findCanonical(t.id('orphan')))?._id)).toBe(String(orphan._id));
  });

  it('finds the canonical skill of a name without creating one', async () => {
    const canonical = await skill('Node.js', { classification: manual() });
    await skill('NodeJS', { aliasOf: canonical._id, classification: manual() });

    expect((await Skill.findCanonical(t.id('nodejs')))?.displayName).toBe(t.id('Node.js'));
    expect((await Skill.findCanonical(` ${t.id('NODE.JS')} `))?.displayName).toBe(t.id('Node.js'));
    expect(await Skill.findCanonical(t.id('deno'))).toBeNull();
    expect(await Skill.findCanonical('   ')).toBeNull();
    expect(await Skill.countDocuments({ displayName: new RegExp(`-${t.suffix}$`, 'i') })).toBe(2);
  });

  it('says which skills are still to classify, and which the search may suggest', async () => {
    const stored = {
      typed: await skill('typed'),
      pending: await skill('pending', { classification: { status: 'pending', at: new Date(), attempts: 1 } }),
      givenUp: await skill('given-up', {
        classification: { status: 'pending', at: new Date(), attempts: SKILL_CLASSIFICATION.maxAttempts }
      }),
      classified: await skill('classified', { classification: classified() }),
      rejected: await skill('rejected', { classification: { status: 'rejected', at: new Date(), attempts: 1 } }),
      manual: await skill('manual', { classification: manual() })
    };
    const mine = { displayName: new RegExp(`-${t.suffix}$`) };
    const names = async (filter: object) =>
      (await Skill.find({ ...mine, ...filter }).sort({ _id: 1 })).map((found) => found.displayName);

    // The oldest first, as the sweep reads them (it adds its own limit on the tries)
    expect(await names(PENDING_SKILLS)).toEqual([t.id('typed'), t.id('pending'), t.id('given-up')]);
    expect(await names(SUGGESTABLE_SKILLS)).toEqual([t.id('classified'), t.id('manual')]);

    expect(isPendingSkill(stored.typed)).toBe(true);
    expect(isPendingSkill(stored.pending)).toBe(true);
    expect(isPendingSkill(stored.givenUp)).toBe(false);
    expect(isPendingSkill(stored.classified)).toBe(false);
    expect(isPendingSkill(stored.rejected)).toBe(false);
    expect(isPendingSkill(stored.manual)).toBe(false);
  });

  it('tells its listeners when a name resolved to a skill still to classify, and only then', async () => {
    let calls = 0;
    const stop = onPendingSkillResolved(() => {
      calls += 1;
    });
    // A listener that throws never fails the lookup, nor stops the others
    const stopBroken = onPendingSkillResolved(() => {
      throw new Error('listener failed');
    });
    try {
      const known = await skill('known', { classification: manual() });
      await skill('alias-of-known', { aliasOf: known._id, classification: classified() });
      await skill('refused', { classification: { status: 'rejected', at: new Date(), attempts: 1 } });
      await skill('given-up', {
        classification: { status: 'pending', at: new Date(), attempts: SKILL_CLASSIFICATION.maxAttempts }
      });
      const waiting = await skill('waiting');
      await skill('alias-of-waiting', { aliasOf: waiting._id, classification: classified() });

      for (const name of ['known', 'alias-of-known', 'refused', 'given-up']) await Skill.findOrCreate(t.id(name));
      expect(calls).toBe(0);

      await Skill.findOrCreate(t.id('brand-new'));
      expect(calls).toBe(1);
      await Skill.findOrCreate(t.id('waiting'));
      expect(calls).toBe(2);
      // Another spelling of a skill still to classify
      await Skill.findOrCreate(t.id('alias-of-waiting'));
      expect(calls).toBe(3);

      stop();
      await Skill.findOrCreate(t.id('brand-new'));
      expect(calls).toBe(3);
    } finally {
      stop();
      stopBroken();
    }
  });
});

describe('presentSkill and presentExperience', () => {
  const id = () => new Types.ObjectId();
  /** As the API reads it of a skill another one points at: shown only once recognised */
  const recognised = { status: 'classified' };

  it('shows a skill with its category and the skill it is part of, and nothing else', () => {
    const [own, parent] = [id(), id()];
    expect(
      presentSkill({
        _id: own,
        displayName: '.NET Core',
        category: 'framework',
        names: ['.NET Core', 'dotnet core'],
        classification: { status: 'classified', at: new Date(), attempts: 1 },
        svg: '<svg/>',
        __v: 3,
        parent: { _id: parent, displayName: '.NET', category: 'framework', names: ['.NET'], parent: id(), classification: recognised }
      })
    ).toEqual({
      _id: String(own),
      displayName: '.NET Core',
      category: 'framework',
      parent: { _id: String(parent), displayName: '.NET', category: 'framework' }
    });
    expect(presentSkill({ _id: own, displayName: 'Go', category: 'weapons', parent: parent })).toEqual({
      _id: String(own),
      displayName: 'Go'
    });
  });

  it('shows another spelling of a skill as that skill, with that skill’s category and parent', () => {
    const [alias, canonical, parent] = [id(), id(), id()];
    expect(
      presentSkill({
        _id: alias,
        displayName: 'Cosmos',
        // An alias has none of its own: whatever it holds is not shown
        category: 'tool',
        parent: { _id: id(), displayName: 'Space' },
        aliasOf: {
          _id: canonical,
          displayName: 'Cosmos DB',
          category: 'data',
          classification: { status: 'manual' },
          parent: { _id: parent, displayName: 'Microsoft Azure', category: 'infrastructure', classification: recognised }
        }
      })
    ).toEqual({
      _id: String(canonical),
      displayName: 'Cosmos DB',
      category: 'data',
      parent: { _id: String(parent), displayName: 'Microsoft Azure', category: 'infrastructure' }
    });
  });

  it('shows a parent that became another spelling of a skill as that skill, and never a skill as its own parent', () => {
    const [own, parent, canonical] = [id(), id(), id()];
    expect(
      presentSkill({
        _id: own,
        displayName: 'Debian',
        parent: {
          _id: parent,
          displayName: 'GNU/Linux',
          classification: recognised,
          aliasOf: { _id: canonical, displayName: 'Linux', category: 'infrastructure', classification: recognised }
        }
      })
    ).toEqual({
      _id: String(own),
      displayName: 'Debian',
      parent: { _id: String(canonical), displayName: 'Linux', category: 'infrastructure' }
    });
    expect(presentSkill({ _id: own, displayName: 'Loop', parent: { _id: own, displayName: 'Loop', classification: recognised } })).toEqual({
      _id: String(own),
      displayName: 'Loop'
    });
    expect(
      presentSkill({
        _id: own,
        displayName: 'Loop',
        parent: {
          _id: parent,
          displayName: 'Alias',
          classification: recognised,
          aliasOf: { _id: own, displayName: 'Loop', classification: recognised }
        }
      })
    ).toEqual({ _id: String(own), displayName: 'Loop' });
  });

  it('shows the skill another one points at only once it is recognised as a skill', () => {
    const [own, target, parent] = [id(), id(), id()];
    for (const classification of [undefined, null, {}, { status: 'pending' }, { status: 'rejected' }, { status: 'approved' }]) {
      // Another spelling of a skill nobody recognised yet (the classifier made it up, to classify
      // later): shown as typed, with what it holds itself
      expect(
        presentSkill({
          _id: own,
          displayName: 'K8s',
          classification: { status: 'classified' },
          aliasOf: { _id: target, displayName: 'Made up', category: 'tool', classification }
        })
      ).toEqual({ _id: String(own), displayName: 'K8s' });
      // Part of one: shown without a family
      expect(
        presentSkill({
          _id: own,
          displayName: '.NET Core',
          category: 'framework',
          parent: { _id: parent, displayName: 'Made up', category: 'framework', classification }
        })
      ).toEqual({ _id: String(own), displayName: '.NET Core', category: 'framework' });
      // Part of a recognised spelling of one: that spelling is the family, as it is written
      expect(
        presentSkill({
          _id: own,
          displayName: 'Debian',
          parent: {
            _id: parent,
            displayName: 'GNU/Linux',
            category: 'infrastructure',
            classification: recognised,
            aliasOf: { _id: target, displayName: 'Made up', classification }
          }
        })
      ).toEqual({
        _id: String(own),
        displayName: 'Debian',
        parent: { _id: String(parent), displayName: 'GNU/Linux', category: 'infrastructure' }
      });
    }
    // The skill of the entry itself is the owner's, shown whatever the catalogue thinks of it
    for (const status of ['pending', 'rejected']) {
      expect(presentSkill({ _id: own, displayName: 'My own word', classification: { status } })).toEqual({
        _id: String(own),
        displayName: 'My own word'
      });
    }
  });

  it('gives nothing for a reference that was not populated', () => {
    for (const stored of [id(), String(id()), null, undefined, {}, { displayName: 'No id' }, { _id: id() }, { _id: id(), displayName: 3 }]) {
      expect(presentSkill(stored)).toBeUndefined();
    }
  });

  it('lists each skill once per list, the first entry kept, and leaves the rest of the experience as it is', () => {
    const [kubernetes, k8s, go, gone] = [id(), id(), id(), id()];
    const canonical = { _id: kubernetes, displayName: 'Kubernetes', category: 'infrastructure', classification: recognised };
    const experience = {
      _id: id(),
      title: 'Engineer',
      projects: [
        {
          _id: id(),
          name: 'Platform',
          hardSkills: [
            { _id: 'entry-1', level: 2, skill: { _id: k8s, displayName: 'K8s', aliasOf: canonical } },
            { _id: 'entry-2', level: 5, skill: { _id: go, displayName: 'Go' } },
            { _id: 'entry-3', level: 9, skill: canonical },
            { _id: 'entry-4', level: 1, skill: null },
            { _id: 'entry-5', level: 1, skill: gone }
          ],
          // Lists are apart: the same skill may be in both
          softSkills: [{ _id: 'entry-6', level: -1, skill: canonical }]
        }
      ]
    };
    const before = JSON.stringify(experience);

    const shown = presentExperience(experience);

    const presented = { _id: String(kubernetes), displayName: 'Kubernetes', category: 'infrastructure' };
    expect(shown).toEqual({
      _id: experience._id,
      title: 'Engineer',
      projects: [
        {
          _id: experience.projects[0]._id,
          name: 'Platform',
          hardSkills: [
            { _id: 'entry-1', level: 2, skill: presented },
            { _id: 'entry-2', level: 5, skill: { _id: String(go), displayName: 'Go' } },
            // A skill that no longer exists stays as stored (the client shows none)
            { _id: 'entry-4', level: 1, skill: null },
            { _id: 'entry-5', level: 1, skill: gone }
          ],
          softSkills: [{ _id: 'entry-6', level: -1, skill: presented }]
        }
      ]
    } as unknown as typeof experience);
    expect(JSON.stringify(experience)).toBe(before);
    expect(presentExperience({ title: 'No projects', projects: null })).toEqual({ title: 'No projects', projects: null });
  });
});

describe('the skills of an experience as the API returns them', () => {
  /** Everything the API said of skills, to look for what it must never say */
  const expectNothingPrivate = (body: unknown) => {
    const json = JSON.stringify(body);
    for (const field of ['"names"', '"classification"', '"aliasOf"', '"attempts"', '"svg"']) {
      expect(json).not.toContain(field);
    }
    const skills = (body as { projects: { hardSkills: { skill: object }[]; softSkills: { skill: object }[] }[] }).projects
      .flatMap((project) => [...project.hardSkills, ...project.softSkills])
      .map((entry) => entry.skill);
    for (const shown of skills) {
      expect(Object.keys(shown).filter((key) => !['_id', 'displayName', 'category', 'parent'].includes(key))).toEqual([]);
      const parent = (shown as { parent?: object }).parent;
      if (parent) {
        expect(Object.keys(parent).filter((key) => !['_id', 'displayName', 'category'].includes(key))).toEqual([]);
      }
    }
  };

  it('shows a skill typed before it was known as another spelling as its skill, once, with its family', async () => {
    const domainName = t.id('domain');
    const owner = await loginWithDomain('owner', domainName);

    // Typed first: the experience references the documents of 'k8s' and of 'Kubernetes'
    const created = await postWithCookie(app, '/experiences', experienceBody(['k8s', 'Kafka', 'Kubernetes'], ['k8s']), owner.cookie);
    expect(created.status).toBe(200);
    const before = await readJson(created);
    expect(before.projects[0].hardSkills.map((entry: { skill: { displayName: string } }) => entry.skill.displayName)).toEqual([
      t.id('k8s'),
      t.id('Kafka'),
      t.id('Kubernetes')
    ]);
    expectNothingPrivate(before);
    const stored = (await Experience.findById(before._id).lean())!;
    const storedIds = stored.projects[0].hardSkills.map((entry) => String(entry.skill));

    // The catalogue then learns what they are (as the classifier or a seed writes it)
    const family = await skill('Orchestration', { category: 'infrastructure', classification: manual() });
    const kubernetes = (await Skill.findCanonical(t.id('Kubernetes')))!;
    await Skill.updateOne(
      { _id: kubernetes._id },
      { $set: { category: 'infrastructure', parent: family._id, classification: classified() } }
    );
    await Skill.updateOne(
      { displayName: t.id('k8s') },
      { $set: { aliasOf: kubernetes._id, classification: classified() } }
    );
    await Skill.updateOne({ displayName: t.id('Kafka') }, { $set: { category: 'data', classification: classified() } });

    const domain = await readJson(await makeRequest(app, `/domain/${domainName}`));
    const [shown] = domain.experiences;
    const kubernetesShown = {
      _id: String(kubernetes._id),
      displayName: t.id('Kubernetes'),
      category: 'infrastructure',
      parent: { _id: String(family._id), displayName: t.id('Orchestration'), category: 'infrastructure' }
    };
    // The alias and the skill are one entry, the first kept (its place and its level)
    expect(shown.projects[0].hardSkills).toEqual([
      { _id: expect.any(String), level: 0, skill: kubernetesShown },
      { _id: expect.any(String), level: 1, skill: { _id: expect.any(String), displayName: t.id('Kafka'), category: 'data' } }
    ]);
    expect(shown.projects[0].softSkills).toEqual([{ _id: expect.any(String), level: -1, skill: kubernetesShown }]);
    expectNothingPrivate(shown);

    // Nothing stored was rewritten: the experience still references what was typed
    const after = (await Experience.findById(before._id).lean())!;
    expect(after.projects[0].hardSkills.map((entry) => String(entry.skill))).toEqual(storedIds);

    // What the client reads of it: one family, the parent the owner never typed included
    const taxonomy = skillTaxonomy(domain.experiences);
    expect(taxonomy.get(normalizeSkill(t.id('Orchestration')))).toEqual({
      key: normalizeSkill(t.id('Orchestration')),
      label: t.id('Orchestration'),
      category: 'infrastructure',
      childKeys: [normalizeSkill(t.id('Kubernetes'))]
    });
  });

  it('stores the spelling typed when a known alias is typed, and returns it presented as its skill from POST and PUT', async () => {
    const domainName = t.id('domain');
    const owner = await loginWithDomain('owner', domainName);
    const root = await skill('Linux', { category: 'infrastructure', classification: manual() });
    const debian = await skill('Debian', { category: 'infrastructure', parent: root._id, classification: manual() });
    const alias = await skill('Deb', { aliasOf: debian._id, classification: manual() });
    const debianShown = {
      _id: String(debian._id),
      displayName: t.id('Debian'),
      category: 'infrastructure',
      parent: { _id: String(root._id), displayName: t.id('Linux'), category: 'infrastructure' }
    };
    const shownSkills = (body: { projects: { hardSkills: { level: number; skill: unknown }[] }[] }) =>
      body.projects[0].hardSkills.map((entry) => entry.skill);

    const created = await postWithCookie(app, '/experiences', experienceBody(['deb', 'Debian', 'New thing']), owner.cookie);
    expect(created.status).toBe(200);
    const body = await readJson(created);
    // Read: the alias is its skill, once though two spellings of it were typed, the first entry kept
    expect(shownSkills(body)).toEqual([
      debianShown,
      // Just typed: no category yet
      { _id: expect.any(String), displayName: t.id('New thing') }
    ]);
    expect(body.projects[0].hardSkills[0].level).toBe(0);
    expectNothingPrivate(body);
    // Written: the document of each spelling typed, the alias's own included, never the skill in its place
    const stored = (await Experience.findById(body._id).lean())!;
    expect(stored.projects[0].hardSkills.map((entry) => String(entry.skill))).toEqual([
      String(alias._id),
      String(debian._id),
      String((await Skill.findOne({ displayName: t.id('New thing') }))!._id)
    ]);
    // The same from GET /domain/:name
    const read = async () => (await readJson(await makeRequest(app, `/domain/${domainName}`))).experiences[0];
    expect(shownSkills(await read())).toEqual(shownSkills(body));

    const edited = await putWithCookie(app, `/experiences/${body._id}`, experienceBody(['DEB'], ['Linux']), owner.cookie);
    expect(edited.status).toBe(200);
    const editedBody = await readJson(edited);
    expect(shownSkills(editedBody)).toEqual([debianShown]);
    expect(editedBody.projects[0].softSkills.map((entry: { skill: unknown }) => entry.skill)).toEqual([
      { _id: String(root._id), displayName: t.id('Linux'), category: 'infrastructure' }
    ]);
    expectNothingPrivate(editedBody);
    const storedAfter = (await Experience.findById(body._id).lean())!;
    expect(storedAfter.projects[0].hardSkills.map((entry) => String(entry.skill))).toEqual([String(alias._id)]);
    // Neither document learnt the other's spelling
    expect((await Skill.findById(debian._id).lean())!.names).toEqual([t.id('Debian')]);
    expect((await Skill.findById(alias._id).lean())!.names.map(normalizeSkill)).toEqual([normalizeSkill(t.id('Deb'))]);
  });

  it('brings back the spelling typed on every experience, old and new, once the alias is unset by hand', async () => {
    const domainName = t.id('domain');
    const owner = await loginWithDomain('owner', domainName);
    const shownNames = (experience: { projects: { hardSkills: { skill: { displayName: string } }[] }[] }) =>
      experience.projects[0].hardSkills.map((entry) => entry.skill.displayName);
    const read = async (): Promise<Record<string, string[]>> =>
      Object.fromEntries(
        (await readJson(await makeRequest(app, `/domain/${domainName}`))).experiences.map(
          (experience: { title: string; projects: { hardSkills: { skill: { displayName: string } }[] }[] }) => [
            experience.title,
            shownNames(experience)
          ]
        )
      );

    // Saved before the catalogue knew anything of either name
    const before = await postWithCookie(app, '/experiences', experienceBody(['Postgres', 'Go'], [], 'Before'), owner.cookie);
    expect(before.status).toBe(200);
    expect(shownNames(await readJson(before))).toEqual([t.id('Postgres'), t.id('Go')]);

    // The classifier then says 'Postgres' is another spelling of 'PostgreSQL', which it recognises
    const typed = (await Skill.findOne({ displayName: t.id('Postgres') }))!;
    const [said] = parseSkillClassification(
      [{ recognised: true, category: 'data', aliasOf: t.id('PostgreSQL'), aliasKind: 'spelling' }],
      [t.id('Postgres')]
    );
    expect(await applySkillClassification(typed._id, said!)).toBe('classified');
    const target = (await Skill.findOne({ displayName: t.id('PostgreSQL') }))!;
    expect(await applySkillClassification(target._id, { name: t.id('PostgreSQL'), recognised: true, canonical: t.id('PostgreSQL'), category: 'data' })).toBe(
      'classified'
    );

    // Saved after it: the same spelling, typed again in another casing
    const after = await postWithCookie(app, '/experiences', experienceBody(['postgres', 'Kafka'], [], 'After'), owner.cookie);
    expect(after.status).toBe(200);
    expect(shownNames(await readJson(after))).toEqual([t.id('PostgreSQL'), t.id('Kafka')]);
    expect(await read()).toEqual({
      Before: [t.id('PostgreSQL'), t.id('Go')],
      After: [t.id('PostgreSQL'), t.id('Kafka')]
    });
    // Both reference the document of the spelling typed, which is all the classifier wrote to
    const references = async () => {
      const ids = (await Domain.findOne({ name: domainName }))!.experiences.map(String);
      const experiences = await Experience.find({ _id: { $in: ids } }).lean();
      return experiences.map((experience) => String(experience.projects[0].hardSkills[0].skill));
    };
    expect(await references()).toEqual([String(typed._id), String(typed._id)]);
    expect((await Skill.findById(target._id).lean())!.names).toEqual([t.id('PostgreSQL')]);

    // A wrong answer is undone by changing that one field of that one document
    await Skill.updateOne({ _id: typed._id }, { $unset: { aliasOf: 1 } });

    expect(await read()).toEqual({
      Before: [t.id('Postgres'), t.id('Go')],
      After: [t.id('Postgres'), t.id('Kafka')]
    });
    expect(await references()).toEqual([String(typed._id), String(typed._id)]);
    // And for what is saved from then on
    const later = await postWithCookie(app, '/experiences', experienceBody(['POSTGRES'], [], 'Later'), owner.cookie);
    expect(shownNames(await readJson(later))).toEqual([t.id('Postgres')]);
    expect((await read()).Later).toEqual([t.id('Postgres')]);
  });

  it('shows the spelling typed on the anonymous card of matching, for an experience saved after its alias was classified', async () => {
    const domainName = t.id('domain');
    // An address whose words are in no skill name of this test: the card leaves out a skill that names its candidate
    const email = `card.reader@sc${t.suffix}.example.com`;
    try {
      const owner = await loginWithDomain('reader', domainName, email);
      const user = (await User.findOne({ email }))!;

      // The classifier said 'K8s' is another spelling of 'Kubernetes', and recognised both
      const typed = await skill('K8s');
      const [said] = parseSkillClassification(
        [{ recognised: true, category: 'infrastructure', aliasOf: t.id('Kubernetes'), aliasKind: 'abbreviation' }],
        [t.id('K8s')]
      );
      expect(await applySkillClassification(typed._id, said!)).toBe('classified');
      const target = (await Skill.findOne({ displayName: t.id('Kubernetes') }))!;
      expect(
        await applySkillClassification(target._id, {
          name: t.id('Kubernetes'),
          recognised: true,
          canonical: t.id('Kubernetes'),
          category: 'infrastructure'
        })
      ).toBe('classified');

      // Saved afterwards
      const created = await postWithCookie(app, '/experiences', experienceBody(['k8s', 'Go']), owner.cookie);
      expect(created.status).toBe(200);
      const body = await readJson(created);
      // The portfolio reads it as the skill
      expect(body.projects[0].hardSkills.map((entry: { skill: { displayName: string } }) => entry.skill.displayName)).toEqual([
        t.id('Kubernetes'),
        t.id('Go')
      ]);
      // What is stored is the spelling typed, so the card, which reads the stored skill's own name, never shows a
      // name a model chose
      const stored = (await Experience.findById(body._id).lean())!;
      expect(String(stored.projects[0].hardSkills[0].skill)).toBe(String(typed._id));
      const card = await anonymousCard(String(user._id));
      expect(card.skills.map(({ name }) => name).sort()).toEqual([t.id('Go'), t.id('K8s')].sort());
      expect(JSON.stringify(card)).not.toContain(t.id('Kubernetes'));
    } finally {
      await User.deleteOne({ email });
    }
  });

  it('keeps the spellings an experience stores when the editor saves back the names the API showed', async () => {
    const domainName = t.id('domain');
    // An address whose words are in no skill name of this test (see the card's test above)
    const email = `round.trip@sc${t.suffix}.example.com`;
    try {
      const owner = await loginWithDomain('editor', domainName, email);
      const user = (await User.findOne({ email }))!;
      type Shown = { title: string; projects: { name: string; hardSkills: { level: number; skill: { displayName: string } }[] }[] };
      const shown = (experience: Shown) => experience.projects.map((project) => project.hardSkills.map((entry) => `${entry.skill.displayName}@${entry.level}`));
      const read = async (): Promise<Shown & { _id: string }> => (await readJson(await makeRequest(app, `/domain/${domainName}`))).experiences[0];
      const storedEntries = async (id: string) => {
        const experience = (await Experience.findById(id).lean())!;
        return experience.projects.map((project) => project.hardSkills.map((entry) => `${String(entry.skill)}@${entry.level}`));
      };
      /** What the editor sends: the experience as the API showed it, each skill by the name shown */
      const asEdited = (experience: Shown, changes: Record<string, unknown> = {}) => ({
        ...experienceRequestBody,
        title: experience.title,
        projects: experience.projects.map((project) => ({
          name: project.name,
          summary: 'Runs things',
          hardSkills: project.hardSkills.map((entry) => ({ name: entry.skill.displayName, level: entry.level })),
          softSkills: []
        })),
        ...changes
      });

      // Typed before the catalogue knew anything: two spellings of one skill among them, with a level each
      const created = await postWithCookie(app, '/experiences', experienceBody(['Postgres', 'K8s', 'Kubernetes', 'Go']), owner.cookie);
      expect(created.status).toBe(200);
      const { _id } = await readJson(created);
      const id = Object.fromEntries(
        await Promise.all(
          ['Postgres', 'K8s', 'Kubernetes', 'Go'].map(async (name) => [name, String((await Skill.findOne({ displayName: t.id(name) }))!._id)] as const)
        )
      );
      // The classifier: Postgres is another spelling of PostgreSQL (which it creates), K8s of Kubernetes; all recognised
      const say = async (name: string, said: Record<string, unknown>) => {
        const [result] = parseSkillClassification([{ recognised: true, category: 'data', ...said }], [t.id(name)]);
        expect(await applySkillClassification((await Skill.findOne({ displayName: t.id(name) }))!._id, result!)).toBe('classified');
      };
      await say('Postgres', { aliasOf: t.id('PostgreSQL'), aliasKind: 'spelling' });
      await say('PostgreSQL', {});
      await say('K8s', { aliasOf: t.id('Kubernetes'), aliasKind: 'abbreviation' });
      await say('Kubernetes', {});

      const typed = [[`${id.Postgres}@0`, `${id.K8s}@1`, `${id.Kubernetes}@2`, `${id.Go}@3`]];
      const cardBefore = (await anonymousCard(String(user._id))).skills.map(({ name }) => name).sort();
      expect(cardBefore).toEqual(['Go', 'K8s', 'Kubernetes', 'Postgres'].map(t.id).sort());
      const before = await read();
      expect(shown(before)).toEqual([[`${t.id('PostgreSQL')}@0`, `${t.id('Kubernetes')}@1`, `${t.id('Go')}@3`]]);

      // The owner opens the editor, changes the title alone and saves
      const edited = await putWithCookie(app, `/experiences/${_id}`, asEdited(before, { title: 'Staff engineer' }), owner.cookie);
      expect(edited.status).toBe(200);
      expect(shown(await readJson(edited))).toEqual(shown(before));
      expect((await read()).title).toBe('Staff engineer');
      // Nothing of what was typed changed: each spelling's own document, both spellings of the one skill, each level
      expect(await storedEntries(_id)).toEqual(typed);
      expect((await anonymousCard(String(user._id))).skills.map(({ name }) => name).sort()).toEqual(cardBefore);

      // A level changed in the editor is the level of the entry that was shown; a project renamed where it stands keeps its spellings
      const levelled = asEdited(await read());
      levelled.projects[0].hardSkills[1].level = 9;
      levelled.projects[0].name = 'Platform, renamed';
      expect((await putWithCookie(app, `/experiences/${_id}`, levelled, owner.cookie)).status).toBe(200);
      expect(await storedEntries(_id)).toEqual([[`${id.Postgres}@0`, `${id.K8s}@9`, `${id.Kubernetes}@2`, `${id.Go}@3`]]);
      expect(shown(await read())).toEqual([[`${t.id('PostgreSQL')}@0`, `${t.id('Kubernetes')}@9`, `${t.id('Go')}@3`]]);

      // A project added before it, where the usual name is typed: that project stores the name typed there,
      // the project that moved keeps its own spellings
      const moved = asEdited(await read());
      moved.projects.unshift({ name: 'New project', summary: 'Runs things', hardSkills: [{ name: t.id('Kubernetes'), level: 4 }], softSkills: [] });
      expect((await putWithCookie(app, `/experiences/${_id}`, moved, owner.cookie)).status).toBe(200);
      expect(await storedEntries(_id)).toEqual([[`${id.Kubernetes}@4`], [`${id.Postgres}@0`, `${id.K8s}@9`, `${id.Kubernetes}@2`, `${id.Go}@3`]]);

      // What a model said is still undone by one field, on an experience that was edited since
      await Skill.updateMany({ _id: { $in: [id.Postgres, id.K8s] } }, { $unset: { aliasOf: 1 } });
      expect(shown(await read())).toEqual([
        [`${t.id('Kubernetes')}@4`],
        [`${t.id('Postgres')}@0`, `${t.id('K8s')}@9`, `${t.id('Kubernetes')}@2`, `${t.id('Go')}@3`]
      ]);
      expect((await anonymousCard(String(user._id))).skills.map(({ name }) => name).sort()).toEqual(cardBefore);
      expect(JSON.stringify(await anonymousCard(String(user._id)))).not.toContain(t.id('PostgreSQL'));
    } finally {
      await User.deleteOne({ email });
    }
  });

  it('removes every spelling of a skill taken out in the editor, and stores a spelling typed again as itself', async () => {
    const domainName = t.id('domain');
    const owner = await loginWithDomain('owner', domainName);
    const kubernetes = await skill('Kubernetes', { category: 'infrastructure', classification: manual() });
    const alias = await skill('K8s', { aliasOf: kubernetes._id, classification: manual() });
    const stored = async (id: string) => (await Experience.findById(id).lean())!.projects[0].hardSkills.map((entry) => String(entry.skill));

    const created = await readJson(await postWithCookie(app, '/experiences', experienceBody(['K8s', 'Kubernetes', 'Go']), owner.cookie));
    const go = String((await Skill.findOne({ displayName: t.id('Go') }))!._id);
    expect(await stored(created._id)).toEqual([String(alias._id), String(kubernetes._id), go]);

    // The alias typed again by itself: its own document, once
    expect((await putWithCookie(app, `/experiences/${created._id}`, experienceBody(['k8s', 'Kubernetes', 'Go']), owner.cookie)).status).toBe(200);
    expect(await stored(created._id)).toEqual([String(alias._id), String(kubernetes._id), go]);
    // Kubernetes taken out in the editor, which showed one tag for both spellings: both go
    expect((await putWithCookie(app, `/experiences/${created._id}`, experienceBody(['Go']), owner.cookie)).status).toBe(200);
    expect(await stored(created._id)).toEqual([go]);
  });

  it('never puts a skill nobody recognised yet in place of, or above, what was typed', async () => {
    const domainName = t.id('domain');
    const owner = await loginWithDomain('owner', domainName);
    // As the classifier leaves them between two batches: it made up the skill these point at
    // (from a model's answer), which is still to classify itself
    const madeUp = await skill('Made up');
    const alias = await skill('Mu', { aliasOf: madeUp._id, classification: classified() });
    const child = await skill('Mu Core', { category: 'framework', parent: madeUp._id, classification: classified() });
    const shownSkills = (body: { projects: { hardSkills: { skill: unknown }[] }[] }) =>
      body.projects[0].hardSkills.map((entry) => entry.skill);
    const asTyped = [
      { _id: String(alias._id), displayName: t.id('Mu') },
      { _id: String(child._id), displayName: t.id('Mu Core'), category: 'framework' }
    ];

    // Saved meanwhile: the experience references the spelling typed, not the made-up skill
    const created = await postWithCookie(app, '/experiences', experienceBody(['mu', 'Mu Core']), owner.cookie);
    expect(created.status).toBe(200);
    const body = await readJson(created);
    expect(shownSkills(body)).toEqual(asTyped);
    const stored = (await Experience.findById(body._id).lean())!;
    expect(stored.projects[0].hardSkills.map((entry) => String(entry.skill))).toEqual([String(alias._id), String(child._id)]);
    expect(JSON.stringify(body)).not.toContain(t.id('Made up'));
    expectNothingPrivate(body);

    const read = async () => (await readJson(await makeRequest(app, `/domain/${domainName}`))).experiences[0];
    expect(shownSkills(await read())).toEqual(asTyped);

    // Not a skill after all, or given up on: still as typed
    for (const status of ['rejected', 'pending'] as const) {
      await Skill.updateOne(
        { _id: madeUp._id },
        { $set: { classification: { status, at: new Date(), attempts: SKILL_CLASSIFICATION.maxAttempts } } }
      );
      const shown = await read();
      expect(shownSkills(shown)).toEqual(asTyped);
      expectNothingPrivate(shown);
    }

    // Recognised: the spelling is that skill, the other one is part of it; nothing stored changed
    await Skill.updateOne({ _id: madeUp._id }, { $set: { category: 'framework', classification: classified() } });
    const recognised = { _id: String(madeUp._id), displayName: t.id('Made up'), category: 'framework' };
    const shown = await read();
    expect(shownSkills(shown)).toEqual([recognised, { ...asTyped[1], parent: recognised }]);
    expectNothingPrivate(shown);
    // A save still stores the spelling typed
    expect(String(await Skill.findOrCreate(t.id('mu')))).toBe(String(alias._id));
  });

  it('still shows, as typed, a skill the classifier did not recognise, and survives a skill that is gone', async () => {
    const domainName = t.id('domain');
    const owner = await loginWithDomain('owner', domainName);
    const created = await postWithCookie(app, '/experiences', experienceBody(['qwertyish', 'Vanishing', 'Go']), owner.cookie);
    expect(created.status).toBe(200);
    await Skill.updateOne(
      { displayName: t.id('qwertyish') },
      { $set: { classification: { status: 'rejected', at: new Date(), attempts: 1 } } }
    );
    await Skill.deleteOne({ displayName: t.id('Vanishing') });

    const response = await makeRequest(app, `/domain/${domainName}`);
    expect(response.status).toBe(200);
    const domain = await readJson(response);
    expect(domain.experiences[0].projects[0].hardSkills.map((entry: { skill: unknown }) => entry.skill)).toEqual([
      { _id: expect.any(String), displayName: t.id('qwertyish') },
      null,
      { _id: expect.any(String), displayName: t.id('Go') }
    ]);
  });
});

describe('the names one account adds to what the classifier is asked', () => {
  const savedLimit = { ...NEW_SKILL_NAMES_PER_USER };
  afterEach(() => {
    Object.assign(NEW_SKILL_NAMES_PER_USER, savedLimit);
  });

  it('are bounded per day: those beyond are stored and shown as typed, held back, and never sent', async () => {
    expect(NEW_SKILL_NAMES_PER_USER).toEqual({ limit: SKILL_CLASSIFICATION.newNamesPerDay, windowMs: 24 * 60 * 60_000 });
    NEW_SKILL_NAMES_PER_USER.limit = 3;
    const owner = await loginWithDomain('flood', t.id('flood'));
    const user = (await User.findOne({ email: t.email('flood') }))!;
    const other = await loginWithDomain('other', t.id('other'));
    await skill('Known', { category: 'tool', classification: manual() });
    let woken = 0;
    const remove = onPendingSkillResolved(() => (woken += 1));
    try {
      const names = ['New 1', 'known', 'New 2', 'New 3', 'New 4', 'New 5'];
      const created = await postWithCookie(app, '/experiences', experienceBody(names), owner.cookie);
      // The save is never refused, and shows every name as typed
      expect(created.status).toBe(200);
      const body = await readJson(created);
      expect(body.projects[0].hardSkills.map((entry: { skill: { displayName: string } }) => entry.skill.displayName)).toEqual(
        ['New 1', 'Known', 'New 2', 'New 3', 'New 4', 'New 5'].map(t.id)
      );
      const state = async (name: string) => (await Skill.findOne({ displayName: t.id(name) }).lean())!;
      // The first three new names wait for the classifier, as any skill just typed
      for (const name of ['New 1', 'New 2', 'New 3']) {
        expect((await state(name)).classification).toBeUndefined();
        expect(isPendingSkill(await state(name))).toBe(true);
      }
      // Those beyond the day's allowance are held back: kept, never sent
      for (const name of ['New 4', 'New 5']) {
        expect((await state(name)).classification).toMatchObject({ status: 'pending', attempts: 0, held: true });
        expect(isPendingSkill(await state(name))).toBe(false);
      }
      // Counted on a key that is a hash of the account, all five of them
      const key = newSkillNamesKey(String(user._id));
      expect(key).not.toContain(String(user._id));
      expect((await peekRateLimit(key, NEW_SKILL_NAMES_PER_USER)).count).toBe(5);

      // Saved again the same day, in an edit too: the names the classifier already waits for are no
      // new names, and the two held back stay so (saving again is no way around the allowance)
      woken = 0;
      expect((await putWithCookie(app, `/experiences/${body._id}`, experienceBody(names.map((name) => name.toUpperCase())), owner.cookie)).status).toBe(200);
      expect((await peekRateLimit(key, NEW_SKILL_NAMES_PER_USER)).count).toBe(7);
      for (const name of ['New 4', 'New 5']) expect((await state(name)).classification).toMatchObject({ held: true });
      // One more new name: stored, held back
      expect((await putWithCookie(app, `/experiences/${body._id}`, experienceBody(['New 6']), owner.cookie)).status).toBe(200);
      expect((await state('New 6')).classification).toMatchObject({ status: 'pending', held: true });
      expect(isPendingSkill(await state('New 6'))).toBe(false);

      // Another account has its own allowance, and a name held back that it types is released: nobody
      // can keep a skill from being classified for everyone by typing it first
      woken = 0;
      expect((await postWithCookie(app, '/experiences', experienceBody(['new 5', 'Theirs']), other.cookie)).status).toBe(200);
      expect((await state('Theirs')).classification).toBeUndefined();
      expect((await state('New 5')).classification).toBeUndefined();
      expect(isPendingSkill(await state('New 5'))).toBe(true);
      expect(woken).toBe(2);
      expect((await state('New 4')).classification).toMatchObject({ held: true });
    } finally {
      remove();
    }
  });

  it('says which names a save would add to what the classifier is asked, ignoring case, in one query', async () => {
    await skill('Have', { classification: manual() });
    await Skill.updateOne({ displayName: t.id('Have') }, { $addToSet: { names: t.id('Also have') } });
    await skill('Waiting');
    await skill('Held', { classification: { status: 'pending', at: new Date(), attempts: 0, held: true } });
    const asked = [` ${t.id('HAVE')} `, t.id('also HAVE'), t.id('waiting'), t.id('HELD'), t.id('Lack'), t.id('Lack too'), ''];
    expect(await Skill.namesToQueue(asked)).toEqual([t.id('HELD'), t.id('Lack'), t.id('Lack too')]);
    expect(await Skill.namesToQueue([])).toEqual([]);
    expect(await Skill.findOne({ displayName: t.id('Lack') })).toBeNull();
    // Held back again by a save beyond the allowance, released by one within it
    const held = (await Skill.findOne({ displayName: t.id('Held') }))!;
    expect(String(await Skill.findOrCreate(t.id('held'), { held: true }))).toBe(String(held._id));
    expect((await Skill.findById(held._id).lean())!.classification).toMatchObject({ held: true });
    expect(String(await Skill.findOrCreate(t.id('held')))).toBe(String(held._id));
    expect((await Skill.findById(held._id).lean())!.classification).toBeUndefined();
    // A skill the classifier settled, or was already asked about, is never held back afterwards
    await Skill.findOrCreate(t.id('have'), { held: true });
    await Skill.findOrCreate(t.id('waiting'), { held: true });
    expect((await Skill.findOne({ displayName: t.id('Have') }).lean())!.classification).toMatchObject({ status: 'manual' });
    expect((await Skill.findOne({ displayName: t.id('Waiting') }).lean())!.classification).toBeUndefined();
  });
});

describe('the curated catalogue of the seeds', () => {
  const stored = async (name: string) => (await Skill.findOne({ displayName: t.id(name) }).lean())!;
  const list = (): SeedSkill[] => [
    { name: t.id('Core'), category: 'framework', parent: t.id('Root') },
    { name: t.id('Root'), category: 'framework', aliases: [t.id('Rt'), t.id('Rooty')] },
    { name: t.id('Kind'), category: 'soft' }
  ];

  it('applies categories, families and aliases by hand, and changes nothing when run again', async () => {
    expect(await seedSkillCatalogue(list())).toEqual({ skills: 3, aliases: 2 });

    const [root, core, kind, alias] = [await stored('Root'), await stored('Core'), await stored('Kind'), await stored('Rt')];
    expect(root).toMatchObject({ category: 'framework', classification: { status: 'manual', attempts: 0 } });
    expect(root.parent).toBeUndefined();
    expect(root.aliasOf).toBeUndefined();
    // Its names are the casings of its own name: an alias is a document of its own, never a name of it
    expect(root.names).toEqual([t.id('Root')]);
    expect(alias.names).toEqual([t.id('Rt')]);
    expect(String(core.parent)).toBe(String(root._id));
    expect(core).toMatchObject({ category: 'framework', classification: { status: 'manual' } });
    expect(kind).toMatchObject({ category: 'soft', classification: { status: 'manual' } });
    expect(String(alias.aliasOf)).toBe(String(root._id));
    expect(alias.category).toBeUndefined();
    expect(alias.parent).toBeUndefined();
    expect(alias.classification?.status).toBe('manual');
    // Typing an alias gives the alias's own document (shown as the skill when read), typing the skill the skill
    expect(String(await Skill.findOrCreate(t.id('rooty')))).toBe(String((await stored('Rooty'))._id));
    expect(String((await stored('Rooty')).aliasOf)).toBe(String(root._id));
    expect(String(await Skill.findOrCreate(t.id('ROOT')))).toBe(String(root._id));

    const snapshot = async () =>
      (await Skill.find({ displayName: new RegExp(`-${t.suffix}$`, 'i') }).sort({ _id: 1 }).lean()).map(
        ({ classification, ...rest }) => ({ ...rest, status: classification?.status })
      );
    const first = await snapshot();
    expect(first).toHaveLength(5);
    expect(await seedSkillCatalogue(list())).toEqual({ skills: 3, aliases: 2 });
    expect(await snapshot()).toEqual(first);
  });

  it('repairs a database seeded when an alias was also a name of its skill, and changes nothing when run again', async () => {
    // As the earlier seed left them: the spellings of the aliases, in any casing, among the skill's own names
    const root = await skill('Root', {
      category: 'framework',
      classification: manual(),
      names: [t.id('Root'), t.id('root'), t.id('Rt'), t.id('ROOTY'), t.id('Unrelated')]
    });
    const rt = await skill('Rt', { aliasOf: root._id, classification: manual(), names: [t.id('Rt'), t.id('rt')] });
    // A save of the alias then stored the skill
    expect(String(await Skill.findOrCreate(t.id('rt')))).toBe(String(root._id));

    await seedSkillCatalogue(list());

    const repaired = (await Skill.findById(root._id).lean())!;
    // Only the spellings seeded as its aliases went: its own casings, and what the list does not name, stay
    expect(repaired.names).toEqual([t.id('Root'), t.id('root'), t.id('Unrelated')]);
    expect((await Skill.findById(rt._id).lean())!.names).toEqual([t.id('Rt'), t.id('rt')]);
    expect(String(await Skill.findOrCreate(t.id('rt')))).toBe(String(rt._id));
    expect(String(await Skill.findOrCreate(t.id('Rooty')))).toBe(String((await stored('Rooty'))._id));
    expect(String(await Skill.findOrCreate(t.id('root')))).toBe(String(root._id));

    const snapshot = async () =>
      (await Skill.find({ displayName: new RegExp(`-${t.suffix}$`, 'i') }).sort({ _id: 1 }).lean()).map(
        ({ classification, ...rest }) => ({ ...rest, status: classification?.status })
      );
    const first = await snapshot();
    await seedSkillCatalogue(list());
    expect(await snapshot()).toEqual(first);
  });

  it('keeps the list\'s spelling when case variants of a name exist, and makes the others spellings of the skill', async () => {
    // From before lookups ignored case: two documents of one name, the older one not spelled as the list does;
    // the same for one of the list's aliases
    const lower = await skill('kind', { classification: classified(), category: 'tool' });
    const exact = await skill('Kind');
    const under = await skill('Under-kind', { parent: lower._id, classification: classified() });
    const spelling = await skill('Kindly', { aliasOf: lower._id, classification: classified() });
    const oldAlias = await skill('RT');
    const exactAlias = await skill('Rt');

    await seedSkillCatalogue(list());

    const read = async (id: Types.ObjectId) => (await Skill.findById(id).lean())!;
    // The skill is the document spelled as the list spells it
    expect(await read(exact._id)).toMatchObject({ displayName: t.id('Kind'), category: 'soft', classification: { status: 'manual' } });
    expect((await read(exact._id)).aliasOf).toBeUndefined();
    // The other variant keeps its spelling (a unique name) and is another spelling of the skill, never a second skill
    const variant = await read(lower._id);
    expect(variant).toMatchObject({ displayName: t.id('kind'), classification: { status: 'manual' } });
    expect(String(variant.aliasOf)).toBe(String(exact._id));
    expect(variant.category).toBeUndefined();
    expect(variant.parent).toBeUndefined();
    // What pointed at the variant points at the skill
    expect(String((await read(under._id)).parent)).toBe(String(exact._id));
    expect(String((await read(spelling._id)).aliasOf)).toBe(String(exact._id));
    // A save of the name resolves to the oldest document, which is read as the skill
    expect(String(await Skill.findOrCreate(t.id('Kind')))).toBe(String(lower._id));
    expect(String((await Skill.findCanonical(t.id('KIND')))!._id)).toBe(String(exact._id));
    expect(presentSkill((await Skill.findById(lower._id).populate('aliasOf'))!.toObject())).toMatchObject({ displayName: t.id('Kind'), category: 'soft' });

    // A variant of an alias of the list is a spelling of the list's skill too, never chained through the alias
    const root = await stored('Root');
    expect(String((await read(exactAlias._id)).aliasOf)).toBe(String(root._id));
    expect(String((await read(oldAlias._id)).aliasOf)).toBe(String(root._id));
    expect((await read(oldAlias._id)).classification?.status).toBe('manual');

    const snapshot = async () =>
      (await Skill.find({ displayName: new RegExp(`-${t.suffix}$`, 'i') }).sort({ _id: 1 }).lean()).map(
        ({ classification, ...rest }) => ({ ...rest, status: classification?.status })
      );
    const first = await snapshot();
    await seedSkillCatalogue(list());
    expect(await snapshot()).toEqual(first);
  });

  it('wins over what the catalogue held, keeping families to one level and aliases unchained', async () => {
    // What a classifier may have written before: Core a root with a child and a wrong category,
    // Root another spelling of something, 'Rt' a skill with a child and an alias of its own
    const core = await skill('core', { category: 'tool', classification: classified() });
    const leaf = await skill('Leaf', { parent: core._id, classification: classified() });
    const elsewhere = await skill('Elsewhere', { classification: classified() });
    const root = await skill('Root', { aliasOf: elsewhere._id, classification: classified() });
    const rt = await skill('Rt', { category: 'tool', parent: elsewhere._id, classification: classified() });
    const underRt = await skill('Under-rt', { parent: rt._id, classification: classified() });
    const aliasOfRt = await skill('Alias-of-rt', { aliasOf: rt._id, classification: classified() });

    await seedSkillCatalogue(list());

    const read = async (id: Types.ObjectId) => (await Skill.findById(id).lean())!;
    // Spelled as the list spells it, the same document
    expect((await read(core._id)).displayName).toBe(t.id('Core'));
    expect(await read(core._id)).toMatchObject({ category: 'framework', classification: { status: 'manual' } });
    expect(String((await read(core._id)).parent)).toBe(String(root._id));
    // What was part of Core is part of its parent: one level
    expect(String((await read(leaf._id)).parent)).toBe(String(root._id));
    expect((await read(root._id)).aliasOf).toBeUndefined();
    expect(String((await read(rt._id)).aliasOf)).toBe(String(root._id));
    expect((await read(rt._id)).parent).toBeUndefined();
    expect((await read(rt._id)).category).toBeUndefined();
    // Nothing is part of an alias, nor an alias of one
    expect(String((await read(underRt._id)).parent)).toBe(String(root._id));
    expect(String((await read(aliasOfRt._id)).aliasOf)).toBe(String(root._id));
    // What the list does not name is left as it was
    expect((await read(elsewhere._id)).classification?.status).toBe('classified');
    expect((await read(leaf._id)).classification?.status).toBe('classified');
  });

  it('refuses a list whose families are not one level, before it applies them', async () => {
    await expect(
      seedSkillCatalogue([{ name: t.id('Child'), category: 'tool', parent: t.id('Nowhere') }])
    ).rejects.toThrow(/does not have/);
    await expect(
      seedSkillCatalogue([
        { name: t.id('A'), category: 'tool' },
        { name: t.id('B'), category: 'tool', parent: t.id('A') },
        { name: t.id('C'), category: 'tool', parent: t.id('B') }
      ])
    ).rejects.toThrow(/itself part of a skill/);
  });

  it('is a consistent list: names once, families of one level, aliases of nothing else', () => {
    const names = SEED_SKILLS.flatMap((entry) => [entry.name, ...(entry.aliases ?? [])]);
    expect(new Set(names.map(normalizeSkill)).size).toBe(names.length);
    const byName = new Map(SEED_SKILLS.map((entry) => [entry.name, entry]));
    for (const entry of SEED_SKILLS) {
      expect(SKILL_CATEGORIES).toContain(entry.category);
      if (entry.parent !== undefined) {
        expect(byName.get(entry.parent)).toBeDefined();
        expect(byName.get(entry.parent)?.parent).toBeUndefined();
      }
    }
    // What the end-to-end tests type, as they read it back: none part of a skill, none an alias
    for (const name of ['Kafka', 'Go', 'Python', 'Spark', 'Svelte', 'TypeScript', 'Leadership', 'Mentoring']) {
      expect(byName.get(name)).toBeDefined();
      expect(byName.get(name)?.parent).toBeUndefined();
    }
    // A family and an alias the tests of the catalogue can rely on
    for (const child of SEED_FAMILY.children) expect(byName.get(child)?.parent).toBe(SEED_FAMILY.parent);
    expect(byName.get(SEED_ALIAS.of)?.aliases).toContain(SEED_ALIAS.alias);
  });
});
