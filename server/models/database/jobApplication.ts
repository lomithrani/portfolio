import { Schema, model } from 'mongoose';
import type { InferSchemaType, Types } from 'mongoose';

// A candidate on a job posting's applicant list: a user who owns a domain (a
// portfolio), who applied themselves or whom the posting's recruiter added.
// One per candidate and posting (unique index: concurrent applications cannot
// create two). Removed with the posting.
export const JOB_APPLICATION_SOURCES = ['applied', 'added_by_recruiter'] as const;
export type JobApplicationSource = (typeof JOB_APPLICATION_SOURCES)[number];

export const jobApplicationSchema = new Schema({
  job: { type: Schema.Types.ObjectId, ref: 'JobPosting', required: true },
  candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // The candidate's portfolio when they were listed (a user owns at most one)
  domain: { type: Schema.Types.ObjectId, ref: 'Domain', required: true },
  source: { type: String, enum: JOB_APPLICATION_SOURCES, required: true }
}, { timestamps: true });

jobApplicationSchema.index({ job: 1, candidate: 1 }, { unique: true });
// A posting's applicants, oldest first
jobApplicationSchema.index({ job: 1, createdAt: 1 });

export type JobApplication = InferSchemaType<typeof jobApplicationSchema> & { _id: Types.ObjectId };
export const JobApplication = model('JobApplication', jobApplicationSchema);
