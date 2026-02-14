import { Schema, model } from "mongoose";
import type { Document } from "mongoose";

export interface WorkflowStep extends Document {
  name: string;
  description: string;
  skippable: boolean;
}

export const workflowStepSchema = new Schema({
  name: String,
  description: String,
  skippable: Boolean
}, { discriminatorKey: 'type', collection: 'workflowsteps' });

export const WorkflowStep = model<WorkflowStep>('WorkflowStep', workflowStepSchema);