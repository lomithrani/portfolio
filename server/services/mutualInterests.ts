import { Types } from 'mongoose';
import { PERFECT_JOB_CRITERIA } from 'portfolio-common';
import type { JobSnapshot, MatchDecision, MatchEndReason, PerfectJobCriterion } from 'portfolio-common';
import { env } from '../env';
import { Match } from '../models/database';
import { storedJobSnapshot } from './jobPostings';
import type { TransitProvider } from './transit';
import type { JobMatchCriterionView, JobMatchOutcome } from './workflowSteps/jobMatch';

// A mutual interest of matching (Path 2, behind MATCHING) as what reads it
// sees it: the candidate's hiring journey, where it leads (the job step holds
// its job, the job match its score, frozen: services/workflowSteps/), the
// journey's answer (`match`), the job's private page (services/jobAccess.ts)
// and the lists of each side (services/matches.ts). Read from the Match the
// decisions made (models/database/match.ts): its snapshot is what the
// candidate said yes to, checked again as a job step checks the version it
// keeps, never trusted as stored. Apart from services/matches.ts, which writes
// matches and loads the journey's engine: the engine loads this.
//
// While MATCHING is off, the journey reads none (Path 1 only: what a mutual
// interest wrote in a journey then holds nothing, services/workflowSteps/job.ts).

/** A mutual interest, as the journey and the job's private page read it */
export interface MutualInterest {
  _id: string;
  /** The job's id */
  job: string;
  candidate: string;
  recruiter: string;
  matchedAt: Date;
  /** The latest edit of the posting that made it differ from `posting`; unset while it does not */
  changedAt?: Date;
  /** When it ended, and why: unset while it lasts */
  endedAt?: Date;
  endReason?: MatchEndReason;
  /** The version the candidate said yes to, read back; undefined when it no longer checks out */
  posting?: JobSnapshot;
  /** That version's date: the posting's `updatedAt` then (the mutual interest's own date before it was kept) */
  version: Date;
  /** The candidate's score of it then, out of 100 */
  score: number;
  /** The minimum of their journey then, which it passed */
  minScore: number;
  /** How it did on each of their criteria then, the commute included */
  criteria: JobMatchCriterionView[];
  /** With a travel time among `criteria`: the public transport service asked, to credit it */
  transit?: TransitProvider;
}

const OUTCOMES: readonly JobMatchOutcome[] = ['match', 'partial', 'miss', 'unknown'];

const isCriterion = (value: unknown): value is PerfectJobCriterion =>
  typeof value === 'string' && (PERFECT_JOB_CRITERIA as readonly string[]).includes(value);

/** The outcomes a snapshot kept, as views: what is not one is left out */
const readCriteria = (value: unknown): JobMatchCriterionView[] =>
  (Array.isArray(value) ? value : []).flatMap((entry): JobMatchCriterionView[] => {
    const { criterion, outcome, notStated, dealBreaker } = (entry ?? {}) as Record<string, unknown>;
    if (!isCriterion(criterion) || !OUTCOMES.includes(outcome as JobMatchOutcome)) return [];
    return [
      {
        criterion,
        outcome: outcome as JobMatchOutcome,
        ...(notStated === true ? { notStated: true as const } : {}),
        ...(dealBreaker === true ? { dealBreaker: true as const } : {})
      }
    ];
  });

const isScore = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;

const validDate = (value: unknown): Date | undefined =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value : undefined;

/** A Match as stored (lean), the fields read here */
export interface StoredMutualInterest {
  _id: Types.ObjectId;
  job: Types.ObjectId;
  candidate: Types.ObjectId;
  recruiter: Types.ObjectId;
  matchedAt?: Date | null;
  changedAt?: Date | null;
  endedAt?: Date | null;
  endReason?: string | null;
  snapshot?: {
    posting?: unknown;
    version?: Date | null;
    score?: unknown;
    minScore?: unknown;
    criteria?: unknown;
    transit?: string | null;
  } | null;
}

/**
 * A stored mutual interest as it is read (see MutualInterest); undefined for a Match that is not
 * one (no mutual interest, or a snapshot without a score: written by hand). A score or minimum
 * that is not one reads as 0 and 100: what was frozen then fails closed
 */
export const readMutualInterest = (match: StoredMutualInterest): MutualInterest | undefined => {
  const matchedAt = validDate(match.matchedAt);
  if (!matchedAt || !match.snapshot) return undefined;
  const { snapshot } = match;
  const changedAt = validDate(match.changedAt);
  const endedAt = validDate(match.endedAt);
  const posting = storedJobSnapshot(snapshot.posting);
  const transit = snapshot.transit === 'here' || snapshot.transit === 'transitous' ? snapshot.transit : undefined;
  return {
    _id: String(match._id),
    job: String(match.job),
    candidate: String(match.candidate),
    recruiter: String(match.recruiter),
    matchedAt,
    ...(changedAt ? { changedAt } : {}),
    ...(endedAt ? { endedAt, endReason: (match.endReason ?? 'candidate') as MatchEndReason } : {}),
    ...(posting ? { posting } : {}),
    version: validDate(snapshot.version) ?? matchedAt,
    score: isScore(snapshot.score) ? snapshot.score : 0,
    minScore: isScore(snapshot.minScore) ? snapshot.minScore : 100,
    criteria: readCriteria(snapshot.criteria),
    ...(transit ? { transit } : {})
  };
};

/** A mutual interest that leads somewhere: both interested, the portfolio revealed, not ended */
export const LASTING = {
  matchedAt: { $exists: true },
  revealedAt: { $exists: true },
  endedAt: { $exists: false }
} as const;

/**
 * The mutual interest between the owner `ownerId` (the candidate) and the visitor `visitorId` (the
 * recruiter) that leads into the owner's journey now: lasting (LASTING), the latest when they have
 * several (two jobs of one recruiter). Undefined without one, and while MATCHING is off
 */
export async function activeMutualInterest(ownerId: string, visitorId: string): Promise<MutualInterest | undefined> {
  if (!env.matchingEnabled || !Types.ObjectId.isValid(ownerId) || !Types.ObjectId.isValid(visitorId)) return undefined;
  const match = await Match.findOne({ candidate: ownerId, recruiter: visitorId, ...LASTING })
    .sort({ matchedAt: -1 })
    .lean<StoredMutualInterest>();
  return match ? readMutualInterest(match) : undefined;
}

/**
 * The mutual interest the candidate `candidateId` has on the job `jobId`, going on or ended (until
 * it expires): what they read of the job on its private page (services/jobAccess.ts). Undefined
 * without one, and while MATCHING is off
 */
export async function mutualInterestOn(jobId: string, candidateId: string): Promise<MutualInterest | undefined> {
  if (!env.matchingEnabled || !Types.ObjectId.isValid(jobId) || !Types.ObjectId.isValid(candidateId)) return undefined;
  const match = await Match.findOne({ job: jobId, candidate: candidateId, matchedAt: { $exists: true } }).lean<StoredMutualInterest>();
  return match ? readMutualInterest(match) : undefined;
}

/**
 * The decision the candidate `candidateId` took on the job `jobId` before any mutual interest
 * (interested, or a pass), to show on the job's private page; undefined without one
 */
export async function candidateDecisionOn(jobId: string, candidateId: string): Promise<MatchDecision | undefined> {
  if (!Types.ObjectId.isValid(jobId) || !Types.ObjectId.isValid(candidateId)) return undefined;
  const match = await Match.findOne(
    { job: jobId, candidate: candidateId, matchedAt: { $exists: false } },
    { candidateDecision: 1 }
  ).lean<{ candidateDecision?: { value?: string | null } | null }>();
  const value = match?.candidateDecision?.value;
  return value === 'interested' || value === 'pass' ? value : undefined;
}
