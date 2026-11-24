import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { LEGAL_VERSION, withLocale } from 'portfolio-common';
import { authenticationStore, sessionCheckedStore } from '#services/stores/index.ts';
import type { Journey, JourneyMatch, JourneyStep } from '#services/workflow.ts';
import JobMatchStep from './steps/JobMatchStep.svelte';
import JobStep from './steps/JobStep.svelte';
import MatchBanner from './MatchBanner.svelte';

// The Hire page for the recruiter of a mutual interest (matching): the banner above the steps, and
// the frozen score of the job match step, as the server renders them (the page itself renders them
// in the browser only: the journey's `match` is a signed-in visitor's)

/** What a reader gets: tags dropped, spaces collapsed */
const readable = (html: string) =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		// A tag closed before a full stop, a comma or a closing parenthesis left a space there
		.replace(/ ([.,)])/g, '$1')
		.trim();

const JOB_ID = 'a'.repeat(24);
const MATCH: JourneyMatch = {
	_id: 'c'.repeat(24),
	job: { _id: JOB_ID, title: 'Staff Engineer', company: 'Acme' },
	matchedAt: '2026-11-20T10:00:00.000Z'
};
const heldJob: JourneyStep = {
	id: 'job',
	type: 'job',
	status: 'succeeded',
	view: {
		job: {
			_id: JOB_ID,
			title: 'Staff Engineer',
			company: 'Acme',
			status: 'open',
			sharedAt: MATCH.matchedAt
		},
		matched: true
	}
};
const frozenView = {
	score: 92,
	minScore: 70,
	job: { _id: JOB_ID, title: 'Staff Engineer' },
	criteria: [{ criterion: 'pay', outcome: 'match' }],
	matched: true,
	frozenAt: MATCH.matchedAt
};
const gate = (note: 'pending' | 'succeeded'): Journey => ({
	steps: [
		{ id: 'note', type: 'note', status: note, config: { title: 'Before you book', text: 'Hi.' } },
		heldJob,
		{ id: 'job-match', type: 'job-match', status: 'succeeded', view: frozenView },
		{ id: 'meeting', type: 'meeting', status: 'pending' }
	],
	match: MATCH
});

const banner = (props: { match?: JourneyMatch; journey?: Journey; booking?: boolean } = {}) =>
	render(MatchBanner, {
		props: {
			match: props.match ?? MATCH,
			journey: props.journey ?? gate('pending'),
			ownerName: 'Louis',
			booking: props.booking ?? true,
			onEnded: () => {},
			onSignedOut: () => {},
			onTermsAccepted: () => {}
		}
	}).body;

/** The gate journey, its job step showing the job of the mutual interest without holding it */
const waiting = (jobStatus: 'open' | 'on_hold', note: 'pending' | 'succeeded' = 'succeeded') => {
	const journey = gate(note);
	const view = heldJob.view as { job: object };
	journey.steps[1] = {
		...heldJob,
		status: 'pending',
		view: { ...view, job: { ...view.job, status: jobStatus } }
	};
	return journey;
};

/** What the meeting's goal says happens once it is booked ("Before you start" says it too) */
const AFTER_BOOKING =
	"Once you book, you receive a calendar invitation by email, and the meeting goes into Louis's calendar: only then do they get your name and email address.";

/** What the banner says but that invitation: never a bare "match", never an email of Portfolio's */
const textWithoutInvitation = (text: string) => text.replace(AFTER_BOOKING, '');

describe('MatchBanner', () => {
	it('names the job they met over, since when, that the page holds it, and what is left', () => {
		const html = banner();
		const text = readable(html);
		expect(text).toContain("You're both interested");
		expect(text).toContain(
			'You and Louis are both interested in Staff Engineer · Acme (since 20 Nov 2026).'
		);
		expect(text).toContain(
			'This page holds that job for you: you cannot share another here while your mutual interest lasts.'
		);
		expect(text).toContain('Still to do before the meeting: read a note (“Before you book”).');
		// What happens once the meeting is booked, as "Before you start" says it: only then does the
		// owner get the recruiter's name and email address
		expect(text).toContain(AFTER_BOOKING);
		expect(text).toContain('End it');
		// The job's own page in the recruiter space, and a machine-readable date
		expect(html).toContain(`href="/recruiter/jobs/${JOB_ID}"`);
		expect(html).toContain('datetime="2026-11-20T10:00:00.000Z"');
		// Never a bare "match" (it names the score), never an email promised but the calendar's
		expect(textWithoutInvitation(text)).not.toMatch(/\bmatch(ed)?\b|e-?mail/i);
		expect(text).not.toContain('edited since');
	});

	it('says nothing of what follows the booking once the meeting is booked, nor of one nobody can book', () => {
		const booked = gate('succeeded');
		booked.steps[3] = { ...booked.steps[3], status: 'succeeded' };
		expect(readable(banner({ journey: booked }))).not.toContain('Once you book');
		expect(readable(banner({ booking: false }))).not.toContain('Once you book');
	});

	it('never says the page holds the job while its step does not hold it, but what brings it back', () => {
		// Open, but the terms in force not accepted: the note before it still to do
		const terms = readable(banner({ journey: waiting('open', 'pending') }));
		expect(terms).not.toContain('This page holds that job for you');
		expect(terms).not.toContain('The meeting invitation names that job.');
		expect(terms).toContain(
			'Accept the terms of use in force: this page holds your job again once you do, and takes no other job meanwhile.'
		);
		expect(terms).toContain('Still to do before the meeting: read a note (“Before you book”).');
		// On hold: open it again
		const onHold = readable(banner({ journey: waiting('on_hold') }));
		expect(onHold).not.toContain('This page holds that job for you');
		expect(onHold).toContain(
			'Your job is on hold now: this page holds it again once you open it again from its page, and takes no other job meanwhile.'
		);
		expect(onHold).not.toContain('time slot');
		expect(onHold).not.toContain('below says what is missing');
	});

	it('says when the job description was edited since, and that the owner keeps their version', () => {
		expect(readable(banner({ match: { ...MATCH, changed: true } }))).toContain(
			'The job description was edited since: Louis keeps the version they said yes to.'
		);
	});

	it('says that nothing else is asked once only the meeting is left', () => {
		expect(readable(banner({ journey: gate('succeeded') }))).toContain(
			'Nothing else is asked of you: pick a time slot below.'
		);
	});

	it('promises no meeting nobody can book', () => {
		const text = readable(banner({ booking: false }));
		expect(text).not.toContain('Still to do before the meeting');
		expect(text).not.toContain('time slot');
	});

	it('says the invitation names the job on a journey without a job step', () => {
		const journey: Journey = {
			steps: [{ id: 'meeting', type: 'meeting', status: 'pending' }],
			match: MATCH
		};
		const text = readable(banner({ journey }));
		expect(text).toContain('The meeting invitation names that job.');
		expect(text).not.toContain('This page holds that job');
		expect(readable(banner({ journey, booking: false }))).not.toContain('invitation');
	});

	it('says it in French', () => {
		const text = withLocale('fr', () => readable(banner())).replace(/[\u00a0\u202f]/g, ' ');
		expect(text).toContain('Intérêt réciproque');
		expect(text).toContain(
			"Depuis le 20 nov. 2026, l'intérêt est réciproque entre Louis et vous pour Staff Engineer · Acme."
		);
		expect(text).toContain('Y mettre fin');
	});
});

describe('the frozen score of the job match step', () => {
	const step = (view: object): JourneyStep => ({
		id: 'job-match',
		type: 'job-match',
		status: 'succeeded',
		config: { minScore: 70 },
		view
	});
	const score = (view: object) =>
		render(JobMatchStep, {
			props: {
				step: step(view),
				journey: gate('pending'),
				domainName: 'louis',
				ownerName: 'Louis',
				address: new URL('https://portfolio.example/louis/hire'),
				submit: async () => ({ ok: true as const }),
				reload: () => {},
				locked: () => {},
				succeeded: () => {},
				bookable: true,
				schedulesFound: () => {}
			}
		}).body;

	it('says it is the score when both became interested, which no longer changes', () => {
		const html = score(frozenView);
		const text = readable(html);
		expect(text).toContain('Score when you were both interested, on 20 Nov 2026');
		expect(text).toContain('This score no longer changes while your mutual interest lasts.');
		expect(text).toContain('92');
		expect(html).toContain('data-frozen-score');
	});

	it('offers nothing to change it, even under its minimum (which fails closed), but to end it', () => {
		const text = readable(score({ ...frozenView, score: 40, criteria: [] }));
		expect(text).not.toContain('Check again');
		expect(text).not.toContain('Duplicate this job description');
		expect(text).toContain(
			'This score, kept from when you were both interested, is under the minimum: to share another job here, end your mutual interest first.'
		);
		// Passed: nothing of it
		expect(readable(score(frozenView))).not.toContain('end your mutual interest');
		// A job scored as anyone's offers both under the minimum
		const scored = readable(score({ ...frozenView, score: 40, matched: undefined }));
		expect(scored).toContain('Check again');
		expect(scored).not.toContain('both interested');
	});

	it('says the score without its date when it is not known', () => {
		const text = readable(score({ ...frozenView, frozenAt: undefined }));
		expect(text).toContain('Score when you were both interested');
		expect(text).not.toContain('Score when you were both interested, on');
	});
});

describe('the job step holding the job of a mutual interest', () => {
	// The recruiter signed in, their session checked
	beforeAll(() => {
		authenticationStore.set({
			user: { _id: 'b'.repeat(24), recruiter: true, termsVersion: LEGAL_VERSION },
			expires: Math.floor(Date.now() / 1000) + 3600
		});
		sessionCheckedStore.set(true);
	});
	afterAll(() => {
		authenticationStore.set({ user: undefined, expires: undefined });
		sessionCheckedStore.set(false);
	});

	// English: a tag closed before a colon left a space there
	const jobStep = (view: object) =>
		readable(
			render(JobStep, {
				props: {
					step: { ...heldJob, view },
					journey: gate('succeeded'),
					domainName: 'louis',
					ownerName: 'Louis',
					address: new URL('https://portfolio.example/louis/hire'),
					submit: async () => ({ ok: true as const }),
					reload: () => {},
					locked: () => {},
					succeeded: () => {},
					bookable: true,
					schedulesFound: () => {}
				}
			}).body
		).replace(/ :/g, ':');

	it('says since when both are interested, and only that they are when the day does not read', () => {
		expect(jobStep(heldJob.view as object)).toContain(
			'You and Louis are both interested in Staff Engineer · Acme (since 20 Nov 2026): Louis reads the version they said yes to'
		);
		const view = heldJob.view as { job: object };
		const undated = jobStep({ ...view, job: { ...view.job, sharedAt: 'then' } });
		expect(undated).toContain(
			'You and Louis are both interested in Staff Engineer · Acme: Louis reads the version they said yes to'
		);
		expect(undated).not.toContain('since');
	});
});
