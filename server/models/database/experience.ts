import { Schema, Types, model } from 'mongoose';
import type { Document, Model, PopulateOptions } from 'mongoose';
import { ExperienceType } from 'portfolio-common';
import { Project, projectSchema } from './project';
import { Company } from './company';
import { experienceRequest } from '../elysia';
import type { Static } from 'elysia';
import { Skill } from './skill';

export interface Experience extends Document {
  type: ExperienceType;
  company?: Types.ObjectId | Company;
  summary: string;
  summaryType: string;
  title: string;
  icon?: string;
  projects: Project[]
}

type ExperienceRequest = Static<typeof experienceRequest>;
type ProjectRequest = ExperienceRequest['projects'][number];

interface ExperienceModel extends Model<Experience> {
  fromRequest(request: ExperienceRequest): Promise<Experience>;
}

const experienceSchema = new Schema<Experience>({
  type: { type: String, required: true, enum: ExperienceType },
  // Shared Company document, found or created by name (Company.findOrCreate)
  company: { type: Types.ObjectId, ref: 'Company' },
  summary: String,
  title: { type: String, required: true },
  icon: String,
  projects: [projectSchema]
});

/**
 * What the API returns for an experience: company and skills populated, the
 * shape the client renders (GET /domain/:name, POST/PUT /experiences).
 */
export const EXPERIENCE_POPULATE: PopulateOptions[] = [
  { path: 'company' },
  { path: 'projects.hardSkills.skill' },
  { path: 'projects.softSkills.skill' }
];

const resolveSkills = async (skills: ProjectRequest['hardSkills']) => {
  // One lookup per distinct name (duplicates would race on the same upsert)
  const names = [...new Set(skills.map((skill) => skill.name))];
  const ids = new Map(
    await Promise.all(names.map(async (name) => [name, await Skill.findOrCreate(name)] as const))
  );
  return skills.map((skill) => ({ skill: ids.get(skill.name)!, level: skill.level }));
};

/** Builds project subdocuments from a request, finding or creating skills */
export const projectsFromRequest = async (projects: ProjectRequest[]) => {
  const result: Project[] = [];
  for (const project of projects) {
    result.push(new Project({
      ...project,
      hardSkills: await resolveSkills(project.hardSkills),
      softSkills: await resolveSkills(project.softSkills),
    }));
  }
  return result;
};

experienceSchema.statics.fromRequest = async function (request: ExperienceRequest) {
  const experience = new Experience({
    title: request.title,
    summary: request.summary,
    type: request.type,
    company: await Company.findOrCreate(request.company),
    icon: request.icon,
  });

  experience.projects.push(...await projectsFromRequest(request.projects));

  return experience;
};

export const Experience = model<Experience, ExperienceModel>('Experience', experienceSchema);
