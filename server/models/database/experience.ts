import { Schema, Types, InferSchemaType, model, Document } from 'mongoose';
import { ExperienceType } from 'portfolio-common';
import { Project, projectSchema } from './project';
import { Company, companySchema } from './company';
import { experienceRequest } from '../elysia';
import { Static } from 'elysia';

export interface Experience extends Document {
  type: ExperienceType;
  company: Types.ObjectId | Company;
  summary: string;
  title: string;
  projects: Project[]
}

const experienceSchema = new Schema<Experience>({
  type: { type: String, required: true, enum: ExperienceType },
  company: { type: Types.ObjectId, ref: 'Company' },
  summary: String,
  title: { type: String, required: true },
  projects: [projectSchema]
});

type ExperienceRequest = Static<typeof experienceRequest>;

experienceSchema.statics.addItem = async (request: ExperienceRequest) => {
  const experience = new Experience();

  experience.title = request.title;
  experience.summary = request.summary;
  experience.type = request.type;

  for (const project of request.projects) {
    experience.projects.push(await Project.create({ ...project }));
  }

  return experience;
}

export const Experience = model<Experience>('Experience', experienceSchema);
