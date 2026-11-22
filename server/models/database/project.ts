import { Schema, Types, model } from "mongoose";
import type { Document } from "mongoose";
import type { PresentedSkill } from "portfolio-common";

/**
 * A skill of a project: the id of its Skill as stored, or that skill as the
 * API presents it (presentExperience, services/experiencePresentation.ts)
 */
export interface ProjectSkill {
  skill: Types.ObjectId | PresentedSkill,
  level: number | undefined
}

export interface Project extends Document {
  name: string;
  start: Date | undefined;
  end: Date | undefined;
  summary: string;
  hardSkills: ProjectSkill[];
  softSkills: ProjectSkill[];
}

export const projectSchema = new Schema({
  name: { type: String, required: true, trim: true },
  // Month precision (UTC midnight of the 1st); no end = ongoing
  start: Date,
  end: Date,
  summary: String,
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