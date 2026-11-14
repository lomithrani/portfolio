import type { StepConfigResult, WorkflowStepManifest } from '../workflow';

/**
 * The job the recruiter picked in the job step is scored out of 100 against the owner's perfect
 * job (perfectJob.ts): the steps after it open from `minScore`
 */
export interface JobMatchStepConfig {
	/** The score a job needs, from 0 (any job) to 100 */
	minScore: number;
	/**
	 * Recruiters also see which criteria their job matches (their names and the outcome, never
	 * what the owner asks for or how much each matters); the score alone otherwise
	 */
	showDetails: boolean;
}

export const JOB_MATCH_STEP_LIMITS = { minScore: { min: 0, max: 100 } } as const;

/** The minimum a new step starts with */
export const DEFAULT_JOB_MATCH_MIN_SCORE = 70;

const parseConfig = (raw: unknown): StepConfigResult<JobMatchStepConfig> => {
	const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const { min, max } = JOB_MATCH_STEP_LIMITS.minScore;
	const minScore = source.minScore;
	if (
		typeof minScore !== 'number' ||
		!Number.isInteger(minScore) ||
		minScore < min ||
		minScore > max
	) {
		return {
			ok: false,
			field: 'minScore',
			message: `The minimum score is a whole number from ${min} to ${max}.`
		};
	}
	return { ok: true, config: { minScore, showDetails: source.showDetails === true } };
};

export const jobMatchStep: WorkflowStepManifest<JobMatchStepConfig> = {
	type: 'job-match',
	kind: 'requirement',
	label: 'Match the perfect job',
	description:
		'The job the recruiter picked is scored out of 100 against your perfect job (the Perfect job tab). Under the minimum you set, they cannot go further.',
	max: 1,
	needs: ['job'],
	defaultConfig: () => ({ minScore: DEFAULT_JOB_MATCH_MIN_SCORE, showDetails: false }),
	parseConfig
};
