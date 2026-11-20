import { JOB_MATCH_STEP_LIMITS, scorePerfectJob } from 'portfolio-common';
import type { CriterionScore, JobMatchStepConfig, PerfectJobCriterion } from 'portfolio-common';
import { commuteAvailability, commuteContext } from '../commute';
import type { TransitProvider } from '../transit';
import type { MutualInterest } from '../mutualInterests';
import { perfectJobOf } from '../perfectJobs';
import { pickedSnapshot } from './job';
import type { ServerStep, StepContext } from './types';
import { m } from './steps.messages';

// Job match step: the version of the job the visitor shared on the job step
// before it is scored out of 100 against the owner's perfect job
// (portfolio-common's scorePerfectJob), and the steps after it open from the
// minimum the owner set. Nothing to submit and nothing stored: the score is
// computed at each read, from the version shared and the perfect job as it is
// now. Sharing another posting (or the new version of the same one), or the
// owner changing their criteria or the minimum, changes it; an edit of the
// posting does not until it is shared again, and the fields it reads are
// locked once the posting is opened (LOCKED_JOB_FIELDS), so a new version of
// them is a duplicate, picked again.
//
// The perfect job is private. A visitor gets their score and the minimum;
// with the owner's `showDetails`, also the name of each criterion and how
// their job does on it, never what the owner asks for or how much it matters.
//
// A job that comes from matching (Path 2: the owner and the recruiter are both
// interested in it, which the job step before holds) is not scored again: the
// step is frozen at the score the owner said yes to, the mutual interest's
// (succeeded, whatever the owner's criteria or minimum became since: their
// interest is their yes to that job), and says so (`matched`, `frozenAt`).
// services/matches.ts records the freeze in the visitor's progress
// (freezeJobMatch, `via: 'mutual_match'`); it holds from the mutual interest
// itself while it lasts (a journey edited since keeps it), never after.

/** How a job does on a criterion, as the visitor is told */
/** `unknown`: the criterion could not be computed, and does not count in the score */
export type JobMatchOutcome = 'match' | 'partial' | 'miss' | 'unknown';

export interface JobMatchCriterionView {
  criterion: PerfectJobCriterion;
  outcome: JobMatchOutcome;
  /**
   * The posting does not say what the criterion reads: a duplicate that states it can change
   * the outcome
   */
  notStated?: true;
  /** A deal-breaker of the owner's that the job does not match: the score is 0 */
  dealBreaker?: true;
}

export interface JobMatchView {
  /** Out of 100 */
  score: number;
  /** The minimum the owner asks for */
  minScore: number;
  /** The job scored (the version shared on the job step: its title) */
  job: { _id: string; title: string };
  /** Only when the owner shows them */
  criteria?: JobMatchCriterionView[];
  /**
   * With the commute among `criteria`: the service this site asks for public
   * transport times, to credit it. The site's, whatever the owner asked for:
   * it says nothing of how they travel
   */
  transit?: TransitProvider;
  /**
   * The job is the one the owner and the recruiter are both interested in (matching): its score is
   * the one it had then, frozen, and the step succeeds whatever changed since
   */
  matched?: true;
  /** When it was frozen: when they both became interested */
  frozenAt?: Date;
}

/** How a job match was frozen: by a mutual interest of matching (the only way today) */
export const JOB_MATCH_FROZEN_VIA = 'mutual_match';

/** What a job match stores when a mutual interest freezes it (services/matches.ts) */
export interface FrozenJobMatchData {
  via: typeof JOB_MATCH_FROZEN_VIA;
  /** The mutual interest's id */
  match: string;
  /** Its job's id (so that deleting the posting drops it with the job step's: plugins/jobs.ts) */
  job: string;
  frozenAt: Date;
}

/**
 * What the job match after a job step stores for the recruiter of a mutual interest: the record
 * that it is frozen at the score of the mutual interest. The step reads the freeze from the mutual
 * interest itself (StepContext.mutualInterest), which holds the score
 */
export const freezeJobMatch = (interest: MutualInterest): FrozenJobMatchData => ({
  via: JOB_MATCH_FROZEN_VIA,
  match: interest._id,
  job: interest.job,
  frozenAt: interest.matchedAt
});

/**
 * The minimum of a job match step's settings as stored, when it still is one; else the highest
 * (the journey fails closed). The bar every job is held to on that journey, and in discovery
 * (services/discovery.ts)
 */
export const jobMatchMinScore = (config: Partial<JobMatchStepConfig>): number => {
  const { min, max } = JOB_MATCH_STEP_LIMITS.minScore;
  const value = config?.minScore;
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : max;
};

const criterionView = ({ criterion, match, stated, dealBreaker, unavailable }: CriterionScore): JobMatchCriterionView => {
  if (unavailable) return { criterion, outcome: 'unknown' };
  return {
    criterion,
    outcome: match >= 1 ? 'match' : match > 0 ? 'partial' : 'miss',
    ...(stated ? {} : { notStated: true as const }),
    ...(dealBreaker && match === 0 ? { dealBreaker: true as const } : {})
  };
};

/**
 * How a job does on each criterion, as the job match step tells it (one view per criterion that
 * counts, in order): what the feeds of matching show too (services/matchFeeds.ts), the candidate's
 * all of them, a recruiter's only what the candidate's card may show (cardOutcomes)
 */
export const jobMatchCriteria = (criteria: readonly CriterionScore[]): JobMatchCriterionView[] =>
  criteria.map(criterionView);

type JobMatchContext = StepContext<JobMatchStepConfig, FrozenJobMatchData | undefined>;

/**
 * The view of a job match frozen by the mutual interest `interest`: its score, minimum and outcomes
 * then (the outcomes only while the owner shows them, as for a job scored), with a job step before
 * it (which holds that job). Undefined without one, or for a version that no longer checks out
 */
const frozen = ({ config, earlier }: JobMatchContext, interest: MutualInterest): JobMatchView | undefined => {
  if (!interest.posting || !earlier.some((step) => step.type === 'job')) return undefined;
  const shown = config?.showDetails === true ? interest.criteria : undefined;
  const transit = shown?.some(({ criterion, outcome }) => criterion === 'commute' && outcome !== 'unknown')
    ? interest.transit
    : undefined;
  return {
    score: interest.score,
    minScore: interest.minScore,
    job: { _id: interest.job, title: interest.posting.title },
    ...(shown ? { criteria: shown } : {}),
    ...(transit ? { transit } : {}),
    matched: true,
    frozenAt: interest.matchedAt
  };
};

/**
 * The version of the visitor's job shared on the nearest job step before this one, scored against
 * the owner's perfect job
 */
const scored = async ({ ownerId, visitorId, config, earlier }: JobMatchContext): Promise<JobMatchView | undefined> => {
  const picked = earlier.findLast((step) => step.type === 'job');
  const shared = picked && (await pickedSnapshot(visitorId, picked.data));
  if (!shared) return undefined;
  const job = shared.posting;
  const perfectJob = await perfectJobOf(ownerId);
  // The one criterion a posting and the criteria do not settle alone: a travel time, asked for once and kept
  const context = await commuteContext(perfectJob.commute, job.location);
  const { score, criteria } = scorePerfectJob(perfectJob, job, context);
  const shown = config?.showDetails === true ? criteria.map(criterionView) : undefined;
  // The site's, while it computes travel times (not when they are off: nothing was asked)
  const transit = shown?.some(({ criterion }) => criterion === 'commute') ? commuteAvailability().transit : undefined;
  return {
    score,
    minScore: jobMatchMinScore(config),
    job: { _id: shared._id, title: job.title },
    ...(shown ? { criteria: shown } : {}),
    ...(transit ? { transit } : {})
  };
};

export const jobMatchStep: ServerStep<JobMatchStepConfig, FrozenJobMatchData | undefined, JobMatchView> = {
  type: 'job-match',
  // No job to score (none shared, or no version kept of the one picked, it is not theirs anymore,
  // or they have not accepted the terms in force): the job step before it is not done either, so
  // this one is locked, with nothing computed (no score, no travel time). Under the minimum, the
  // journey stops here. The job of a mutual interest is not scored again: frozen, it succeeds
  evaluate: async (ctx) => {
    if (ctx.mutualInterest) {
      const view = frozen(ctx, ctx.mutualInterest);
      return view ? { status: 'succeeded', view } : { status: 'pending' };
    }
    const view = await scored(ctx);
    if (!view) return { status: 'pending' };
    return { status: view.score >= view.minScore ? 'succeeded' : 'failed', view };
  },
  // The minimum is told to recruiters before they pick a job; whether details are shown is not
  visitorConfig: (config) => ({ minScore: jobMatchMinScore(config) }),
  describe: async (ctx) => {
    const view = ctx.mutualInterest ? frozen(ctx, ctx.mutualInterest) : await scored(ctx);
    return view ? [m.jobMatch.invitation(view.score)] : [];
  }
};
