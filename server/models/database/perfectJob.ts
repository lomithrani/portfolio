import { Schema, model } from 'mongoose';
import type { InferSchemaType, Types } from 'mongoose';

// The perfect job of an account (the owner of a portfolio): the criteria they
// rated, as portfolio-common's parsePerfectJob returned them (what they look
// for in a job, each with its importance). One per account (unique index); an
// account without one has no criterion. Written by PUT /perfect-job only, and
// read again through portfolio-common's storedPerfectJob: a criterion an older
// version wrote and this one does not understand is left out.
//
// Private: no route returns it to anyone but its owner. The "Match the
// perfect job" step of the hiring journey scores a recruiter's job against it
// (services/workflowSteps/jobMatch.ts).
export const perfectJobSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  /** By criterion (portfolio-common's PERFECT_JOB_CRITERIA) */
  criteria: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true, minimize: false });

export type PerfectJob = InferSchemaType<typeof perfectJobSchema> & { _id: Types.ObjectId };
export const PerfectJob = model('PerfectJob', perfectJobSchema);
