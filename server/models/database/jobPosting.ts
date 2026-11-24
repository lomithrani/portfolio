import { Schema, model } from 'mongoose';
import type { InferSchemaType, Types } from 'mongoose';
import {
  EDUCATION_LEVELS,
  FR_CONTRACT_TYPES,
  JOB_COUNTRIES,
  JOB_STATUSES,
  MATCHING_REVIEW_STATUSES,
  PAY_CURRENCIES,
  PAY_PERIODS,
  SENIORITY_LEVELS,
  TRAVEL_FREQUENCIES,
  WORKING_TIME_ARRANGEMENTS,
  WORK_MODES
} from 'portfolio-common';

// A job description of the recruiter space. Its fields are those of
// portfolio-common's JobPostingInput, normalised and validated there
// (normalizeJobPosting, validateJobPosting) before they reach this schema,
// which only guards the shape. Owned by one recruiter, who shows it to a
// candidate by picking it on their Hire page (the job step), or proposes it
// through matching (`matching`): it is never public.

const locationSchema = new Schema({
  country: { type: String, enum: JOB_COUNTRIES, required: true },
  city: String,
  // The office's street and number, when the posting gives it
  address: String,
  postalCode: String,
  workMode: { type: String, enum: WORK_MODES, required: true },
  remoteDaysPerWeek: Number
}, { _id: false });

const contractSchema = new Schema({
  type: { type: String, enum: FR_CONTRACT_TYPES, required: true },
  durationMonths: Number,
  // YYYY-MM-DD, a calendar date (no time zone)
  startDate: String,
  trialPeriodMonths: Number,
  collectiveAgreement: String
}, { _id: false });

const workingTimeSchema = new Schema({
  arrangement: { type: String, enum: WORKING_TIME_ARRANGEMENTS, required: true },
  hoursPerWeek: Number,
  daysPerYear: Number,
  rttDaysPerYear: Number
}, { _id: false });

const paySchema = new Schema({
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  currency: { type: String, enum: PAY_CURRENCIES, required: true },
  period: { type: String, enum: PAY_PERIODS, required: true },
  variable: String
}, { _id: false });

const organizationSchema = new Schema({
  directReports: Number,
  peers: Number,
  levelsToCeo: Number
}, { _id: false });

const requirementsSchema = new Schema({
  seniority: { type: String, enum: SENIORITY_LEVELS },
  education: { type: String, enum: EDUCATION_LEVELS },
  skills: { type: [String], default: undefined },
  languages: { type: [String], default: undefined }
}, { _id: false });

/**
 * Where a job in matching stands with the reviewers (MATCHING_REVIEWERS), who read each one before
 * it reaches a candidate (portfolio-common MATCHING_REVIEW_STATUSES)
 */
const matchingReviewSchema = new Schema({
  status: { type: String, enum: MATCHING_REVIEW_STATUSES, required: true },
  /** When it was last sent for review: it entered matching, or changed since its review */
  requestedAt: { type: Date, required: true },
  /** When a reviewer last decided */
  reviewedAt: Date,
  /** Why it was not accepted, as the reviewer wrote it for the recruiter */
  reason: String,
  /** The version decided on: a hash of the posting as candidates read it (reviewedVersion) */
  version: String
}, { _id: false });

const matchingSchema = new Schema({
  /** Since when it is in matching; unset while it is off (the review stays, for when it is back) */
  enabledAt: Date,
  review: matchingReviewSchema
}, { _id: false });

export const jobPostingSchema = new Schema({
  recruiter: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  company: String,
  status: { type: String, enum: JOB_STATUSES, required: true, default: 'draft' },
  openings: Number,
  location: { type: locationSchema, required: true },
  contract: { type: contractSchema, required: true },
  workingTime: { type: workingTimeSchema, required: true },
  pay: { type: paySchema, required: true },
  organization: organizationSchema,
  requirements: requirementsSchema,
  benefits: { type: [String], default: undefined },
  travel: { type: String, enum: TRAVEL_FREQUENCIES },
  // First time the posting left the draft status
  publishedAt: Date,
  // Matching (Path 2, behind MATCHING): whether its recruiter proposes it to the candidates whose
  // criteria it meets, and its review. Not part of the posting (JobPostingInput): its recruiter
  // turns it on for an open posting that names its company (PUT /jobs/:id/matching, or POST
  // /jobs), it goes off once the posting is filled, closed or back to draft, and the review keeps
  // the version it was of (services/jobMatching.ts)
  matching: { type: matchingSchema, default: undefined }
}, { timestamps: true });

// Postings by status, in matching or not, most recently published first: the feeds of matching
// (open and in matching), the counts of services/siteMetrics.ts (open, open and in matching)
jobPostingSchema.index({ status: 1, 'matching.enabledAt': 1, publishedAt: -1 });
// The jobs waiting for a review, the oldest request first (GET /matching/reviews)
jobPostingSchema.index(
  { 'matching.review.status': 1, 'matching.review.requestedAt': 1 },
  { partialFilterExpression: { 'matching.review.status': 'pending' } }
);

export type JobPosting = InferSchemaType<typeof jobPostingSchema> & { _id: Types.ObjectId };
export const JobPosting = model('JobPosting', jobPostingSchema);
