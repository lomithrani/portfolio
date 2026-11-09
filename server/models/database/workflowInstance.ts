import { Schema, model } from "mongoose";
import type { InferSchemaType, Types } from "mongoose";

// A visitor's way through the hiring journey (Workflow) of a portfolio's
// owner: one per owner and visitor (unique index), created when the visitor
// completes their first step. It keeps what the steps recorded, read again
// each time a later step is asked for (services/workflows.ts): the job
// posting the visitor picked (job step: done while that posting is theirs and
// open), and when they last booked a meeting (meeting step).
export const workflowInstanceSchema = new Schema({
  /** The portfolio's owner, whose journey this is */
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  /** The signed-in visitor going through it (a recruiter) */
  visitor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  /** Job step: one of the visitor's own job postings */
  job: { type: Schema.Types.ObjectId, ref: 'JobPosting' },
  jobSelectedAt: { type: Date },
  /** Meeting step: the last booking made through the journey */
  meetingBookedAt: { type: Date }
}, { timestamps: true });

workflowInstanceSchema.index({ owner: 1, visitor: 1 }, { unique: true });

export type WorkflowInstance = InferSchemaType<typeof workflowInstanceSchema> & { _id: Types.ObjectId };
export const WorkflowInstance = model('WorkflowInstance', workflowInstanceSchema);
