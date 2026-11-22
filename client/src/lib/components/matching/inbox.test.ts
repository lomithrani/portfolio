import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { withLocale } from 'portfolio-common';
import { readMutualInterest, type CandidateMutualInterest } from '#services/matching.ts';
import { readJobViewAccess, type SharedMutualInterest } from '#services/jobView.ts';
import CandidateInterest from './CandidateInterest.svelte';
import FeedAnswer from './FeedAnswer.svelte';
import SharedInterest from './SharedInterest.svelte';

// The candidate's screens of matching outside the deck, as they render: a mutual interest in their
// list, a job proposed to them answered on its private page, a mutual interest on that page. Never
// a bare "match" (decision 11), nothing of who the recruiter is (decision 17), no email promised

/** The markup's text, as a reader gets it: tags dropped, spaces collapsed */
const textOf = (body: string) =>
	body
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

const JOB_ID = '65e2e0000000000000000102';

/** A mutual interest as GET /matches answers it, with what a careless API could add */
const answer = {
	_id: '65e2e00000000000000000d1',
	side: 'candidate',
	matchedAt: '2026-11-20T10:00:00.000Z',
	changedAt: '2026-11-21T08:00:00.000Z',
	endedAt: null,
	endReason: null,
	seen: false,
	job: {
		_id: JOB_ID,
		status: 'open',
		title: 'Senior Data Engineer',
		company: 'E2E Matching Corp',
		description: 'Run the platform.',
		recruiter: '65e2e0000000000000000001',
		recruiterEmail: 'boss@acme.example'
	},
	score: 92,
	minScore: 70,
	criteria: [{ criterion: 'pay', outcome: 'match' }]
};

const NEVER = [
	'boss@acme.example',
	'acme.example',
	'65e2e0000000000000000001',
	'match!',
	"It's a match"
];

describe('CandidateInterest', () => {
	const interest = readMutualInterest(answer, 'candidate') as CandidateMutualInterest;

	it('shows the job they said yes to, where it stands, their score then and what comes next', () => {
		const shown = textOf(
			render(CandidateInterest, { props: { interest, fresh: true, onEnd: () => {} } }).body
		);
		expect(shown).toContain('Going on');
		expect(shown).toContain('New');
		expect(shown).toContain('Senior Data Engineer');
		expect(shown).toContain('E2E Matching Corp');
		expect(shown).toContain('Both interested on 20 Nov 2026');
		expect(shown).toContain(
			'Scored 92 out of 100 against your criteria then (your minimum score: 70)'
		);
		expect(shown).toContain(
			'The job description was edited since: you keep the version you said yes to.'
		);
		// Said once above the list (the view's intro), never again on each of them
		expect(shown).not.toContain('To book a meeting with you');
		expect(shown).toContain('Open the job');
		expect(shown).toContain('End it');
		const html = render(CandidateInterest, { props: { interest, onEnd: () => {} } }).body;
		expect(html).toContain(`href="/opportunities/${JOB_ID}"`);
		// Each item's link and button named with its job: told apart in a list of links, by voice
		expect(html).toContain('aria-label="Open the job: Senior Data Engineer"');
		expect(html).toContain('aria-label="End it: Senior Data Engineer"');
		for (const word of NEVER) expect(html).not.toContain(word);
		expect(shown).not.toMatch(/\bemail\b/i);
	});

	it('says who ended it, offers no end once ended, and names no job whose version is gone', () => {
		const ended = readMutualInterest(
			{ ...answer, endedAt: '2026-11-21T10:00:00.000Z', endReason: 'recruiter', job: null },
			'candidate'
		) as CandidateMutualInterest;
		const shown = textOf(
			render(CandidateInterest, { props: { interest: ended, onEnd: () => {} } }).body
		);
		expect(shown).toContain('The recruiter ended it');
		expect(shown).toContain('A job whose version can no longer be shown');
		expect(shown).not.toContain('End it');
		expect(shown).not.toContain('Open the job');
		expect(shown).not.toContain('To book a meeting');
	});

	it('reads in French', () => {
		const shown = withLocale('fr', () =>
			textOf(render(CandidateInterest, { props: { interest, onEnd: () => {} } }).body)
		);
		expect(shown).toContain('En cours');
		expect(shown).toContain('Intérêt réciproque le');
		expect(shown).toContain('Notée 92 sur 100 selon vos critères');
		expect(shown).toContain('Y mettre fin');
	});
});

describe('FeedAnswer', () => {
	const score = {
		score: 86,
		minScore: 70,
		criteria: [
			{ criterion: 'pay' as const, outcome: 'match' as const, dealBreaker: false, notStated: false }
		]
	};

	it('asks for an answer, with the score and the recruiter’s interest, never who they are', () => {
		const html = render(FeedAnswer, {
			props: { jobId: JOB_ID, score, interested: true, decision: null, onChange: () => {} }
		}).body;
		const shown = textOf(html);
		expect(shown).toContain('Proposed to you');
		expect(shown).toContain('Its recruiter is interested in you');
		expect(shown).toContain('86');
		expect(shown).toContain('Your minimum score: 70');
		expect(shown).toContain('Does this job interest you? If it does, its recruiter sees it');
		expect(shown).toContain('Pass');
		expect(shown).toContain('Interested');
		// Nothing to undo before an answer given here
		expect(shown).not.toContain('Undo');
		expect(html).toContain('aria-live="polite"');
		// Its heading takes the focus once the page read the job again (headingId)
		expect(
			render(FeedAnswer, {
				props: {
					jobId: JOB_ID,
					score,
					interested: false,
					decision: null,
					headingId: 'feed-heading',
					onChange: () => {}
				}
			}).body
		).toMatch(/<h2 id="feed-heading" tabindex="-1"/);
	});

	it('says the answer given, pressed, and keeps both answers where they are to change it', () => {
		const rendered = (decision: 'interested' | 'pass' | null) =>
			render(FeedAnswer, {
				props: { jobId: JOB_ID, score: null, interested: false, decision, onChange: () => {} }
			}).body;
		/** The buttons' texts in order, and the one pressed */
		const buttons = (html: string) =>
			[...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attributes, body]) => ({
				text: textOf(body),
				pressed: /aria-pressed="true"/.test(attributes)
			}));
		const interested = rendered('interested');
		expect(textOf(interested)).toContain('This job interests you: its recruiter sees it.');
		// The second click of a double click lands on the answer just given, never on the other
		expect(buttons(interested)).toEqual([
			{ text: 'Pass', pressed: false },
			{ text: 'Interested', pressed: true }
		]);
		const passed = rendered('pass');
		expect(textOf(passed)).toContain('You passed this job.');
		expect(buttons(passed)).toEqual([
			{ text: 'Pass', pressed: true },
			{ text: 'Interested', pressed: false }
		]);
		expect(buttons(rendered(null)).map((button) => button.pressed)).toEqual([false, false]);
	});

	it('reads in French', () => {
		const shown = withLocale('fr', () =>
			textOf(
				render(FeedAnswer, {
					props: { jobId: JOB_ID, score, interested: false, decision: null, onChange: () => {} }
				}).body
			)
		);
		expect(shown).toContain('Une offre qui vous est proposée');
		expect(shown).toContain("Ça m'intéresse");
		expect(shown).toContain('Passer');
	});
});

describe('SharedInterest', () => {
	const read = (match: Record<string, unknown>) =>
		(readJobViewAccess({ access: 'match', match }) as { interest: SharedMutualInterest }).interest;

	it('says both are interested, since when, how a meeting is booked, and offers to end it', () => {
		const shown = textOf(
			render(SharedInterest, {
				props: {
					interest: read({ _id: answer._id, matchedAt: answer.matchedAt, changedAt: null }),
					onChange: () => {}
				}
			}).body
		);
		expect(shown).toContain("You're both interested");
		expect(shown).not.toContain('Mutual interest ended');
		expect(shown).toContain('Going on');
		expect(shown).toContain('Both interested on 20 Nov 2026');
		expect(shown).toContain('To book a meeting with you, its recruiter goes through the steps');
		expect(shown).toContain('End it');
		expect(shown).not.toMatch(/\bemail\b/i);
	});

	it('says it ended, and that the job left matching', () => {
		const shown = textOf(
			render(SharedInterest, {
				props: {
					interest: read({
						_id: answer._id,
						matchedAt: answer.matchedAt,
						endedAt: '2026-11-21T10:00:00.000Z',
						endReason: 'job_closed'
					}),
					onChange: () => {}
				}
			}).body
		);
		expect(shown).toContain('Ended: the job is no longer open');
		expect(shown).not.toContain('End it');
		// Headed as what it is now, never "You're both interested" above an ended state
		expect(shown).toContain('Mutual interest ended');
		expect(shown).not.toContain("You're both interested");
		expect(
			withLocale('fr', () =>
				textOf(
					render(SharedInterest, {
						props: {
							interest: read({
								_id: answer._id,
								matchedAt: answer.matchedAt,
								endedAt: '2026-11-21T10:00:00.000Z',
								endReason: 'candidate'
							}),
							onChange: () => {}
						}
					}).body
				)
			)
		).toContain('Intérêt réciproque terminé');
	});
});
