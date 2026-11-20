import {
	asksForAnotherJob,
	jobMatchMinScore,
	jobMatchNote,
	jobStepNote,
	noteContent
} from '#services/workflow.ts';
import JobMatchSettings from './JobMatchSettings.svelte';
import JobMatchStep from './JobMatchStep.svelte';
import JobStep from './JobStep.svelte';
import MeetingStep from './MeetingStep.svelte';
import NoteSettings from './NoteSettings.svelte';
import NoteStep from './NoteStep.svelte';
import { m } from './steps.messages';
import type { ClientStep, StepNeed } from './types';

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
		note: (_step, state) => (state === 'done' ? m.note.read : m.note.ask),
		// Confirming needs a session
		effort: {
			asks: (_step, ownerName) => m.note.asks(ownerName),
			minutes: 1,
			needs: ['googleAccount']
		}
	},
	job: {
		Visitor: JobStep,
		note: (step, state) => jobStepNote(step.view, state),
		wantsOpen: (step, address) => asksForAnotherJob(step.view, address),
		get reopenLabel() {
			return m.job.reopen;
		},
		// Picking needs a session and a recruiter space. The minutes are a pick's, or a short job's:
		// one written on the way takes longer, which `asks` says
		effort: {
			asks: (_step, ownerName) => m.job.asks(ownerName),
			minutes: 5,
			needs: ['googleAccount', 'jobDescription']
		}
	},
	'job-match': {
		Visitor: JobMatchStep,
		Settings: JobMatchSettings,
		note: (step) => jobMatchNote(step),
		failedNote: (step) => jobMatchNote(step),
		// Scored at once, from the job picked on the job step
		effort: {
			asks: (step, ownerName) => {
				const minScore = jobMatchMinScore(step.config);
				return minScore === undefined
					? m.jobMatch.asksNoMin(ownerName)
					: m.jobMatch.asks(ownerName, minScore);
			},
			minutes: 0
		}
	},
	meeting: {
		Visitor: MeetingStep,
		note: (_step, state) => (state === 'done' ? m.meeting.booked : m.meeting.ask),
		// Booked signed out when it is the whole journey: a name and an email address
		effort: { asks: () => m.meeting.asks, minutes: 2 },
		// Read when shown: the texts are the visitor's language
		goal: {
			get alone() {
				return m.meeting.goal.alone;
			},
			get after() {
				return m.meeting.goal.after;
			},
			next: (ownerName) => m.meeting.goal.next(ownerName),
			// Offered only while the owner's calendar has a meeting type to book
			booking: true
		}
	}
};

/** What a step type shows; undefined for a type this version does not have */
export const clientStep = (type: string): ClientStep | undefined =>
	Object.hasOwn(CLIENT_STEPS, type) ? CLIENT_STEPS[type] : undefined;

/** Every step type the client has */
export const clientStepTypes = (): string[] => Object.keys(CLIENT_STEPS);

/** What a visitor needs at hand for some steps, as "Before you start" says it */
export const stepNeedText = (need: StepNeed): string => m.needs[need];

export type {
	ClientStep,
	SettingsProps,
	StepEffort,
	StepGoal,
	StepNeed,
	StepProps,
	SubmitResult
} from './types';
