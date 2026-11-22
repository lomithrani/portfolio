import { Schema, model } from 'mongoose';
import type { Document, Model, PopulateOptions, Types } from 'mongoose';
import { ExperienceType } from 'portfolio-common';
import { Project, projectSchema } from './project';
import { companyFromRequest, companySchema } from './company';
import type { Company } from './company';
import { experienceRequest } from '../elysia';
import type { Static } from 'elysia';
import { SUGGESTABLE_SKILLS, Skill } from './skill';
import { FieldValidationError } from '../../errors';
import { m } from './experience.messages';

export interface Experience extends Document {
  type: ExperienceType;
  company?: Company;
  location?: string;
  /** Month precision (UTC midnight of the 1st). Set without an end: ongoing */
  start?: Date;
  end?: Date;
  summary: string;
  title: string;
  icon?: string;
  projects: Project[]
}

type ExperienceRequest = Static<typeof experienceRequest>;
type ProjectRequest = ExperienceRequest['projects'][number];
type SkillRequest = ProjectRequest['hardSkills'][number];

interface ExperienceModel extends Model<Experience> {
  fromRequest(request: ExperienceRequest, context?: ExperienceRequestContext): Promise<Experience>;
}

const experienceSchema = new Schema<Experience>({
  type: { type: String, required: true, enum: ExperienceType },
  // Embedded, owned by this experience (see companyFromRequest)
  company: companySchema,
  location: { type: String, trim: true },
  // Month precision, like project dates; no end = ongoing
  start: Date,
  end: Date,
  summary: String,
  title: { type: String, required: true, trim: true },
  icon: String,
  projects: [projectSchema]
});

// What the API reads of a skill to present it: never its other spellings
// (`names`). Its status with the classifier is read, never returned: a skill
// another one points at is shown only once recognised (presentSkill)
const PRESENTED_SKILL_FIELDS = 'displayName category parent aliasOf classification.status';

// A skill the API presents is read with the skill it is part of (`parent`)
// and, when it is another spelling of a skill (`aliasOf`), that skill and
// its own parent. A parent that became another spelling of a skill since is
// read as that skill too
const PRESENTED_PARENT_POPULATE: PopulateOptions = {
  path: 'parent',
  select: PRESENTED_SKILL_FIELDS,
  populate: { path: 'aliasOf', select: PRESENTED_SKILL_FIELDS }
};
const PRESENTED_SKILL_POPULATE: PopulateOptions[] = [
  PRESENTED_PARENT_POPULATE,
  { path: 'aliasOf', select: PRESENTED_SKILL_FIELDS, populate: PRESENTED_PARENT_POPULATE }
];

/**
 * What the API returns for an experience: skills populated, to be presented
 * with presentExperience (services/experiencePresentation.ts), which gives
 * the shape the client renders (GET /domain/:name, POST/PUT /experiences).
 * Always both: a populated skill that was not presented still has the ids
 * of the skills it points at.
 */
export const EXPERIENCE_POPULATE: PopulateOptions[] = [
  { path: 'projects.hardSkills.skill', select: PRESENTED_SKILL_FIELDS, populate: PRESENTED_SKILL_POPULATE },
  { path: 'projects.softSkills.skill', select: PRESENTED_SKILL_FIELDS, populate: PRESENTED_SKILL_POPULATE }
];

/** UTC midnight of the 1st of the date's month: dates have month precision */
const toMonthStart = (date: Date | undefined) =>
  date && new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const endsBeforeStart = (start: Date | undefined, end: Date | undefined) =>
  !!start && !!end && toMonthStart(end)! < toMonthStart(start)!;

/**
 * Rejects (422, naming the field) what the request schema cannot express:
 * blank title or project names, an end month before the start month.
 * Runs before anything is written (skills included).
 */
const assertValidExperienceRequest = (request: ExperienceRequest) => {
  if (!request.title.trim()) throw new FieldValidationError('title', () => m.titleRequired);
  if (endsBeforeStart(request.start, request.end)) {
    throw new FieldValidationError('end', () => m.endBeforeStart);
  }
  request.projects.forEach((project, index) => {
    if (!project.name.trim()) {
      throw new FieldValidationError(`projects.${index}.name`, () => m.projectNameRequired);
    }
    if (endsBeforeStart(project.start, project.end)) {
      throw new FieldValidationError(`projects.${index}.end`, () => m.projectEndBeforeStart);
    }
  });
};

/** Skill names compare ignoring case and surrounding spaces */
const skillKey = (name: string) => name.trim().toLowerCase();

/** A skill entry an experience stores, with the skill the API shows it as */
interface StoredEntry {
  skill: Types.ObjectId;
  level: number | undefined;
  /** The id of the skill presentExperience shows this entry as: the skill it is another spelling of once that one is recognised, else itself */
  shownAs: string;
}

/**
 * What an experience stores of its skills, project by project, for an edit
 * to keep: the editor sends back the names the API showed, which for another
 * spelling of a skill is the canonical name, never the spelling stored
 */
export interface StoredSpellings {
  projects: { name: string; hardSkills: StoredEntry[]; softSkills: StoredEntry[] }[];
}

/** What experienceFieldsFromRequest needs beyond the request */
export interface ExperienceRequestContext {
  /** The experience being edited (PUT), as it is stored: see storedSpellings */
  stored?: StoredSpellings;
  /**
   * Of `wanted` names the classifier was not asked about yet (the catalogue
   * lacks them, or holds them back), how many this save may add to what it
   * is asked (the account's allowance of the day: the route gives it). Those
   * beyond are held back: kept and shown to their owner as typed, never
   * sent. Without it (a seed), all of them are added
   */
  newSkillNames?: (wanted: number) => Promise<number>;
}

/**
 * The skills `experience` stores, with what each is shown as when read: the
 * same rule as presentExperience (services/experiencePresentation.ts), another
 * spelling of a skill being shown as that skill once it is recognised
 */
export const storedSpellings = async (experience: Pick<Experience, 'projects'>): Promise<StoredSpellings> => {
  const lists = (project: Project) => ({ hardSkills: project.hardSkills ?? [], softSkills: project.softSkills ?? [] });
  const ids = experience.projects.flatMap((project) =>
    [...lists(project).hardSkills, ...lists(project).softSkills].map((entry) => entry.skill)
  );
  const aliases = ids.length
    ? await Skill.find({ _id: { $in: ids }, aliasOf: { $ne: null } }, 'aliasOf').lean()
    : [];
  const recognised = aliases.length
    ? await Skill.find({ _id: { $in: aliases.map((alias) => alias.aliasOf) }, ...SUGGESTABLE_SKILLS }, '_id').lean()
    : [];
  const shown = new Set(recognised.map((skill) => String(skill._id)));
  const shownAs = new Map(
    aliases.filter((alias) => shown.has(String(alias.aliasOf))).map((alias) => [String(alias._id), String(alias.aliasOf)])
  );
  const entries = (stored: readonly { skill: unknown; level: number | undefined }[]): StoredEntry[] =>
    stored.map((entry) => ({
      skill: entry.skill as Types.ObjectId,
      level: entry.level,
      shownAs: shownAs.get(String(entry.skill)) ?? String(entry.skill)
    }));
  return {
    projects: experience.projects.map((project) => ({
      name: project.name.trim(),
      hardSkills: entries(lists(project).hardSkills),
      softSkills: entries(lists(project).softSkills)
    }))
  };
};

/**
 * The stored project each project of a request is: the one of the same name
 * (at the same place first), else the one at its own place when nothing else
 * is it (a project renamed where it stands). Undefined for a new project
 */
const matchStoredProjects = (projects: ProjectRequest[], stored: StoredSpellings | undefined) => {
  const matched: (StoredSpellings['projects'][number] | undefined)[] = projects.map(() => undefined);
  if (!stored) return matched;
  const used = new Set<number>();
  const take = (index: number, at: number) => {
    matched[index] = stored.projects[at];
    used.add(at);
  };
  projects.forEach((project, index) => {
    if (stored.projects[index]?.name === project.name.trim()) take(index, index);
  });
  projects.forEach((project, index) => {
    if (matched[index]) return;
    const at = stored.projects.findIndex((candidate, position) => !used.has(position) && candidate.name === project.name.trim());
    if (at !== -1) take(index, at);
  });
  projects.forEach((_, index) => {
    if (!matched[index] && stored.projects[index] && !used.has(index)) take(index, index);
  });
  return matched;
};

/** Finds or creates every skill of the projects: skill key → id */
const resolveSkills = async (projects: ProjectRequest[], newSkillNames: ExperienceRequestContext['newSkillNames']) => {
  // One lookup per distinct key, with its first spelling: case variants of a
  // new name would race on the same upsert and could create two skills
  const names = new Map<string, string>();
  for (const skill of projects.flatMap((project) => [...project.hardSkills, ...project.softSkills])) {
    const key = skillKey(skill.name);
    if (key && !names.has(key)) names.set(key, skill.name.trim());
  }
  // The names this save adds to what the classifier is asked: an account
  // adds so many a day, and those beyond are held back (stored, never sent).
  // The save itself is never refused
  const held = new Set<string>();
  if (newSkillNames && names.size > 0) {
    const toQueue = await Skill.namesToQueue([...names.values()]);
    if (toQueue.length > 0) {
      const allowed = await newSkillNames(toQueue.length);
      for (const name of toQueue.slice(Math.max(0, allowed))) held.add(skillKey(name));
    }
  }
  return new Map(
    await Promise.all(
      [...names].map(async ([key, name]) => [key, await Skill.findOrCreate(name, { held: held.has(key) })] as const)
    )
  );
};

/**
 * A project's skill list with resolved ids: blank names and repeats dropped,
 * the first kept, and never the same document twice (two names the catalogue
 * holds as one: Skill.findOrCreate). What is stored is the spelling typed:
 * 'K8s' and 'Kubernetes' are two entries, shown as one skill when the
 * experience is read (presentExperience), never merged here.
 *
 * `stored`: the list as the project stores it, on an edit. A name the request
 * gives that the stored entries were shown as keeps those entries, each with
 * its spelling: an experience typed 'K8s' and shown as Kubernetes comes back
 * from the editor as 'Kubernetes', and still references 'K8s'. Two stored
 * spellings shown as one skill are both kept, the first with the level the
 * request gives (the one that was shown), the others with their own.
 */
const skillRefs = (skills: SkillRequest[], ids: Map<string, Types.ObjectId>, stored: StoredEntry[] = []) => {
  const seen = new Set<string>();
  const listed = new Set<string>();
  return skills.flatMap((skill) => {
    const key = skillKey(skill.name);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    const id = ids.get(key)!;
    const shown = stored.filter((entry) => entry.shownAs === String(id));
    const entries = shown.length > 0
      ? shown.map((entry, index) => ({ skill: entry.skill, level: index === 0 ? skill.level : entry.level }))
      : [{ skill: id, level: skill.level }];
    return entries.filter((entry) => {
      if (listed.has(String(entry.skill))) return false;
      listed.add(String(entry.skill));
      return true;
    });
  });
};

/** Builds project subdocuments from a request, finding or creating skills */
const projectsFromRequest = async (projects: ProjectRequest[], context: ExperienceRequestContext) => {
  const ids = await resolveSkills(projects, context.newSkillNames);
  const stored = matchStoredProjects(projects, context.stored);
  return projects.map((project, index) => new Project({
    ...project,
    start: toMonthStart(project.start),
    end: toMonthStart(project.end),
    hardSkills: skillRefs(project.hardSkills, ids, stored[index]?.hardSkills),
    softSkills: skillRefs(project.softSkills, ids, stored[index]?.softSkills),
  }));
};

/**
 * Every stored field of an experience from a request (POST creates with it,
 * PUT sets it): validated first, then skills are found or created. Optional
 * fields left out of the request come back undefined, which unsets them on PUT.
 * `context`: the experience being edited and the account's allowance of new
 * skill names (see ExperienceRequestContext).
 */
export const experienceFieldsFromRequest = async (request: ExperienceRequest, context: ExperienceRequestContext = {}) => {
  assertValidExperienceRequest(request);
  return {
    title: request.title,
    summary: request.summary,
    type: request.type,
    company: companyFromRequest(request.company),
    location: request.location?.trim() || undefined,
    start: toMonthStart(request.start),
    end: toMonthStart(request.end),
    icon: request.icon,
    projects: await projectsFromRequest(request.projects, context),
  };
};

experienceSchema.statics.fromRequest = async function (request: ExperienceRequest, context?: ExperienceRequestContext) {
  return new Experience(await experienceFieldsFromRequest(request, context));
};

export const Experience = model<Experience, ExperienceModel>('Experience', experienceSchema);
