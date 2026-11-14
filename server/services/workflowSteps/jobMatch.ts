import { JOB_MATCH_STEP_LIMITS, scorePerfectJob } from 'portfolio-common';
import type { CriterionScore, JobMatchStepConfig, PerfectJobCriterion } from 'portfolio-common';
import { perfectJobOf } from '../perfectJobs';
import { pickedPosting } from './job';
import type { ServerStep, StepContext } from './types';

// Job match step: the job the visitor picked on the job step before it is
// scored out of 100 against the owner's perfect job (portfolio-common's
// scorePerfectJob), and the steps after it open from the minimum the owner
// set. Nothing to submit and nothing stored: the score is computed at each
// read, from the posting and the perfect job as they are now. Editing the
// posting, picking another one, or the owner changing their criteria changes
// it.
//
// The perfect job is private. A visitor gets their score and the minimum;
// with the owner's `showDetails`, also the name of each criterion and how
// their job does on it, never what the owner asks for or how much it matters.

/** How a job does on a criterion, as the visitor is told */
export type JobMatchOutcome = 'match' | 'partial' | 'miss';

export interface JobMatchCriterionView {
  criterion: PerfectJobCriterion;
  outcome: JobMatchOutcome;
  /** The posting does not say what the criterion reads: filling it in can change the outcome */
  notStated?: true;
  /** A deal-breaker of the owner's that the job does not match: the score is 0 */
  dealBreaker?: true;
}

export interface JobMatchView {
  /** Out of 100 */
  score: number;
  /** The minimum the owner asks for */
  minScore: number;
  /** The job scored (the one picked on the job step) */
  job: { _id: string; title: string };
  /** Only when the owner shows them */
  criteria?: JobMatchCriterionView[];
}

/** The minimum as stored, when it still is one; else the highest (the journey fails closed) */
const minScoreOf = (config: Partial<JobMatchStepConfig>): number => {
  const { min, max } = JOB_MATCH_STEP_LIMITS.minScore;
  const value = config?.minScore;
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : max;
};

const criterionView = ({ criterion, match, stated, dealBreaker }: CriterionScore): JobMatchCriterionView => ({
  criterion,
  outcome: match >= 1 ? 'match' : match > 0 ? 'partial' : 'miss',
  ...(stated ? {} : { notStated: true as const }),
  ...(dealBreaker && match === 0 ? { dealBreaker: true as const } : {})
});

type JobMatchContext = StepContext<JobMatchStepConfig, undefined>;

/** The visitor's job (the nearest job step before this one) scored against the owner's perfect job */
const scored = async ({ ownerId, visitorId, config, earlier }: JobMatchContext): Promise<JobMatchView | undefined> => {
  const picked = earlier.findLast((step) => step.type === 'job');
  const job = picked && (await pickedPosting(visitorId, picked.data));
  if (!job) return undefined;
  const { score, criteria } = scorePerfectJob(await perfectJobOf(ownerId), job);
  return {
    score,
    minScore: minScoreOf(config),
    job: { _id: job._id, title: job.title },
    ...(config?.showDetails === true ? { criteria: criteria.map(criterionView) } : {})
  };
};

export const jobMatchStep: ServerStep<JobMatchStepConfig, undefined, JobMatchView> = {
  type: 'job-match',
  // No job to score (none picked, or it is not theirs anymore): the job step before it is not
  // done either, so this one is locked. Under the minimum, the journey stops here
  evaluate: async (ctx) => {
    const view = await scored(ctx);
    if (!view) return { status: 'pending' };
    return { status: view.score >= view.minScore ? 'succeeded' : 'failed', view };
  },
  // The minimum is told to recruiters before they pick a job; whether details are shown is not
  visitorConfig: (config) => ({ minScore: minScoreOf(config) }),
  describe: async (ctx) => {
    const view = await scored(ctx);
    return view ? [`Job match: ${view.score}/100`] : [];
  }
};
