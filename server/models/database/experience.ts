import { Schema, Types, model } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { ExperienceType } from 'portfolio-common';
import { Project, projectSchema } from './project';
import type { Company } from './company';
import { experienceRequest } from '../elysia';
import type { Static } from 'elysia';
import { Skill } from './skill';

export interface Experience extends Document {
  type: ExperienceType;
  company: Types.ObjectId | Company;
  summary: string;
  summaryType: string;
  title: string;
  icon?: string;
  projects: Project[]
}

interface ExperienceModel extends Model<Experience> {
  fromRequest(request: ExperienceRequest): Promise<Experience>;
}

const experienceSchema = new Schema<Experience>({
  type: { type: String, required: true, enum: ExperienceType },
  company: { type: Types.ObjectId, ref: 'Company' },
  summary: String,
  title: { type: String, required: true },
  icon: String,
  projects: [projectSchema]
});

type ExperienceRequest = Static<typeof experienceRequest>;

experienceSchema.statics.fromRequest = async function (request: ExperienceRequest) {
  const experience = new Experience({
    title: request.title,
    summary: request.summary,
    type: request.type,
    company: request.company,
    icon: request.icon,
  });

  for (const project of request.projects) {
    const hardSkills = await Promise.all(
      project.hardSkills.map(async (hardSkill) => {
        const skill = await Skill.findOrCreate(hardSkill.name);
        return { skill, level: hardSkill.level };
      })
    );

    const softSkills = await Promise.all(
      project.softSkills.map(async (softSkill) => {
        const skill = await Skill.findOrCreate(softSkill.name);
        return { skill, level: softSkill.level };
      })
    );

    const newProject = new Project({
      ...project,
      hardSkills: hardSkills,
      softSkills: softSkills,
    });

    experience.projects.push(newProject);
  }

  return experience;
};
export const Experience = model<Experience, ExperienceModel>('Experience', experienceSchema);
