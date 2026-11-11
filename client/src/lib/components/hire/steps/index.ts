import { asksForAnotherJob, jobStepNote, noteContent } from '#services/workflow.ts';
import JobStep from './JobStep.svelte';
import MeetingStep from './MeetingStep.svelte';
import NoteSettings from './NoteSettings.svelte';
import NoteStep from './NoteStep.svelte';
import type { ClientStep } from './types';

// The client's side of every step type of the hiring journey, under the name of its manifest in
// portfolio-common (common/models/workflowSteps/index.ts): a new type is added in both, and in
// the API's registry (docs/WORKFLOW_STEPS.md). registry.test.ts fails when a manifest has no
// entry here.
const CLIENT_STEPS: Record<string, ClientStep> = {
	note: {
		Visitor: NoteStep,
		Settings: NoteSettings,
		title: (step) => noteContent(step.config).title.trim() || undefined,
		ownerPreview: true,
		note: (_step, state) =>
			state === 'done' ? 'You have read this note.' : 'Read the note, then confirm it.'
	},
	job: {
		Visitor: JobStep,
		note: (step, state) => jobStepNote(step.view, state),
		wantsOpen: (step, address) => asksForAnotherJob(step.view, address),
		reopenLabel: 'Change'
	},
	meeting: {
		Visitor: MeetingStep,
		note: (_step, state) =>
			state === 'done'
				? 'You booked a meeting. You can book another slot.'
				: 'Pick a time slot that suits you.',
		goal: {
			heading: (ownerName) => `Book a meeting with ${ownerName}`,
			alone: "Pick a time slot that suits you — you'll receive a calendar invitation by email.",
			after: "Then pick a time slot: you'll receive a calendar invitation by email."
		}
	}
};

/** What a step type shows; undefined for a type this version does not have */
export const clientStep = (type: string): ClientStep | undefined =>
	Object.hasOwn(CLIENT_STEPS, type) ? CLIENT_STEPS[type] : undefined;

/** Every step type the client has */
export const clientStepTypes = (): string[] => Object.keys(CLIENT_STEPS);

export type { ClientStep, SettingsProps, StepGoal, StepProps, SubmitResult } from './types';
