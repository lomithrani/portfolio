import { Schema, Types, InferSchemaType, model } from 'mongoose';
import { ExperienceType } from 'portfolio-common/models';
import { projectSchema } from './project';
import { companySchema } from './company';


const experienceSchema = new Schema({
  _id: Types.ObjectId,
  type: { type: String, required: true, enum: ExperienceType },
  company: { type: companySchema, required: true },
  summary: String,
  title: { type: String, required: true },
  projects: [projectSchema]
});

export type Experience = InferSchemaType<typeof experienceSchema>;
export const Experience = model('Experience', experienceSchema);