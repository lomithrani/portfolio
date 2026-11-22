// The skill catalogue against a real MongoDB (MONGO_URL, local or from
// TEST_MONGO_URL): the Skill model (aliases resolved when a name is looked
// up, the skills still to classify, those the search may suggest), how the
// API presents the skills of an experience (an alias shown as its skill,
// once per list, with its category and the skill it is part of, nothing
// private), and the curated list the seeds apply. Each test names what it
// creates with a suffix of its own and removes it: they pass in any order.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from 'bun:test';
import mongoose, { Types } from 'mongoose';
import { SKILL_CATEGORIES, SKILL_CLASSIFICATION, normalizeSkill, skillTaxonomy } from 'portfolio-common';
import { env } from '../env';
import { createApp } from '../app';
import { Domain, Experience, Skill, User } from '../models/database';
import {
  PENDING_SKILLS,
  SUGGESTABLE_SKILLS,
  isPendingSkill,
  onPendingSkillResolved
} from '../models/database/skill';
import { presentExperience, presentSkill } from '../services/experiencePresentation';
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

const loginWithDomain = async (name: string, domainName: string) => {
  const result = await postJson(app, '/login', {
    token: await signGoogleIdToken({ claims: { sub: t.id(`sub-${name}`), email: t.email(name) } })
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

  it('resolves another spelling of a skill to that skill, whatever the case, creating nothing', async () => {
    const canonical = await skill('Kubernetes', { category: 'infrastructure', classification: manual() });
    const alias = await skill('K8s', { aliasOf: canonical._id, classification: manual() });

    expect(String(await Skill.findOrCreate(t.id('K8s')))).toBe(String(canonical._id));
    expect(String(await Skill.findOrCreate(` ${t.id('k8S').toUpperCase()} `))).toBe(String(canonical._id));
    expect(String(await Skill.findOrCreate(t.id('kubernetes')))).toBe(String(canonical._id));
    expect(await Skill.countDocuments({ displayName: new RegExp(`-${t.suffix}$`, 'i') })).toBe(2);
    // Nothing of either document changed but the spellings it knows
    expect((await Skill.findById(alias._id))?.displayName).toBe(t.id('K8s'));
    expect(String((await Skill.findById(alias._id))?.aliasOf)).toBe(String(canonical._id));
    expect((await Skill.findById(canonical._id))?.displayName).toBe(t.id('Kubernetes'));
  });

  it('resolves a spelling the skill itself knows (names), and an alias whose skill is gone to itself', async () => {
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

  it('stores the skill itself when a known alias is typed, and returns the presented shape from POST and PUT', async () => {
    const owner = await loginWithDomain('owner', t.id('domain'));
    const root = await skill('Linux', { category: 'infrastructure', classification: manual() });
    const debian = await skill('Debian', { category: 'infrastructure', parent: root._id, classification: manual() });
    const alias = await skill('Deb', { aliasOf: debian._id, classification: manual() });
    const debianShown = {
      _id: String(debian._id),
      displayName: t.id('Debian'),
      category: 'infrastructure',
      parent: { _id: String(root._id), displayName: t.id('Linux'), category: 'infrastructure' }
    };

    const created = await postWithCookie(app, '/experiences', experienceBody(['deb', 'Debian', 'New thing']), owner.cookie);
    expect(created.status).toBe(200);
    const body = await readJson(created);
    expect(body.projects[0].hardSkills.map((entry: { skill: unknown }) => entry.skill)).toEqual([
      debianShown,
      // Just typed: no category yet
      { _id: expect.any(String), displayName: t.id('New thing') }
    ]);
    expectNothingPrivate(body);
    // The reference stored is the skill's, never the alias's, and once: two spellings of it were typed
    const stored = (await Experience.findById(body._id).lean())!;
    const storedIds = stored.projects[0].hardSkills.map((entry) => String(entry.skill));
    expect(storedIds).toHaveLength(2);
    expect(storedIds[0]).toBe(String(debian._id));
    expect(storedIds).not.toContain(String(alias._id));
    // Kept with the first spelling's level
    expect(stored.projects[0].hardSkills[0].level).toBe(0);

    const edited = await putWithCookie(app, `/experiences/${body._id}`, experienceBody(['DEB'], ['Linux']), owner.cookie);
    expect(edited.status).toBe(200);
    const editedBody = await readJson(edited);
    expect(editedBody.projects[0].hardSkills.map((entry: { skill: unknown }) => entry.skill)).toEqual([debianShown]);
    expect(editedBody.projects[0].softSkills.map((entry: { skill: unknown }) => entry.skill)).toEqual([
      { _id: String(root._id), displayName: t.id('Linux'), category: 'infrastructure' }
    ]);
    expectNothingPrivate(editedBody);
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
    expect(String(await Skill.findOrCreate(t.id('mu')))).toBe(String(madeUp._id));
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
    expect([...root.names].sort()).toEqual([t.id('Root'), t.id('Rooty'), t.id('Rt')].sort());
    expect(String(core.parent)).toBe(String(root._id));
    expect(core).toMatchObject({ category: 'framework', classification: { status: 'manual' } });
    expect(kind).toMatchObject({ category: 'soft', classification: { status: 'manual' } });
    expect(String(alias.aliasOf)).toBe(String(root._id));
    expect(alias.category).toBeUndefined();
    expect(alias.parent).toBeUndefined();
    expect(alias.classification?.status).toBe('manual');
    // Typing an alias gives the skill
    expect(String(await Skill.findOrCreate(t.id('rooty')))).toBe(String(root._id));

    const snapshot = async () =>
      (await Skill.find({ displayName: new RegExp(`-${t.suffix}$`, 'i') }).sort({ _id: 1 }).lean()).map(
        ({ classification, ...rest }) => ({ ...rest, status: classification?.status })
      );
    const first = await snapshot();
    expect(first).toHaveLength(5);
    expect(await seedSkillCatalogue(list())).toEqual({ skills: 3, aliases: 2 });
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
