import type { WorkflowStepManifest } from '../workflow';
import { workflowStepMessages as m } from './workflowSteps.messages';

/** The visitor books a slot in the owner's calendar (the Appointments tab's meeting types). No settings */
export const meetingStep: WorkflowStepManifest = {
	type: 'meeting',
	kind: 'access',
	get label() {
		return m.meeting.label;
	},
	get description() {
		return m.meeting.description;
	},
	max: 1,
	defaultConfig: () => ({}),
	parseConfig: () => ({ ok: true, config: {} })
};
