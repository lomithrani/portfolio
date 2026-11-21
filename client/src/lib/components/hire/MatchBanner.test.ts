import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { withLocale } from 'portfolio-common';
import type { Journey, JourneyMatch, JourneyStep } from '#services/workflow.ts';
import JobMatchStep from './steps/JobMatchStep.svelte';
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
		// A tag closed before a full stop or a comma left a space there
		.replace(/ ([.,])/g, '$1')
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
			onSignedOut: () => {}
		}
	}).body;

describe('MatchBanner', () => {
	it('names the job they met over, since when, that the page holds it, and what is left', () => {
		const html = banner();
		const text = readable(html);
		expect(text).toContain("You're both interested");
		expect(text).toContain(
			'You and Louis have both been interested in Staff Engineer · Acme since 20 Nov 2026.'
		);
		expect(text).toContain(
			'This page holds that job for you: you cannot share another here while your mutual interest lasts.'
		);
		expect(text).toContain('Still to do before the meeting: read a note (“Before you book”).');
		expect(text).toContain('End it');
		// The job's own page in the recruiter space, and a machine-readable date
		expect(html).toContain(`href="/recruiter/jobs/${JOB_ID}"`);
		expect(html).toContain('datetime="2026-11-20T10:00:00.000Z"');
		// Never a bare "match" (it names the score), never an email promised
		expect(text).not.toMatch(/\bmatch(ed)?\b|e-?mail/i);
		expect(text).not.toContain('edited since');
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

	it('offers nothing to change it, even under its minimum (which fails closed)', () => {
		const text = readable(score({ ...frozenView, score: 40, criteria: [] }));
		expect(text).not.toContain('Check again');
		expect(text).not.toContain('Duplicate this job description');
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
