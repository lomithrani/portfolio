import { asksForAnotherJob, jobMatchNote, jobStepNote, noteContent } from '#services/workflow.ts';
import JobMatchSettings from './JobMatchSettings.svelte';
import JobMatchStep from './JobMatchStep.svelte';
import JobStep from './JobStep.svelte';
import MeetingStep from './MeetingStep.svelte';
import NoteSettings from './NoteSettings.svelte';
import NoteStep from './NoteStep.svelte';
import { m } from './steps.messages';
import type { ClientStep } from './types';

// The client's side of every step type of the hiring journey, under the name of its manifest in
// portfolio-common (common/models/workflowSteps/index.ts): a new type is added in both, and in
// the API's registry (docs/WORKFLOW_STEPS.md). registry.test.ts fails when a manifest has no
// entry here. The registry is built once, for every visitor: a text is read from its message
// when it is asked for (a function, a getter, the messages themselves), never kept here.
const CLIENT_STEPS: Record<string, ClientStep> = {
	note: {
		Visitor: NoteStep,
		Settings: NoteSettings,
		title: (step) => noteContent(step.config).title.trim() || undefined,
		ownerPreview: true,
		note: (_step, state) => (state === 'done' ? m.note.read : m.note.ask)
	},
	job: {
		Visitor: JobStep,
		note: (step, state) => jobStepNote(step.view, state),
		wantsOpen: (step, address) => asksForAnotherJob(step.view, address),
		get reopenLabel() {
			return m.job.reopen;
		}
	},
	'job-match': {
		Visitor: JobMatchStep,
		Settings: JobMatchSettings,
		note: (step) => jobMatchNote(step),
		failedNote: (step) => jobMatchNote(step)
	},
	meeting: {
		Visitor: MeetingStep,
		note: (_step, state) => (state === 'done' ? m.meeting.booked : m.meeting.ask),
		goal: m.meeting.goal
	}
};

/** What a step type shows; undefined for a type this version does not have */
export const clientStep = (type: string): ClientStep | undefined =>
	Object.hasOwn(CLIENT_STEPS, type) ? CLIENT_STEPS[type] : undefined;

/** Every step type the client has */
export const clientStepTypes = (): string[] => Object.keys(CLIENT_STEPS);

export type { ClientStep, SettingsProps, StepGoal, StepProps, SubmitResult } from './types';
