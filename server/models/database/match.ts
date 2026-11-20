import { Schema, model } from 'mongoose';
import type { InferSchemaType, Types } from 'mongoose';
import { MATCH_DECISIONS, MATCH_END_REASONS } from 'portfolio-common';

// A candidate and a recruiter's job in matching (Path 2, behind MATCHING):
// what each side said of the other, and the mutual interest that came of it.
// One per job and candidate (unique index), created by the first decision of
// either side; `recruiter` is the job's, kept here so that what the recruiter
// decided goes with their account even once the job is gone.
//
// Until both sides are interested, a match is a pair of decisions (and when
// each side first answered, which an undo or the job leaving matching keeps)
// that expire (`expiresAt`, a TTL index: portfolio-common's MATCH_RETENTION,
// the one place the numbers live, which the privacy policy states). Once both are, it is a
// mutual interest (`matchedAt`): the portfolio is revealed (`revealedAt`), and
// what each side saw of the other then is kept (`snapshot`), whatever the job
// or the candidate's criteria become; it lasts until a side or the job ends it
// (`endedAt`), then expires MATCH_RETENTION.endedMatchMonths later.
//
// The decisions and the mutual interest are services/matches.ts's (one
// atomic upsert per decision, then a write of `matchedAt` conditioned on both
// interests, so two interests at once make one mutual interest), and so is
// what a mutual interest leads to: the candidate's own hiring journey
// (services/mutualInterests.ts reads it there). What happens to it when its
// job changes (closed, deleted, out of matching, edited) is
// services/jobMatching.ts's; when its candidate withdraws,
// services/discovery.ts's (discoveryWithdrawal). Deleted with the account of
// either side, and with the jobs of the recruiter (services/accountDeletion.ts).
// Private: never logged, never returned but to its two sides.

const decisionSchema = new Schema({
  value: { type: String, enum: MATCH_DECISIONS, required: true },
  at: { type: Date, required: true },
  /**
   * The version of the posting the decision was taken on (a hash of it as candidates read it:
   * services/jobVersion.ts's reviewedVersion). A candidate's interest holds for that version only:
   * a mutual interest keeps what they said yes to
   */
  version: { type: String }
}, { _id: false });

/**
 * What each side saw when both became interested, kept as it was: the
 * posting (portfolio-common's JobSnapshot, the version the candidate said yes
 * to, which the job step of their journey is filled with), and the candidate's
 * score of it, the minimum it passed and the outcome of each criterion
 */
const snapshotSchema = new Schema({
  posting: { type: Schema.Types.Mixed, required: true },
  /** The posting's `updatedAt` then: the version's date, as a job step keeps it */
  version: { type: Date },
  score: { type: Number, required: true },
  minScore: { type: Number, required: true },
  criteria: { type: Schema.Types.Mixed },
  /** The public transport service a travel time came from, when one did (credited) */
  transit: { type: String }
}, { _id: false, minimize: false });

export const matchSchema = new Schema({
  job: { type: Schema.Types.ObjectId, ref: 'JobPosting', required: true },
  /** The job's recruiter */
  recruiter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  /** What the candidate said of the job, the latest */
  candidateDecision: { type: decisionSchema },
  /** What the recruiter said of the candidate's anonymous card for the job, the latest */
  recruiterDecision: { type: decisionSchema },
  /**
   * When each side first answered the pair, kept when they undo their answer
   * or when matching drops it (the job switched off, filled, closed or back to
   * draft: services/jobMatching.ts's EMPTY_MATCH): the other side's pass made
   * after it changes nothing that side reads (an undo, or the job put into
   * matching again, would otherwise show the pass by the pair it hides), and
   * an undo never makes an older decision the latest again. Expires with the
   * match
   */
  candidateFirstAt: { type: Date },
  recruiterFirstAt: { type: Date },
  /** When both became interested: a mutual interest, which no decision undoes */
  matchedAt: { type: Date },
  /**
   * When the candidate's portfolio was revealed to the recruiter: at the
   * mutual interest today, the hook should terms of introduction ever come first
   */
  revealedAt: { type: Date },
  snapshot: { type: snapshotSchema },
  /**
   * The latest edit of the posting that left it different from the snapshot
   * (its terms are locked: what changed is what no criterion reads); unset
   * while it is the same
   */
  changedAt: { type: Date },
  /** When each side last saw the mutual interest (unseen ones make a badge) */
  candidateSeenAt: { type: Date },
  recruiterSeenAt: { type: Date },
  /** When the mutual interest ended, and why (MATCH_END_REASONS) */
  endedAt: { type: Date },
  endReason: { type: String, enum: MATCH_END_REASONS },
  /**
   * When MongoDB removes it (TTL): MATCH_RETENTION.decisionMonths after a
   * decision no mutual interest came of (the earliest decision: kept at most
   * that long), unset while a mutual interest lasts, then
   * MATCH_RETENTION.endedMatchMonths after it ended
   */
  expiresAt: { type: Date }
}, { timestamps: true });

// One per job and candidate: two decisions at once make one match
matchSchema.index({ job: 1, candidate: 1 }, { unique: true });
// A candidate's matches and mutual interests, the latest first (their inbox, a withdrawal)
matchSchema.index({ candidate: 1, matchedAt: -1 });
// A recruiter's mutual interests, the latest first (their dashboard, account deletion)
matchSchema.index({ recruiter: 1, matchedAt: -1 });
// MongoDB removes a match once its expiresAt is past (about a minute after)
matchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type Match = InferSchemaType<typeof matchSchema> & { _id: Types.ObjectId };
export const Match = model('Match', matchSchema);
