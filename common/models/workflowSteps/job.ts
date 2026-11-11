import type { WorkflowStepManifest } from '../workflow';

/** The recruiter picks one of their open job descriptions, or writes one. No settings */
export const jobStep: WorkflowStepManifest = {
	type: 'job',
	kind: 'requirement',
	label: 'Select or create a job',
	description:
		'Recruiters pick one of their open job descriptions, or write a new one, before going further. You find it in the meeting invitation.',
	max: 1,
	defaultConfig: () => ({}),
	parseConfig: () => ({ ok: true, config: {} })
};
