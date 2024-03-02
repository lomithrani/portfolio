import { InferSchemaType, Schema, model } from "mongoose";
import { skillSchema } from "./skill";

export const projectSchema = new Schema({
  name: { type: String, required: true },
  start: Date,
  end: Date,
  summary: String,
  hardSkills: [skillSchema],
  softSkills: [skillSchema],
});

export type Project = InferSchemaType<typeof projectSchema>;
export const Project = model('Project', projectSchema);