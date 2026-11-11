import { Schema, model } from "mongoose";
import type { InferSchemaType, Types } from "mongoose";

// A visitor's way through the hiring journey (Workflow) of a portfolio's
// owner: one per owner and visitor (unique index), created when the visitor
// completes their first step. It keeps what each step stored for this
// visitor, under the step's id: the step's type alone knows what its data
// means (services/workflowSteps/), and reads it again each time the journey
// or a later step is asked for (services/workflows.ts).
const stepProgressSchema = new Schema({
  /** What the step stored (the job picked, when a note was confirmed...) */
  data: { type: Schema.Types.Mixed },
  updatedAt: { type: Date, required: true }
}, { _id: false, minimize: false });

export const workflowInstanceSchema = new Schema({
  /** The portfolio's owner, whose journey this is */
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  /** The signed-in visitor going through it (a recruiter) */
  visitor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /**
   * By step id (portfolio-common's WORKFLOW_LIMITS.stepId: no dot, no dollar,
   * so an id is a safe key). Progress of a step the owner removed is dropped
   * when they save the journey
   */
  steps: { type: Map, of: stepProgressSchema }
}, { timestamps: true, minimize: false });

workflowInstanceSchema.index({ owner: 1, visitor: 1 }, { unique: true });

export type WorkflowInstance = InferSchemaType<typeof workflowInstanceSchema> & { _id: Types.ObjectId };
export const WorkflowInstance = model('WorkflowInstance', workflowInstanceSchema);
