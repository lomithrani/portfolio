import { Schema, Types, model } from "mongoose";
import type { Document } from "mongoose";
import { Skill } from "./skill";

export interface Project extends Document {
  name: string;
  start: Date | undefined;
  end: Date | undefined;
  summary: string;
  hardSkills: {
    skill: Types.ObjectId | Skill,
    level: number | undefined
  }[];
  softSkills: {
    skill: Types.ObjectId | Skill,
    level: number | undefined
  }[];
}

export const projectSchema = new Schema({
  name: { type: String, required: true },
  start: Date,
  end: Date,
  summary: String,
  summaryType: String,
  hardSkills: [{
    skill: { type: Types.ObjectId, ref: 'Skill', required: true },
    level: Number
  }],
  softSkills: [{
    skill: { type: Types.ObjectId, ref: 'Skill', required: true },
    level: Number
  }],
});

export const Project = model<Project>('Project', projectSchema);