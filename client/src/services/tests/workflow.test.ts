import { describe, it, expect } from 'vitest';
import {
	DEFAULT_WORKFLOW_STEPS,
	WORKFLOW_LIMITS,
	parseWorkflow,
	stepManifest,
	type WorkflowStep,
	type WorkflowStepStatus
} from 'portfolio-common';
import { networkError } from '../recruiter';
import {
	activeStepIndex,
	addStep,
	addStepProblem,
	asksForAnotherJob,
	goalStepIndex,
	initialJobChoice,
	isBareJourney,
	isPickable,
	jobLine,
	jobMatch,
	jobMatchMinScore,
	jobMatchNote,
	jobMatchOutcomeText,
	jobMatchSettings,
	jobStepNote,
	journeyIntro,
	journeyReturnDomain,
	journeySummary,
	moveStep,
	noteContent,
	passesJobMatch,
	pickJobFailure,
	pickedJob,
	removeStep,
	requestedJob,
	requestedJobId,
	sameSteps,
	savedWorkflowProblem,
	sortJobChoices,
	stepName,
	stepNote,
	stepStates,
	submitFailure,
	withStepConfig,
	type Journey
} from '../workflow';
import { m } from '../workflow.messages';

const JOB = {
	_id: 'a'.repeat(24),
	title: 'Staff Engineer',
	company: 'Acme',
	status: 'open'
} as const;

const NOTE = { title: 'Before you book', text: 'Remote only.' };

const editorSteps = (...types: string[]): WorkflowStep[] =>
	types.reduce<WorkflowStep[]>((steps, type) => addStep(steps, type), []);
const ids = (steps: readonly { id: string }[]) => steps.map((step) => step.id);

/** A job step then a meeting step, with these statuses */
const journey = (
	statuses: [WorkflowStepStatus, WorkflowStepStatus],
	extra: Partial<Journey> = {}
): Journey => ({
	steps: [
		{ id: 'job', type: 'job', status: statuses[0] },
		{ id: 'meeting', type: 'meeting', status: statuses[1] }
	],
	...extra
});
const withStatuses = (...statuses: WorkflowStepStatus[]): Journey => ({
	steps: statuses.map((status, index) => ({ id: `note-${index}`, type: 'note', status }))
});

describe('the step types (portfolio-common)', () => {
	it('starts every portfolio with booking only', () => {
		expect(DEFAULT_WORKFLOW_STEPS).toEqual([{ id: 'meeting', type: 'meeting', config: {} }]);
		expect(parseWorkflow(DEFAULT_WORKFLOW_STEPS)).toMatchObject({ ok: true });
	});

	it('accepts an empty journey, and requirements before a step they open', () => {
		expect(parseWorkflow([])).toEqual({ ok: true, steps: [] });
		expect(
			parseWorkflow([
				{ id: 'job', type: 'job' },
				{ id: 'meeting', type: 'meeting' }
			])
		).toMatchObject({ ok: true });
	});

	it('names the step, and the setting, a journey is refused for', () => {
		expect(parseWorkflow([{ id: 'job', type: 'job' }])).toEqual({
			ok: false,
			problem: {
				message:
					'“Select or create a job” must come before a step it opens: add “Book a meeting” after it.',
				stepId: 'job'
			}
		});
		expect(
			parseWorkflow([
				{ id: 'note', type: 'note', config: { title: 'Read me', text: ' ' } },
				{ id: 'meeting', type: 'meeting' }
			])
		).toEqual({
			ok: false,
			problem: { message: 'Write the note recruiters will read.', stepId: 'note', field: 'text' }
		});
	});
});

describe("the owner's editor", () => {
	it('adds a step that only opens others before the step the journey leads to', () => {
		const steps = editorSteps('meeting', 'job', 'note');
		expect(steps.map((step) => step.type)).toEqual(['job', 'note', 'meeting']);
		expect(steps[1]).toEqual({ id: 'note', type: 'note', config: { title: '', text: '' } });
		// Without a step to lead to yet, and for a step the journey leads to: last
		expect(ids(editorSteps('job', 'note'))).toEqual(['job', 'note']);
		expect(ids(editorSteps('note', 'meeting'))).toEqual(['note', 'meeting']);
	});

	it('gives each step an id no other has, nor a step removed since the journey was saved', () => {
		expect(ids(editorSteps('note', 'note', 'note'))).toEqual(['note', 'note-2', 'note-3']);
		const saved = editorSteps('note', 'meeting');
		const emptied = removeStep(saved, 'note');
		expect(ids(addStep(emptied, 'note', saved))).toEqual(['note-2', 'meeting']);
		expect(ids(addStep(emptied, 'note'))).toEqual(['note', 'meeting']);
	});

	it('does not change the steps it is given', () => {
		const steps = editorSteps('job', 'meeting');
		const before = structuredClone(steps);
		addStep(steps, 'note');
		removeStep(steps, 'job');
		moveStep(steps, 'job', 1);
		withStepConfig(steps, 'job', { any: 1 });
		expect(steps).toEqual(before);
	});

	it('removes a step by its id', () => {
		const steps = editorSteps('note', 'note', 'meeting');
		expect(ids(removeStep(steps, 'note'))).toEqual(['note-2', 'meeting']);
		expect(ids(removeStep(steps, 'unknown'))).toEqual(['note', 'note-2', 'meeting']);
	});

	it('moves a step one place up or down, and leaves it at either end', () => {
		const steps = editorSteps('note', 'job', 'meeting');
		expect(ids(steps)).toEqual(['note', 'job', 'meeting']);
		expect(ids(moveStep(steps, 'job', -1))).toEqual(['job', 'note', 'meeting']);
		expect(ids(moveStep(steps, 'job', 1))).toEqual(['note', 'meeting', 'job']);
		expect(ids(moveStep(steps, 'note', -1))).toEqual(['note', 'job', 'meeting']);
		expect(ids(moveStep(steps, 'meeting', 1))).toEqual(['note', 'job', 'meeting']);
		expect(ids(moveStep(steps, 'unknown', 1))).toEqual(['note', 'job', 'meeting']);
		// The steps themselves are kept: the editor follows the one it moved
		expect(moveStep(steps, 'job', -1)[0]).toBe(steps[1]);
	});

	it('replaces the settings of one step', () => {
		const steps = withStepConfig(editorSteps('note', 'note', 'meeting'), 'note-2', NOTE);
		expect(steps.map((step) => step.config)).toEqual([{ title: '', text: '' }, NOTE, {}]);
	});

	it('says why a step type cannot be added', () => {
		const job = stepManifest('job')!;
		const note = stepManifest('note')!;
		expect(addStepProblem([], job)).toBeNull();
		expect(addStepProblem(editorSteps('job', 'meeting'), job)).toBe(
			'Already in your journey: it can be used only once.'
		);
		expect(addStepProblem(editorSteps('note', 'note', 'meeting'), note)).toBeNull();
		expect(addStepProblem([], { type: 'pair', max: 2 })).toBeNull();
		expect(addStepProblem([{ type: 'pair' }, { type: 'pair' }], { type: 'pair', max: 2 })).toBe(
			'Already 2 times in your journey.'
		);
		const full = Array.from({ length: WORKFLOW_LIMITS.steps }, () => ({ type: 'note' }));
		expect(addStepProblem(full, note)).toBe('A journey has at most 12 steps.');
		expect(addStepProblem(full.slice(1), note)).toBeNull();
	});

	it('compares journeys step by step, settings included', () => {
		const steps = withStepConfig(editorSteps('note', 'job', 'meeting'), 'note', NOTE);
		expect(sameSteps(steps, structuredClone(steps))).toBe(true);
		expect(
			sameSteps(steps, withStepConfig(steps, 'note', { text: NOTE.text, title: NOTE.title }))
		).toBe(true);
		expect(sameSteps(steps, moveStep(steps, 'job', -1))).toBe(false);
		expect(sameSteps(steps, removeStep(steps, 'note'))).toBe(false);
		expect(sameSteps(steps, withStepConfig(steps, 'note', { ...NOTE, text: 'Hybrid.' }))).toBe(
			false
		);
		expect(sameSteps(steps, withStepConfig(steps, 'note', { title: NOTE.title }))).toBe(false);
		expect(sameSteps([], [])).toBe(true);
	});

	it('names a step with its own name, else its type’s label', () => {
		expect(stepName({ type: 'job' })).toBe('Select or create a job');
		expect(stepName({ type: 'note' }, 'Before you book')).toBe('Before you book');
		expect(stepName({ type: 'note' }, '')).toBe('Read a note');
		expect(stepName({ type: 'removed-since' })).toBe('Unavailable step');
	});

	it('sums the journey up in one sentence', () => {
		const title = (step: { config?: unknown }) => noteContent(step.config).title || undefined;
		expect(journeySummary(editorSteps('job', 'meeting'))).toBe(
			'Recruiters select or create a job, then book a meeting.'
		);
		expect(journeySummary(editorSteps('meeting'))).toBe(
			'Recruiters can book a meeting right away.'
		);
		expect(journeySummary([])).toBe(
			'Your Hire page offers nothing: recruiters are asked to reach out directly.'
		);
		const steps = withStepConfig(editorSteps('note', 'note', 'job', 'meeting'), 'note', NOTE);
		expect(journeySummary(steps, title)).toBe(
			'Recruiters read a note (“Before you book”), read a note, select or create a job, then book a meeting.'
		);
	});

	it('finds the step and the setting the API refused', () => {
		const sent = [{ id: 'note' }, { id: 'note-2' }, { id: 'meeting' }];
		const body = (property: string) => ({
			type: 'validation',
			on: 'body',
			property,
			message: 'Give the note a title.'
		});
		expect(savedWorkflowProblem(body('steps.1.config.title'), sent)).toEqual({
			message: 'Give the note a title.',
			stepId: 'note-2',
			field: 'title'
		});
		expect(savedWorkflowProblem(body('steps.2'), sent)).toEqual({
			message: 'Give the note a title.',
			stepId: 'meeting'
		});
		expect(savedWorkflowProblem(body('steps'), sent)).toEqual({
			message: 'Give the note a title.'
		});
		// A step the page did not send: the message alone
		expect(savedWorkflowProblem(body('steps.7.config.title'), sent)).toEqual({
			message: 'Give the note a title.'
		});
		// Not about the steps (the request's shape, another error): nothing to show at a step
		expect(savedWorkflowProblem(body('/steps/0/id'), sent)).toBeNull();
		expect(savedWorkflowProblem('Unprocessable', sent)).toBeNull();
		expect(savedWorkflowProblem(null, sent)).toBeNull();
	});
});

describe("the visitor's journey", () => {
	it('opens the first step that did not succeed, and locks the ones after it', () => {
		expect(stepStates(journey(['pending', 'pending']))).toEqual(['open', 'locked']);
		expect(stepStates(journey(['succeeded', 'pending']))).toEqual(['done', 'open']);
		expect(stepStates(journey(['succeeded', 'succeeded']))).toEqual(['done', 'done']);
		// A meeting booked before the job was closed: locked until another job is picked
		expect(stepStates(journey(['pending', 'succeeded']))).toEqual(['open', 'locked']);
		expect(stepStates(withStatuses('succeeded', 'pending', 'succeeded', 'pending'))).toEqual([
			'done',
			'open',
			'locked',
			'locked'
		]);
		expect(stepStates({ steps: [] })).toEqual([]);
	});

	it('stops at a step that was not passed', () => {
		const stopped = withStatuses('succeeded', 'failed', 'pending');
		expect(stepStates(stopped)).toEqual(['done', 'failed', 'locked']);
		expect(activeStepIndex(stopped)).toBe(1);
		expect(stepNote(stopped, 1, 'failed', () => 'unused')).toBe('Not passed.');
		// A type that can fail says why
		expect(
			stepNote(
				stopped,
				1,
				'failed',
				() => 'unused',
				(step) => `${step.id} needs more`
			)
		).toBe('note-1 needs more');
	});

	it('locks nothing for the owner, who lands on the step the journey leads to', () => {
		const own = journey(['pending', 'pending'], { own: true });
		expect(stepStates(own)).toEqual(['open', 'open']);
		expect(activeStepIndex(own)).toBe(1);
		expect(activeStepIndex({ own: true, steps: [] })).toBe(-1);
	});

	it('unfolds the step to do, else the last one', () => {
		expect(activeStepIndex(journey(['pending', 'pending']))).toBe(0);
		expect(activeStepIndex(journey(['succeeded', 'pending']))).toBe(1);
		expect(activeStepIndex(journey(['succeeded', 'succeeded']))).toBe(1);
		expect(activeStepIndex(withStatuses('succeeded', 'pending', 'succeeded'))).toBe(1);
	});

	it('finds the step a journey leads to', () => {
		expect(goalStepIndex(journey(['pending', 'pending']).steps)).toBe(1);
		expect(goalStepIndex(DEFAULT_WORKFLOW_STEPS)).toBe(0);
		expect(goalStepIndex([{ type: 'note' }, { type: 'removed-since' }])).toBe(-1);
		expect(goalStepIndex([])).toBe(-1);
	});

	it('is that step alone when the journey is nothing else', () => {
		const meeting = { id: 'meeting', type: 'meeting', status: 'pending' } as const;
		expect(isBareJourney({ steps: [meeting] })).toBe(true);
		expect(isBareJourney({ steps: [meeting], own: true })).toBe(true);
		expect(isBareJourney(journey(['pending', 'pending']))).toBe(false);
		expect(isBareJourney({ steps: [{ ...meeting, type: 'removed-since' }] })).toBe(false);
		expect(isBareJourney({ steps: [] })).toBe(false);
	});

	it('says what the journey asks under the title', () => {
		const texts = { alone: 'Pick a time slot.', after: 'Then pick a time slot.' };
		expect(journeyIntro('Louis', { before: 0, ...texts })).toBe('Pick a time slot.');
		expect(journeyIntro('Louis', { before: 1, ...texts })).toBe(
			'Louis asks recruiters to complete one step first. Then pick a time slot.'
		);
		expect(journeyIntro('Louis', { before: 3, ...texts })).toBe(
			'Louis asks recruiters to complete 3 steps first. Then pick a time slot.'
		);
		expect(journeyIntro('Louis', undefined)).toBe(
			'Louis does not take meeting requests online right now.'
		);
	});

	it('notes what each step asks, or what the visitor did there', () => {
		const describe = (step: { type: string }, state: string) => `${step.type} is ${state}`;
		expect(stepNote(journey(['pending', 'pending']), 0, 'open', describe)).toBe('job is open');
		expect(stepNote(journey(['succeeded', 'pending']), 0, 'done', describe)).toBe('job is done');
		expect(stepNote(journey(['pending', 'pending']), 1, 'locked', describe)).toBe(
			'Complete the step above first.'
		);
		expect(stepNote(withStatuses('pending', 'pending', 'pending'), 2, 'locked', describe)).toBe(
			'Complete the steps above first.'
		);
		// The owner reads what each step asks of recruiters
		expect(stepNote(journey(['pending', 'pending'], { own: true }), 1, 'open', describe)).toMatch(
			/^Recruiters book a slot/
		);
		// A step type this version does not show
		expect(stepNote(journey(['pending', 'pending']), 0, 'open', undefined)).toBe(m.stepUnavailable);
		expect(stepNote(journey(['pending', 'pending'], { own: true }), 0, 'open', undefined)).toBe(
			m.stepUnavailable
		);
	});

	it('says what a refused submit means, whatever the step', () => {
		expect(submitFailure(401, 'Unauthorized').kind).toBe('signed-out');
		expect(submitFailure(403, 'Complete the earlier steps of the hiring journey first').kind).toBe(
			'locked'
		);
		expect(submitFailure(403, 'You cannot go through your own hiring journey').kind).toBe('error');
		expect(submitFailure(404, 'Domain not found').kind).toBe('error');
		expect(submitFailure(409, 'This hiring journey changed: reload the page').kind).toBe('changed');
		expect(submitFailure(409, 'Nothing can be submitted on this step').kind).toBe('changed');
		expect(submitFailure(500, 'Internal Server Error')).toEqual({
			message: 'Could not save this step. Try again in a moment.',
			kind: 'error'
		});
		// What a step's type refused is not the journey's refusal: shown as the API says it
		expect(submitFailure(409, 'Already answered')).toEqual({
			message: 'Already answered',
			kind: 'error'
		});
		expect(submitFailure(403, 'Create your recruiter space first').kind).toBe('error');
		expect(submitFailure(404, 'Job posting not found').message).toBe('Job posting not found');
		expect(
			submitFailure(422, {
				type: 'validation',
				on: 'body',
				property: 'input.acknowledged',
				message: 'Confirm that you have read the note'
			})
		).toEqual({ message: 'Confirm that you have read the note', kind: 'error' });
		expect(submitFailure(503, new TypeError('Failed to fetch'))).toEqual({
			message: networkError(),
			kind: 'error'
		});
		expect(submitFailure(undefined, new TypeError('Failed to fetch')).message).toBe(networkError());
	});
});

describe('the job step', () => {
	const jobs = [
		{ _id: '1', title: 'Draft', status: 'draft' as const },
		{ _id: '2', title: 'Open A', status: 'open' as const },
		{ _id: '3', title: 'Closed', status: 'closed' as const },
		{ _id: '4', title: 'Open B', status: 'open' as const }
	];

	it('reads the job picked from what the step tells the visitor', () => {
		expect(pickedJob({ job: JOB })).toEqual(JOB);
		expect(pickedJob({ job: { _id: JOB._id, title: 'Staff Engineer', status: 'filled' } })).toEqual(
			{ _id: JOB._id, title: 'Staff Engineer', status: 'filled' }
		);
		expect(pickedJob(undefined)).toBeUndefined();
		expect(pickedJob({})).toBeUndefined();
		expect(pickedJob({ job: { ...JOB, status: 'unheard-of' } })).toBeUndefined();
		expect(pickedJob({ job: { title: 'No id', status: 'open' } })).toBeUndefined();
		expect(pickedJob('job')).toBeUndefined();
	});

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

	it('notes what the step asks, the job picked, or that it is not open anymore', () => {
		expect(jobStepNote(undefined, 'open')).toBe('Pick the job you are hiring for, or write it.');
		expect(jobStepNote({ job: JOB }, 'done')).toBe('Staff Engineer · Acme');
		expect(jobStepNote({ job: { ...JOB, status: 'filled' } }, 'open')).toBe(
			'Staff Engineer is filled now: pick an open job description.'
		);
	});

	it('says what a failed pick means, and what to load again', () => {
		expect(pickJobFailure(401, 'Unauthorized')).toEqual({
			message: 'Your session expired. Sign in again to pick a job.',
			kind: 'signed-out'
		});
		expect(pickJobFailure(403, 'Create your recruiter space first')).toEqual({
			message: 'Create your recruiter space to pick a job.',
			kind: 'reload-jobs'
		});
		expect(pickJobFailure(403, 'You cannot go through your own hiring journey').kind).toBe('error');
		expect(pickJobFailure(403, 'Complete the earlier steps of the hiring journey first').kind).toBe(
			'locked'
		);
		expect(pickJobFailure(404, 'Job posting not found').kind).toBe('reload-jobs');
		expect(pickJobFailure(404, 'Domain not found').kind).toBe('error');
		expect(pickJobFailure(409, 'Only an open job description can be picked').kind).toBe(
			'reload-jobs'
		);
		expect(pickJobFailure(409, 'This hiring journey changed: reload the page').kind).toBe(
			'changed'
		);
		expect(
			pickJobFailure(422, { type: 'validation', property: 'consent', message: 'Accept the terms' })
		).toEqual({ message: 'Accept the terms of use in force to pick a job.', kind: 'terms' });
		expect(pickJobFailure(422, { type: 'validation', property: 'input.jobId' }).kind).toBe('error');
		expect(pickJobFailure(503, new TypeError('Failed to fetch'))).toEqual({
			message: networkError(),
			kind: 'error'
		});
		expect(pickJobFailure(500, 'Internal Server Error')).toEqual({
			message: 'Could not pick this job. Try again in a moment.',
			kind: 'error'
		});
	});
});

describe('the job match step', () => {
	const view = { score: 54, minScore: 70, job: { _id: JOB._id, title: JOB.title } };

	it('goes after the job step it scores, and cannot be saved without one before it', () => {
		const steps = editorSteps('meeting', 'job', 'job-match');
		expect(steps.map((step) => step.type)).toEqual(['job', 'job-match', 'meeting']);
		expect(steps[1].config).toEqual({ minScore: 70, showDetails: false });
		expect(parseWorkflow(steps).ok).toBe(true);
		expect(parseWorkflow(moveStep(steps, 'job-match', -1))).toEqual({
			ok: false,
			problem: {
				message:
					'“Match the perfect job” works on what recruiters did in “Select or create a job”: move it below that step.',
				stepId: 'job-match'
			}
		});
		expect(parseWorkflow(editorSteps('meeting', 'job-match'))).toMatchObject({
			ok: false,
			problem: { message: expect.stringContaining('add that step before it'), stepId: 'job-match' }
		});
		expect(parseWorkflow(withStepConfig(steps, 'job-match', { minScore: 101 }))).toMatchObject({
			ok: false,
			problem: { stepId: 'job-match', field: 'minScore' }
		});
		expect(journeySummary(steps)).toBe(
			'Recruiters select or create a job, match the perfect job, then book a meeting.'
		);
	});

	it('reads the score from the view, whatever the view holds', () => {
		expect(jobMatch(view)).toEqual(view);
		expect(
			jobMatch({
				...view,
				other: true,
				criteria: [
					{ criterion: 'pay', outcome: 'partial' },
					{ criterion: 'seniority', outcome: 'miss', notStated: true },
					{ criterion: 'contractTypes', outcome: 'miss', dealBreaker: true, importance: 5 },
					{ criterion: 'salary', outcome: 'match' },
					{ criterion: 'travel', outcome: 'perfect' },
					null,
					'pay'
				]
			})
		).toEqual({
			...view,
			criteria: [
				{ criterion: 'pay', outcome: 'partial', notStated: false, dealBreaker: false },
				{ criterion: 'seniority', outcome: 'miss', notStated: true, dealBreaker: false },
				{ criterion: 'contractTypes', outcome: 'miss', notStated: false, dealBreaker: true }
			]
		});
		// The service to credit for public transport: one this page knows, or none
		expect(jobMatch({ ...view, transit: 'here' })).toEqual({ ...view, transit: 'here' });
		expect(jobMatch({ ...view, transit: 'transitous' })?.transit).toBe('transitous');
		expect(jobMatch({ ...view, transit: 'google' })).toEqual(view);
		for (const bad of [
			undefined,
			null,
			'54',
			{},
			{ ...view, score: '54' },
			{ ...view, score: 101 },
			{ ...view, score: 54.5 },
			{ ...view, minScore: -1 },
			{ ...view, job: undefined },
			{ ...view, job: { _id: JOB._id } }
		]) {
			expect(jobMatch(bad)).toBeUndefined();
		}
	});

	it('says the score, and the one needed when it is not reached', () => {
		expect(passesJobMatch({ ...view, score: 70 })).toBe(true);
		expect(passesJobMatch(view)).toBe(false);
		expect(jobMatchNote({ view: { ...view, score: 82 } })).toBe(
			'Staff Engineer scores 82 out of 100.'
		);
		expect(jobMatchNote({ view })).toBe(
			'Staff Engineer scores 54 out of 100: at least 70 is needed.'
		);
		// No job scored yet: what the step asks, with the minimum visitors are told
		expect(jobMatchNote({ config: { minScore: 60 } })).toBe(
			'The job you picked is scored out of 100: at least 60 is needed.'
		);
		expect(jobMatchNote({})).toBe('The job you picked is scored out of 100.');
		expect(jobMatchMinScore({ minScore: 0 })).toBe(0);
		expect(jobMatchMinScore({ minScore: '70' })).toBeUndefined();
		expect(jobMatchMinScore(undefined)).toBeUndefined();
	});

	it('words the outcome of each criterion', () => {
		const entry = { criterion: 'pay', notStated: false, dealBreaker: false } as const;
		expect(jobMatchOutcomeText({ ...entry, outcome: 'match' })).toBe('Matches');
		expect(jobMatchOutcomeText({ ...entry, outcome: 'partial' })).toBe('Partly matches');
		expect(jobMatchOutcomeText({ ...entry, outcome: 'miss' })).toBe('Does not match');
		expect(jobMatchOutcomeText({ ...entry, outcome: 'miss', notStated: true })).toBe(
			'Not stated in your job description'
		);
		// A travel time that could not be computed: the criterion is left out of the score
		expect(jobMatchOutcomeText({ ...entry, criterion: 'commute', outcome: 'unknown' })).toBe(
			'Could not be computed right now: not counted'
		);
		expect(
			jobMatch({ ...view, criteria: [{ criterion: 'commute', outcome: 'unknown' }] })?.criteria
		).toEqual([{ criterion: 'commute', outcome: 'unknown', notStated: false, dealBreaker: false }]);
	});

	it("reads the step's settings for its form, keeping what was typed", () => {
		expect(jobMatchSettings({ minScore: 60, showDetails: true })).toEqual({
			minScore: 60,
			showDetails: true
		});
		// Emptied, or not a score: kept as it is, for the rules to refuse it
		expect(jobMatchSettings({ minScore: null, showDetails: 'yes' })).toEqual({
			minScore: null,
			showDetails: false
		});
		expect(jobMatchSettings({})).toEqual({ minScore: 70, showDetails: false });
		expect(jobMatchSettings('none')).toEqual({ minScore: 70, showDetails: false });
	});
});

describe('the note step', () => {
	it('reads the title and the text of a note, whatever its settings hold', () => {
		expect(noteContent(NOTE)).toEqual(NOTE);
		expect(noteContent({ title: 'Only a title' })).toEqual({ title: 'Only a title', text: '' });
		expect(noteContent({ title: 3, text: ['a'] })).toEqual({ title: '', text: '' });
		expect(noteContent(undefined)).toEqual({ title: '', text: '' });
		expect(noteContent('note')).toEqual({ title: '', text: '' });
	});
});

describe('going back to the journey', () => {
	const hire = (query = '') => new URL(`https://portfolio.example/louis.gentil/hire${query}`);
	const OTHER = 'b'.repeat(24);

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

	it('reads the job an address asks for', () => {
		expect(requestedJob(hire(`?job=${JOB._id}`))).toBe(JOB._id);
		expect(requestedJob(hire('?job=nope'))).toBeNull();
		expect(requestedJob(hire())).toBeNull();
	});

	it('shows the job step for a job other than the one picked', () => {
		expect(asksForAnotherJob(undefined, hire(`?job=${OTHER}`))).toBe(true);
		expect(asksForAnotherJob({ job: JOB }, hire(`?job=${OTHER}`))).toBe(true);
		expect(asksForAnotherJob({ job: JOB }, hire(`?job=${JOB._id}`))).toBe(false);
		expect(asksForAnotherJob({ job: JOB }, hire())).toBe(false);
		expect(asksForAnotherJob(undefined, hire('?job=nope'))).toBe(false);
	});
});
