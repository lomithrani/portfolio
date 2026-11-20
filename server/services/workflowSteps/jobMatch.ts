import { JOB_MATCH_STEP_LIMITS, scorePerfectJob } from 'portfolio-common';
import type { CriterionScore, JobMatchStepConfig, PerfectJobCriterion } from 'portfolio-common';
import { commuteAvailability, commuteContext } from '../commute';
import type { TransitProvider } from '../transit';
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
}

/** The minimum as stored, when it still is one; else the highest (the journey fails closed) */
const minScoreOf = (config: Partial<JobMatchStepConfig>): number => {
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

type JobMatchContext = StepContext<JobMatchStepConfig, undefined>;

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
    minScore: minScoreOf(config),
    job: { _id: shared._id, title: job.title },
    ...(shown ? { criteria: shown } : {}),
    ...(transit ? { transit } : {})
  };
};

export const jobMatchStep: ServerStep<JobMatchStepConfig, undefined, JobMatchView> = {
  type: 'job-match',
  // No job to score (none shared, or no version kept of the one picked, it is not theirs anymore,
  // or they have not accepted the terms in force): the job step before it is not done either, so
  // this one is locked, with nothing computed (no score, no travel time). Under the minimum, the
  // journey stops here
  evaluate: async (ctx) => {
    const view = await scored(ctx);
    if (!view) return { status: 'pending' };
    return { status: view.score >= view.minScore ? 'succeeded' : 'failed', view };
  },
  // The minimum is told to recruiters before they pick a job; whether details are shown is not
  visitorConfig: (config) => ({ minScore: minScoreOf(config) }),
  describe: async (ctx) => {
    const view = await scored(ctx);
    return view ? [m.jobMatch.invitation(view.score)] : [];
  }
};
