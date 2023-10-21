import { Schema, Types, InferSchemaType, model } from 'mongoose';
import { ExperienceType } from 'portfolio-common';
import { projectSchema } from './project';
import { companySchema } from './company';


const experienceSchema = new Schema({
  type: { type: String, required: true, enum: ExperienceType },
  company: { type: Types.ObjectId, ref: 'Company' },
  summary: String,
  title: { type: String, required: true },
  projects: [projectSchema]
});

export type Experience = InferSchemaType<typeof experienceSchema>;
export const Experience = model('Experience', experienceSchema);