import { Schema, model } from 'mongoose';
import type { Document, Model, PopulateOptions, Types } from 'mongoose';
import { ExperienceType } from 'portfolio-common';
import { Project, projectSchema } from './project';
import { companyFromRequest, companySchema } from './company';
import type { Company } from './company';
import { experienceRequest } from '../elysia';
import type { Static } from 'elysia';
import { Skill } from './skill';
import { FieldValidationError } from '../../errors';

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
  fromRequest(request: ExperienceRequest): Promise<Experience>;
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

/**
 * What the API returns for an experience: skills populated, the shape the
 * client renders (GET /domain/:name, POST/PUT /experiences).
 */
export const EXPERIENCE_POPULATE: PopulateOptions[] = [
  { path: 'projects.hardSkills.skill' },
  { path: 'projects.softSkills.skill' }
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
  if (!request.title.trim()) throw new FieldValidationError('title', 'Title is required');
  if (endsBeforeStart(request.start, request.end)) {
    throw new FieldValidationError('end', 'End date must not be before the start date');
  }
  request.projects.forEach((project, index) => {
    if (!project.name.trim()) {
      throw new FieldValidationError(`projects.${index}.name`, 'Project name is required');
    }
    if (endsBeforeStart(project.start, project.end)) {
      throw new FieldValidationError(
        `projects.${index}.end`,
        'Project end date must not be before its start date'
      );
    }
  });
};

/** Skill names compare ignoring case and surrounding spaces */
const skillKey = (name: string) => name.trim().toLowerCase();

/** Finds or creates every skill of the projects: skill key → id */
const resolveSkills = async (projects: ProjectRequest[]) => {
  // One lookup per distinct key, with its first spelling: case variants of a
  // new name would race on the same upsert and could create two skills
  const names = new Map<string, string>();
  for (const skill of projects.flatMap((project) => [...project.hardSkills, ...project.softSkills])) {
    const key = skillKey(skill.name);
    if (key && !names.has(key)) names.set(key, skill.name.trim());
  }
  return new Map(
    await Promise.all(
      [...names].map(async ([key, name]) => [key, await Skill.findOrCreate(name)] as const)
    )
  );
};

/** A project's skill list with resolved ids: blank names and repeats dropped */
const skillRefs = (skills: SkillRequest[], ids: Map<string, Types.ObjectId>) => {
  const seen = new Set<string>();
  return skills.flatMap((skill) => {
    const key = skillKey(skill.name);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [{ skill: ids.get(key)!, level: skill.level }];
  });
};

/** Builds project subdocuments from a request, finding or creating skills */
const projectsFromRequest = async (projects: ProjectRequest[]) => {
  const ids = await resolveSkills(projects);
  return projects.map((project) => new Project({
    ...project,
    start: toMonthStart(project.start),
    end: toMonthStart(project.end),
    hardSkills: skillRefs(project.hardSkills, ids),
    softSkills: skillRefs(project.softSkills, ids),
  }));
};

/**
 * Every stored field of an experience from a request (POST creates with it,
 * PUT sets it): validated first, then skills are found or created. Optional
 * fields left out of the request come back undefined, which unsets them on PUT.
 */
export const experienceFieldsFromRequest = async (request: ExperienceRequest) => {
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
    projects: await projectsFromRequest(request.projects),
  };
};

experienceSchema.statics.fromRequest = async function (request: ExperienceRequest) {
  return new Experience(await experienceFieldsFromRequest(request));
};

export const Experience = model<Experience, ExperienceModel>('Experience', experienceSchema);
