// The curated part of the skill catalogue, applied by the seeds (`bun run
// db:seed`, `seed:e2e`) with the status 'manual': a local or e2e database
// has categories, a few families and a few aliases without the classifier
// (services/skillClassifier.ts), which never touches a manual skill, and
// the search (GET /skills/search) has skills to suggest from the start.
// It holds the skills the end-to-end tests type (Kafka, Go, Python, Spark,
// Svelte, TypeScript, Leadership, Mentoring: under the spelling they read
// back, none part of another skill, none an alias), and what a test of the
// catalogue can rely on: families ('.NET Core' and '.NET Framework' are part
// of '.NET', 'Debian' and 'Ubuntu' of 'Linux'...) and aliases ('K8s' is
// 'Kubernetes', 'NodeJS' is 'Node.js'...).
// An alias is a Skill document of its own that points at its skill (aliasOf),
// never a name of that skill: an experience typed 'K8s' references the 'K8s'
// document and is shown as Kubernetes when read (Skill.findOrCreate,
// services/experiencePresentation.ts).
// This file loads nothing that imports server/env.ts (see seedE2e.ts).
import type { Types } from "mongoose";
import type { SkillCategory } from "portfolio-common";
import { Skill } from "../models/database";
import { SKILL_NAME_COLLATION } from "../models/database/skill";
import type { SkillDocument } from "../models/database/skill";
import { isDuplicateKeyError } from "../services/mongoErrors";

export interface SeedSkill {
  /** Its canonical spelling */
  name: string;
  category: SkillCategory;
  /** The skill of this list it is part of: one that has no parent itself */
  parent?: string;
  /** Other spellings of it: each a Skill document of its own that points at it (aliasOf) */
  aliases?: readonly string[];
}

const skills = (category: SkillCategory, ...entries: (string | Omit<SeedSkill, 'category'>)[]): SeedSkill[] =>
  entries.map((entry) => (typeof entry === 'string' ? { name: entry, category } : { ...entry, category }));

/** A family and an alias of the list, for the tests that need one */
export const SEED_FAMILY = { parent: '.NET', children: ['.NET Core', '.NET Framework'] } as const;
export const SEED_ALIAS = { alias: 'K8s', of: 'Kubernetes' } as const;

export const SEED_SKILLS: readonly SeedSkill[] = [
  ...skills(
    'language',
    'TypeScript',
    'JavaScript',
    'C#',
    'Python',
    'Go',
    'Java',
    'Kotlin',
    'Rust',
    'PHP',
    'SQL'
  ),
  ...skills(
    'framework',
    '.NET',
    { name: '.NET Core', parent: '.NET' },
    { name: '.NET Framework', parent: '.NET' },
    { name: 'Node.js', aliases: ['NodeJS'] },
    'React',
    'Angular',
    'Vue.js',
    'Svelte',
    'SvelteKit',
    'Spring Boot',
    'Django'
  ),
  ...skills(
    'infrastructure',
    { name: 'Kubernetes', aliases: ['K8s'] },
    'Docker',
    'Terraform',
    'Linux',
    { name: 'Debian', parent: 'Linux' },
    { name: 'Ubuntu', parent: 'Linux' },
    { name: 'Microsoft Azure', aliases: ['Azure'] },
    { name: 'Azure Functions', parent: 'Microsoft Azure' },
    { name: 'AWS', aliases: ['Amazon Web Services'] },
    { name: 'AWS Lambda', parent: 'AWS' },
    { name: 'Google Cloud', aliases: ['GCP', 'Google Cloud Platform'] }
  ),
  ...skills(
    'data',
    { name: 'PostgreSQL', aliases: ['Postgres'] },
    'MongoDB',
    'Redis',
    'Elasticsearch',
    { name: 'Kafka', aliases: ['Apache Kafka'] },
    { name: 'Spark', aliases: ['Apache Spark'] },
    { name: 'Cosmos DB', parent: 'Microsoft Azure' },
    'Grafana',
    'Prometheus'
  ),
  ...skills('security', 'OAuth 2.0', { name: 'OpenID Connect', aliases: ['OIDC'] }),
  ...skills(
    'practice',
    'CI/CD',
    'DevOps',
    'Microservices',
    'Agile',
    'Scrum',
    { name: 'Test-driven development', aliases: ['TDD'] },
    { name: 'Domain-driven design', aliases: ['DDD'] }
  ),
  ...skills('tool', 'Git', 'GitHub', 'Jira', 'Figma'),
  ...skills('soft', 'Leadership', 'Mentoring', 'Communication', 'Teamwork', 'Problem solving')
];

/** The oldest skill displayed under `name`, ignoring case */
const displayedAs = (name: string, except?: Types.ObjectId) =>
  Skill.findOne({ displayName: name, ...(except ? { _id: { $ne: except } } : {}) })
    .collation(SKILL_NAME_COLLATION)
    .sort({ _id: 1 });

/** The skill displayed exactly as `name` */
const spelledAs = (name: string, except?: Types.ObjectId) =>
  Skill.findOne({ displayName: name, ...(except ? { _id: { $ne: except } } : {}) });

/**
 * The skill displayed under `name`, created when there is none: the one
 * spelled exactly so when the collection has case variants of the name (from
 * before lookups ignored case), else the oldest ignoring case
 */
const ensureSkill = async (name: string, except?: Types.ObjectId): Promise<SkillDocument> => {
  const existing = (await spelledAs(name, except)) ?? (await displayedAs(name, except));
  if (existing) return existing;
  try {
    return await Skill.create({ displayName: name, names: [name] });
  } catch (error) {
    // Created meanwhile (two seeds at once)
    const created = isDuplicateKeyError(error) ? await displayedAs(name, except) : null;
    if (!created) throw error;
    return created;
  }
};

/** Spells a skill as the list does, unless another document already has that exact spelling */
const spellAs = async (skill: SkillDocument, name: string) => {
  if (skill.displayName === name) return;
  try {
    await Skill.updateOne({ _id: skill._id }, { $set: { displayName: name } });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
};

/**
 * The other documents displayed as `name` ignoring case (case variants from
 * before lookups ignored case; a save of the name resolves to the oldest of
 * them) become other spellings of `skill`, like the list's aliases: shown and
 * suggested as the skill, under its spelling, and never as a second skill.
 * What pointed at them points at the skill, or at the skill it is part of
 */
const foldCaseVariants = async (
  name: string,
  /** The document that keeps the name: the skill itself, or the list's alias spelled so */
  kept: SkillDocument,
  skill: SkillDocument,
  family: SkillDocument,
  manual: { status: 'manual'; at: Date; attempts: number }
) => {
  const variants = await Skill.find({ displayName: name, _id: { $nin: [kept._id, skill._id] } }, '_id').collation(SKILL_NAME_COLLATION);
  for (const variant of variants) {
    await Skill.updateMany({ aliasOf: variant._id, _id: { $ne: skill._id } }, { $set: { aliasOf: skill._id } });
    await Skill.updateMany({ parent: variant._id, _id: { $nin: [skill._id, family._id] } }, { $set: { parent: family._id } });
    await Skill.updateOne(
      { _id: variant._id },
      { $set: { aliasOf: skill._id, classification: manual }, $unset: { parent: 1, category: 1 } }
    );
  }
};

/**
 * Applies the list to the Skill collection: each skill with its category,
 * the skill it is part of and its other spellings, all 'manual'. Idempotent,
 * and what it writes keeps the catalogue's rules (one level of families, an
 * alias never chained, a skill's `names` only the casings of its own name)
 * whatever the collection held: a manual entry wins over what the
 * classifier wrote. Case variants of a name of the list ('typescript' beside
 * 'TypeScript') become other spellings of the list's skill, which is the one
 * spelled as the list does. It also repairs what an earlier version of this seed
 * left: the spellings of a skill's aliases among that skill's own `names`,
 * through which a save of 'K8s' stored Kubernetes.
 */
export const seedSkillCatalogue = async (
  list: readonly SeedSkill[] = SEED_SKILLS,
  now: Date = new Date()
): Promise<{ skills: number; aliases: number }> => {
  const manual = { status: 'manual' as const, at: now, attempts: 0 };

  // Every skill first, so a parent exists whatever the order of the list
  const stored = new Map<string, SkillDocument>();
  for (const entry of list) stored.set(entry.name, await ensureSkill(entry.name));

  let aliases = 0;
  for (const entry of list) {
    const skill = stored.get(entry.name)!;
    const parent = entry.parent === undefined ? undefined : stored.get(entry.parent);
    if (entry.parent !== undefined && !parent) {
      throw new Error(`The seeded skill "${entry.name}" is part of "${entry.parent}", which the list does not have`);
    }
    if (parent && list.some((other) => other.name === entry.parent && other.parent !== undefined)) {
      throw new Error(`The seeded skill "${entry.name}" is part of "${entry.parent}", which is itself part of a skill`);
    }
    await spellAs(skill, entry.name);
    await Skill.updateOne(
      { _id: skill._id },
      {
        $set: { category: entry.category, classification: manual, ...(parent ? { parent: parent._id } : {}) },
        $unset: { aliasOf: 1, ...(parent ? {} : { parent: 1 }) },
        $addToSet: { names: entry.name }
      },
      { collation: SKILL_NAME_COLLATION }
    );
    // One level: what was part of a skill that now has a parent is part of that parent
    if (parent) await Skill.updateMany({ parent: skill._id }, { $set: { parent: parent._id } });
    await foldCaseVariants(entry.name, skill, skill, parent ?? skill, manual);

    for (const spelling of entry.aliases ?? []) {
      const alias = await ensureSkill(spelling, skill._id);
      await spellAs(alias, spelling);
      await Skill.updateOne(
        { _id: alias._id },
        {
          $set: { aliasOf: skill._id, classification: manual },
          // An alias has no parent or category of its own
          $unset: { parent: 1, category: 1 },
          $addToSet: { names: spelling }
        },
        { collation: SKILL_NAME_COLLATION }
      );
      // Never chained, and nothing is part of an alias: both go to the skill it stands for
      await Skill.updateMany({ aliasOf: alias._id }, { $set: { aliasOf: skill._id } });
      await Skill.updateMany(
        { parent: alias._id, _id: { $ne: skill._id } },
        { $set: { parent: (parent ?? skill)._id } }
      );
      // The spelling is the alias's own, never a name of the skill: a save of it stores the alias
      // (Skill.findOrCreate), resolved when read. An earlier version of this seed added it to the
      // skill's names: taken out, in any casing ($pull compares with the collation)
      await Skill.updateOne(
        { _id: skill._id },
        { $pull: { names: { $in: [spelling, ...(alias.names ?? [])] } } },
        { collation: SKILL_NAME_COLLATION }
      );
      await foldCaseVariants(spelling, alias, skill, parent ?? skill, manual);
      aliases += 1;
    }
  }
  return { skills: list.length, aliases };
};
