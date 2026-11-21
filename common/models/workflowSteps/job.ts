import type { WorkflowStepManifest } from '../workflow';
import { workflowStepMessages as m } from './workflowSteps.messages';

/**
 * How often a recruiter can share a job on one owner's job step (a pick, the same posting's new
 * version included) while the journey scores it (a job match after the job step): each share is
 * scored against the owner's perfect job, and trying many versions of a job would tell the
 * recruiter more of the owner's criteria than a score is meant to. Per owner and recruiter, per
 * UTC day (the API answers 429 beyond)
 */
export const JOB_STEP_LIMITS = { scoredSharesPerDay: 5 } as const;

/** The recruiter picks one of their open job descriptions, or writes one. No settings */
export const jobStep: WorkflowStepManifest = {
	type: 'job',
	kind: 'requirement',
	get label() {
		return m.job.label;
	},
	get description() {
		return m.job.description;
	},
	max: 1,
	defaultConfig: () => ({}),
	parseConfig: () => ({ ok: true, config: {} })
};
