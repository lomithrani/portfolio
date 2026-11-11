import type { WorkflowStepManifest } from '../workflow';

/** The visitor books a slot in the owner's calendar (the Appointments tab's meeting types). No settings */
export const meetingStep: WorkflowStepManifest = {
	type: 'meeting',
	kind: 'access',
	label: 'Book a meeting',
	description:
		'Recruiters book a slot in your calendar, with the meeting types of the Appointments tab.',
	max: 1,
	defaultConfig: () => ({}),
	parseConfig: () => ({ ok: true, config: {} })
};
