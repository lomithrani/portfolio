import { Schema, Types, InferSchemaType, model, Document } from 'mongoose';
import { ExperienceType } from 'portfolio-common';
import { Project, projectSchema } from './project';
import { companySchema } from './company';
import { experienceRequest } from '../elysia';
import { Static } from 'elysia';


const experienceSchema = new Schema({
  type: { type: String, required: true, enum: ExperienceType },
  company: { type: Types.ObjectId, ref: 'Company' },
  summary: String,
  title: { type: String, required: true },
  projects: [projectSchema]
});

type ExperienceRequest = Static<typeof experienceRequest>;

experienceSchema.statics.addItem = (request: ExperienceRequest) => {
  const experience = new Experience();

  experience.title = request.title;
  experience.summary = request.summary;
  experience.type = request.type;

  for (const project of request.projects) {
    experience.projects.push(Project.create({ ...project }));
  }

  return experience;
}

export type Experience = InferSchemaType<typeof experienceSchema> & {
  _id: string;
};
export const Experience = model('Experience', experienceSchema);
