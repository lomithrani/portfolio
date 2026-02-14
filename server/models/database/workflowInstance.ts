import { Schema, Types, model } from "mongoose";
import type { Document } from "mongoose";
import { WorkflowStepInstance } from "./workflowStepInstance";
import { User, Workflow } from ".";

export interface WorkflowInstance extends Document {
  workflow: Types.ObjectId | Workflow;
  user: Types.ObjectId | User;
  steps: WorkflowStepInstance[];
  status: 'ongoing' | 'completed' | 'failed'
  startedAt: Date;
  completedAt?: Date;
}

export const workflowInstanceSchema = new Schema<WorkflowInstance>({
  workflow: { type: Types.ObjectId, ref: 'Workflow', required: true },
  user: { type: Types.ObjectId, ref: 'User', required: true },
  steps: [{ type: Types.ObjectId, ref: 'WorkflowStepAttempt' }],
  status: { type: String, enum: ['ongoing', 'completed', 'failed'], default: 'ongoing' },
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
});

export const WorkflowInstance = model<WorkflowInstance>('WorkflowInstance', workflowInstanceSchema);