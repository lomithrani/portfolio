import type { WorkflowStepManifest } from '../workflow';
import { workflowStepMessages as m } from './workflowSteps.messages';

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
