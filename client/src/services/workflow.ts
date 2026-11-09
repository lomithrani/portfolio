import {
	APPLICABLE_JOB_STATUS,
	JOB_STATUS_LABELS,
	WORKFLOW_STEPS,
	WORKFLOW_STEP_TYPES,
	isValidDomainName,
	normalizeDomainName,
	type JobStatus,
	type WorkflowStepType
} from 'portfolio-common';
import { isNetworkFailure, NETWORK_ERROR } from './recruiter';

// The hiring journey of a portfolio (portfolio-common WORKFLOW_STEPS): the steps its owner
// chooses in the admin tab (GET/PUT /workflow), and the visitor's way through them on the Hire
// page (GET /workflow/domains/:domainName, PUT .../job). Pure helpers: the API calls stay in the
// components.

// --- Shapes ----------------------------------------------------------------------------

/** The job a visitor picked, as their journey has it */
export interface JourneyJob {
	_id: string;
	title: string;
	company?: string;
	status: JobStatus;
}

/** GET /workflow/domains/:domainName: the steps, and where the caller stands */
export interface Journey {
	steps: { type: WorkflowStepType; done: boolean }[];
	job?: JourneyJob;
	/** The caller owns the portfolio: a preview, where no step is locked */
	own?: true;
}

// --- The owner's editor ------------------------------------------------------------------

/** The steps with `type` turned on or off, in the catalogue's order */
export const withStep = (
	steps: readonly WorkflowStepType[],
	type: WorkflowStepType,
	on: boolean
): WorkflowStepType[] =>
	WORKFLOW_STEP_TYPES.filter((step) => (step === type ? on : steps.includes(step)));

export const sameSteps = (a: readonly WorkflowStepType[], b: readonly WorkflowStepType[]) =>
	a.length === b.length && a.every((type, index) => type === b[index]);

/** What recruiters will go through, in one sentence (the editor's summary) */
export const journeySummary = (steps: readonly WorkflowStepType[]): string => {
	if (steps.length === 0) {
		return 'Your Hire page offers nothing: recruiters are asked to reach out directly.';
	}
	const labels = steps.map((type) => {
		const label = WORKFLOW_STEPS[type].label;
		return label.charAt(0).toLowerCase() + label.slice(1);
	});
	if (labels.length === 1) return `Recruiters can ${labels[0]} right away.`;
	return `Recruiters ${labels.slice(0, -1).join(', ')}, then ${labels.at(-1)}.`;
};

// --- The visitor's journey ---------------------------------------------------------------

/**
 * done: completed (it can be visited again); open: the next one to do; locked: a step before
 * it is not done. The owner previews: nothing is locked for them
 */
export type StepState = 'done' | 'open' | 'locked';

export const stepStates = (journey: Journey): StepState[] => {
	const firstToDo = journey.steps.findIndex((step) => !step.done);
	return journey.steps.map((step, index) => {
		if (journey.own) return 'open';
		if (firstToDo === -1 || index < firstToDo) return 'done';
		return index === firstToDo ? 'open' : 'locked';
	});
};

/**
 * The step shown unfolded on arrival: the first one to do, else the last (the goal). The owner's
 * preview opens the last one: the steps before it ask nothing of the owner
 */
export const activeStepIndex = (journey: Journey): number => {
	if (journey.own) return journey.steps.length - 1;
	const firstToDo = journey.steps.findIndex((step) => !step.done);
	return firstToDo === -1 ? journey.steps.length - 1 : firstToDo;
};

/** The journey is only the meeting step: the Hire page is the booking page, as before journeys */
export const isBookingOnly = (journey: Journey): boolean =>
	journey.steps.length === 1 && journey.steps[0].type === 'meeting';

/** What the Hire page says under its title */
export const journeyIntro = (journey: Journey, ownerName: string): string => {
	const before = journey.steps.findIndex((step) => step.type === 'meeting');
	if (before === -1) return `${ownerName} does not take meeting requests online right now.`;
	if (before === 0) {
		return "Pick a time slot that suits you — you'll receive a calendar invitation by email.";
	}
	const count = before === 1 ? 'one step' : `${before} steps`;
	return `${ownerName} asks recruiters to complete ${count} first. Then pick a time slot: you'll receive a calendar invitation by email.`;
};

/** The line under a step's name: what it asks, or what the visitor did there */
export const stepNote = (journey: Journey, index: number, state: StepState): string => {
	const step = journey.steps[index];
	if (journey.own) return WORKFLOW_STEPS[step.type].description;
	if (state === 'locked') {
		return index === 1 ? 'Complete the step above first.' : 'Complete the steps above first.';
	}
	if (step.type === 'job') {
		if (state === 'done' && journey.job) return jobLine(journey.job);
		if (journey.job) {
			return `${journey.job.title} is ${JOB_STATUS_LABELS[journey.job.status].toLowerCase()} now: pick an open job description.`;
		}
		return 'Pick the job you are hiring for, or write it.';
	}
	return state === 'done'
		? 'You booked a meeting. You can book another slot.'
		: 'Pick a time slot that suits you.';
};

// --- Job step ----------------------------------------------------------------------------

/** Only an open posting can be picked (the API's rule) */
export const isPickable = (job: { status: JobStatus }): boolean =>
	job.status === APPLICABLE_JOB_STATUS;

/** Open postings first, each group in the order the API listed them (most recently updated) */
export const sortJobChoices = <T extends { status: JobStatus }>(jobs: readonly T[]): T[] => [
	...jobs.filter(isPickable),
	...jobs.filter((job) => !isPickable(job))
];

/**
 * The posting selected when the step shows: the one asked for in the address (back from creating
 * it), else the one picked before, else the only open one; null when none of them is pickable
 */
export const initialJobChoice = (
	jobs: readonly { _id: string; status: JobStatus }[],
	requested: string | null | undefined,
	picked: string | null | undefined
): string | null => {
	const pickable = jobs.filter(isPickable);
	for (const id of [requested, picked]) {
		if (id && pickable.some((job) => job._id === id)) return id;
	}
	return pickable.length === 1 ? pickable[0]._id : null;
};

/** "Senior Engineer · Acme" */
export const jobLine = (job: { title: string; company?: string }): string =>
	job.company ? `${job.title} · ${job.company}` : job.title;

const bodyText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * What a failed PUT /workflow/domains/:domainName/job means. `reload`: the journey or the jobs
 * changed (the page loads them again); `session-expired` has to clear the session
 */
export const pickJobFailure = (
	status: number | undefined,
	value: unknown
): { message: string; kind: 'session-expired' | 'reload-journey' | 'reload-jobs' | 'error' } => {
	if (isNetworkFailure(value)) return { message: NETWORK_ERROR, kind: 'error' };
	const text = bodyText(value);
	switch (status) {
		case 401:
			return {
				message: 'Your session expired. Sign in again to pick a job.',
				kind: 'session-expired'
			};
		case 403:
			if (/recruiter space/i.test(text)) {
				return { message: 'Create your recruiter space to pick a job.', kind: 'reload-jobs' };
			}
			if (/own portfolio/i.test(text)) {
				return {
					message: 'This is your own portfolio: you cannot pick a job for it.',
					kind: 'error'
				};
			}
			return { message: 'Complete the steps above first.', kind: 'reload-journey' };
		case 404:
			return /job posting/i.test(text)
				? {
						message: 'This job description no longer exists. Pick another one.',
						kind: 'reload-jobs'
					}
				: { message: 'This portfolio no longer exists.', kind: 'error' };
		case 409:
			return /open/i.test(text)
				? {
						message: 'Only an open job description can be picked. Set its status to Open first.',
						kind: 'reload-jobs'
					}
				: {
						message: 'This hiring journey changed: it no longer asks for a job.',
						kind: 'reload-journey'
					};
		default:
			return { message: 'Could not pick this job. Try again in a moment.', kind: 'error' };
	}
};

// --- Creating a job from the journey -----------------------------------------------------

/** The parameter of /recruiter/jobs/new naming the portfolio whose journey to go back to */
export const JOURNEY_PARAM = 'journey';
/** The parameter of the Hire page naming the job just created, to select it */
export const JOB_PARAM = 'job';

/** The portfolio of a `?journey=` parameter, normalised; null when it is not a portfolio name */
export const journeyReturnDomain = (param: string | null | undefined): string | null => {
	const name = normalizeDomainName(param ?? '');
	return name && isValidDomainName(name) ? name : null;
};

/** The job id of a `?job=` parameter; null when it is not one */
export const requestedJobId = (param: string | null | undefined): string | null =>
	param && /^[0-9a-f]{24}$/i.test(param) ? param : null;
