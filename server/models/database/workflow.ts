import { Schema, Types, model } from "mongoose";
import type { Document } from "mongoose";
import { WorkflowStep } from "./workflowStep";
import { User } from "./user";

export interface Workflow extends Document {
  user: Types.ObjectId | User;
  name: string;
  enabled: boolean;
  description: string;
  steps: WorkflowStep[]
}

export const workflowSchema = new Schema<Workflow>({
  user: { type: Types.ObjectId, required: true, ref: 'User' },
  name: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  description: String,
  steps: [{ type: Types.ObjectId, ref: 'WorkflowStep' }],
});

export const Workflow = model<Workflow>('Workflow', workflowSchema);