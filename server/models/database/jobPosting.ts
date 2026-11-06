import { Schema, model } from 'mongoose';
import type { InferSchemaType, Types } from 'mongoose';
import {
  EDUCATION_LEVELS,
  FR_CONTRACT_TYPES,
  JOB_COUNTRIES,
  JOB_STATUSES,
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
// which only guards the shape. Owned by one recruiter; its applications are
// JobApplication documents (removed with it).

const locationSchema = new Schema({
  country: { type: String, enum: JOB_COUNTRIES, required: true },
  city: String,
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
  // First time the posting left the draft status (it was then made public)
  publishedAt: Date
}, { timestamps: true });

// The public list (GET /jobs): open postings, most recently updated first
jobPostingSchema.index({ status: 1, updatedAt: -1 });

export type JobPosting = InferSchemaType<typeof jobPostingSchema> & { _id: Types.ObjectId };
export const JobPosting = model('JobPosting', jobPostingSchema);
