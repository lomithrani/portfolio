import { Schema, Types, model } from "mongoose";
import type { Document } from "mongoose";
import { WorkflowStep, WorkflowInstance } from ".";

export interface WorkflowStepInstance extends Document {
  step: Types.ObjectId | WorkflowStep;
  workflowInstance: Types.ObjectId | WorkflowInstance;
  status: 'pending' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
}

export const workflowStepInstanceSchema = new Schema<WorkflowStepInstance>({
  step: { type: Types.ObjectId, ref: 'WorkflowStep', required: true },
  workflowInstance: { type: Types.ObjectId, ref: 'WorkflowInstance', required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
}, { discriminatorKey: 'type', collection: 'workflowstepinstances' });

export const WorkflowStepInstance = model<WorkflowStepInstance>('WorkflowStepInstance', workflowStepInstanceSchema);