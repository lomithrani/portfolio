import { describe, it, expect } from 'vitest';
import {
	DEFAULT_WORKFLOW_STEPS,
	WORKFLOW_STEP_TYPES,
	isWorkflowStepType,
	workflowStepsProblem
} from 'portfolio-common';
import { NETWORK_ERROR } from '../recruiter';
import {
	activeStepIndex,
	initialJobChoice,
	isBookingOnly,
	isPickable,
	jobLine,
	journeyIntro,
	journeyReturnDomain,
	journeySummary,
	pickJobFailure,
	requestedJobId,
	sameSteps,
	sortJobChoices,
	stepNote,
	stepStates,
	withStep,
	type Journey
} from '../workflow';

const JOB = {
	_id: 'a'.repeat(24),
	title: 'Staff Engineer',
	company: 'Acme',
	status: 'open'
} as const;

const journey = (done: [boolean, boolean], extra: Partial<Journey> = {}): Journey => ({
	steps: [
		{ type: 'job', done: done[0] },
		{ type: 'meeting', done: done[1] }
	],
	...extra
});

describe('the step catalogue (portfolio-common)', () => {
	it('starts every portfolio with booking only', () => {
		expect(DEFAULT_WORKFLOW_STEPS).toEqual(['meeting']);
		expect(workflowStepsProblem(DEFAULT_WORKFLOW_STEPS)).toBeNull();
	});

	it('accepts any journey whose requirements come before a step they open', () => {
		expect(workflowStepsProblem([])).toBeNull();
		expect(workflowStepsProblem(['job', 'meeting'])).toBeNull();
	});

	it('refuses a step used twice, and a requirement that opens nothing', () => {
		expect(workflowStepsProblem(['meeting', 'meeting'])).toBe('Each step can be used only once.');
		expect(workflowStepsProblem(['job'])).toBe(
			'“Select or create a job” must come before a step it opens: add “Book a meeting” after it.'
		);
		expect(workflowStepsProblem(['meeting', 'job'])).toMatch(/must come before/);
	});

	it('knows its step types', () => {
		expect(WORKFLOW_STEP_TYPES.every(isWorkflowStepType)).toBe(true);
		expect(isWorkflowStepType('contact')).toBe(false);
		expect(isWorkflowStepType(undefined)).toBe(false);
	});
});

describe("the owner's editor", () => {
	it('turns steps on and off, in the catalogue order', () => {
		expect(withStep(['meeting'], 'job', true)).toEqual(['job', 'meeting']);
		expect(withStep(['job', 'meeting'], 'job', false)).toEqual(['meeting']);
		expect(withStep([], 'meeting', true)).toEqual(['meeting']);
		expect(withStep(['meeting'], 'meeting', true)).toEqual(['meeting']);
	});

	it('compares journeys step by step', () => {
		expect(sameSteps(['job', 'meeting'], ['job', 'meeting'])).toBe(true);
		expect(sameSteps(['meeting', 'job'], ['job', 'meeting'])).toBe(false);
		expect(sameSteps(['meeting'], ['job', 'meeting'])).toBe(false);
	});

	it('sums the journey up in one sentence', () => {
		expect(journeySummary(['job', 'meeting'])).toBe(
			'Recruiters select or create a job, then book a meeting.'
		);
		expect(journeySummary(['meeting'])).toBe('Recruiters can book a meeting right away.');
		expect(journeySummary([])).toBe(
			'Your Hire page offers nothing: recruiters are asked to reach out directly.'
		);
	});
});

describe("the visitor's journey", () => {
	it('opens the first step not done, and locks the ones after it', () => {
		expect(stepStates(journey([false, false]))).toEqual(['open', 'locked']);
		expect(stepStates(journey([true, false]))).toEqual(['done', 'open']);
		expect(stepStates(journey([true, true]))).toEqual(['done', 'done']);
		// A meeting booked before the job was closed: locked until another job is picked
		expect(stepStates(journey([false, true]))).toEqual(['open', 'locked']);
	});

	it('locks nothing for the owner', () => {
		expect(stepStates(journey([false, false], { own: true }))).toEqual(['open', 'open']);
		expect(activeStepIndex(journey([false, false], { own: true }))).toBe(1);
	});

	it('unfolds the step to do, else the last one', () => {
		expect(activeStepIndex(journey([false, false]))).toBe(0);
		expect(activeStepIndex(journey([true, false]))).toBe(1);
		expect(activeStepIndex(journey([true, true]))).toBe(1);
	});

	it('is the booking page alone when the journey is the meeting step only', () => {
		expect(isBookingOnly({ steps: [{ type: 'meeting', done: false }] })).toBe(true);
		expect(isBookingOnly(journey([false, false]))).toBe(false);
		expect(isBookingOnly({ steps: [] })).toBe(false);
	});

	it('says what the journey asks under the title', () => {
		expect(journeyIntro({ steps: [{ type: 'meeting', done: false }] }, 'Louis')).toBe(
			"Pick a time slot that suits you — you'll receive a calendar invitation by email."
		);
		expect(journeyIntro(journey([false, false]), 'Louis')).toBe(
			"Louis asks recruiters to complete one step first. Then pick a time slot: you'll receive a calendar invitation by email."
		);
		expect(journeyIntro({ steps: [] }, 'Louis')).toBe(
			'Louis does not take meeting requests online right now.'
		);
	});

	it('notes what each step asks, or what the visitor did there', () => {
		expect(stepNote(journey([false, false]), 0, 'open')).toBe(
			'Pick the job you are hiring for, or write it.'
		);
		expect(stepNote(journey([false, false]), 1, 'locked')).toBe('Complete the step above first.');
		expect(stepNote(journey([true, false], { job: JOB }), 0, 'done')).toBe('Staff Engineer · Acme');
		expect(stepNote(journey([true, false], { job: JOB }), 1, 'open')).toBe(
			'Pick a time slot that suits you.'
		);
		expect(stepNote(journey([true, true], { job: JOB }), 1, 'done')).toBe(
			'You booked a meeting. You can book another slot.'
		);
		expect(
			stepNote(journey([false, false], { job: { ...JOB, status: 'filled' } }), 0, 'open')
		).toBe('Staff Engineer is filled now: pick an open job description.');
		// The owner reads what each step asks of recruiters
		expect(stepNote(journey([false, false], { own: true }), 1, 'open')).toMatch(/Recruiters book/);
	});
});

describe('the job step', () => {
	const jobs = [
		{ _id: '1', title: 'Draft', status: 'draft' as const },
		{ _id: '2', title: 'Open A', status: 'open' as const },
		{ _id: '3', title: 'Closed', status: 'closed' as const },
		{ _id: '4', title: 'Open B', status: 'open' as const }
	];

	it('lists the open postings first, keeping the order of the API', () => {
		expect(sortJobChoices(jobs).map((job) => job._id)).toEqual(['2', '4', '1', '3']);
		expect(isPickable({ status: 'open' })).toBe(true);
		expect(isPickable({ status: 'on_hold' })).toBe(false);
	});

	it('selects the job asked for, else the one picked before, else the only open one', () => {
		expect(initialJobChoice(jobs, '4', '2')).toBe('4');
		expect(initialJobChoice(jobs, '1', '2')).toBe('2');
		expect(initialJobChoice(jobs, null, '3')).toBeNull();
		expect(initialJobChoice(jobs.slice(0, 3), null, null)).toBe('2');
		expect(initialJobChoice([], 'x', 'y')).toBeNull();
	});

	it('names a job with its company when it has one', () => {
		expect(jobLine(JOB)).toBe('Staff Engineer · Acme');
		expect(jobLine({ title: 'Staff Engineer' })).toBe('Staff Engineer');
	});

	it('says what a failed pick means, and what to load again', () => {
		expect(pickJobFailure(401, 'Unauthorized').kind).toBe('session-expired');
		expect(pickJobFailure(403, 'Create your recruiter space first')).toEqual({
			message: 'Create your recruiter space to pick a job.',
			kind: 'reload-jobs'
		});
		expect(pickJobFailure(403, 'You cannot pick a job for your own portfolio').kind).toBe('error');
		expect(pickJobFailure(403, 'Complete the earlier steps of the hiring journey first').kind).toBe(
			'reload-journey'
		);
		expect(pickJobFailure(404, 'Job posting not found').kind).toBe('reload-jobs');
		expect(pickJobFailure(404, 'Domain not found').kind).toBe('error');
		expect(pickJobFailure(409, 'Only an open job description can be picked').kind).toBe(
			'reload-jobs'
		);
		expect(pickJobFailure(409, 'This hiring journey does not ask for a job').kind).toBe(
			'reload-journey'
		);
		expect(pickJobFailure(503, new TypeError('Failed to fetch'))).toEqual({
			message: NETWORK_ERROR,
			kind: 'error'
		});
		expect(pickJobFailure(500, 'Internal Server Error').kind).toBe('error');
	});
});

describe('going back to the journey', () => {
	it('takes a portfolio name, normalised, and nothing else', () => {
		expect(journeyReturnDomain('Louis.Gentil')).toBe('louis.gentil');
		expect(journeyReturnDomain('https://evil.example.com')).toBeNull();
		expect(journeyReturnDomain('../admin')).toBeNull();
		expect(journeyReturnDomain('')).toBeNull();
		expect(journeyReturnDomain(null)).toBeNull();
	});

	it('takes a job id, and nothing else', () => {
		expect(requestedJobId('0123456789abcdef01234567')).toBe('0123456789abcdef01234567');
		expect(requestedJobId('nope')).toBeNull();
		expect(requestedJobId(null)).toBeNull();
	});
});
