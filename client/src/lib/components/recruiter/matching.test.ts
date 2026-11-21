import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { withLocale } from 'portfolio-common';
import { readMutualInterest, type RecruiterMutualInterest } from '#services/matching.ts';
import type { RecruiterJobDetail } from '#services/recruiter.ts';
import MatchingPanel from './MatchingPanel.svelte';
import RecruiterInterest from './RecruiterInterest.svelte';

// The recruiter's screens of matching outside the deck, as they render: the matching panel of a
// job description (where it stands with the reviewers, the switch) and a mutual interest in their
// list. Nothing shows while the posting carries no `matching` (MATCHING off); never a count of
// candidates, never a bare "match" (decision 11), no email promised.

/** The markup's text, as a reader gets it: tags dropped, spaces collapsed */
const textOf = (body: string) =>
	body
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

const JOB_ID = '65e2e0000000000000000101';
const NOW = '2026-11-20T10:00:00.000Z';

const job = (
	fields: Omit<Partial<RecruiterJobDetail>, 'matching'> & { matching?: unknown }
): RecruiterJobDetail =>
	({
		_id: JOB_ID,
		title: 'Staff Platform Engineer',
		company: 'E2E Matching Corp',
		description: 'Run the platform.',
		status: 'open',
		createdAt: new Date(NOW),
		updatedAt: new Date(NOW),
		publishedAt: new Date(NOW),
		location: { country: 'FR', city: 'Paris', workMode: 'hybrid' },
		contract: { type: 'cdi' },
		workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 35 },
		pay: { min: 60000, max: 75000, currency: 'EUR', period: 'year' },
		...fields
	}) as RecruiterJobDetail;

const noop = () => {};
const panel = (posting: RecruiterJobDetail) =>
	render(MatchingPanel, {
		props: {
			job: posting,
			userId: '65e2e0000000000000000001',
			onChange: noop,
			onReload: noop,
			onSessionExpired: noop,
			onTerms: noop,
			onGone: noop,
			onNoSpace: noop
		}
	}).body;

const review = (status: string, reason: string | null = null) => ({
	status,
	requestedAt: NOW,
	reviewedAt: status === 'pending' ? null : NOW,
	reason
});

describe('MatchingPanel', () => {
	it('shows nothing while the posting carries no matching (MATCHING off)', () => {
		expect(textOf(panel(job({})))).toBe('');
	});

	it('offers to propose an open job, saying a reviewer reads it first', () => {
		const html = panel(job({ matching: { enabledAt: null, review: null } }));
		const shown = textOf(html);
		expect(shown).toContain('Propose to candidates');
		expect(shown).toContain('Propose this job to candidates');
		expect(shown).toContain('A reviewer reads it before any candidate sees it.');
		expect(html).toContain('data-matching-panel="off"');
		// A job never proposed has no mutual interests to list
		expect(html).not.toContain('data-recruiter-matches');
	});

	it('cannot propose a job that is not open, and says why', () => {
		const html = panel(job({ status: 'draft', matching: { enabledAt: null, review: null } }));
		expect(textOf(html)).toContain('Open this job description to propose it.');
		expect(html).toMatch(/<input[^>]*disabled/);
	});

	it('says it is in review, proposed to nobody until then', () => {
		const html = panel(job({ matching: { enabledAt: NOW, review: review('pending') } }));
		const shown = textOf(html);
		expect(shown).toContain('In review');
		expect(shown).toContain('Until then it is proposed to nobody.');
		expect(shown).toContain('Filled, closed or back to draft, it stops being proposed');
		expect(html).toContain('data-recruiter-matches');
		expect(shown).not.toContain('Review candidates');
	});

	it('gives the reviewer’s reason as written, and the way to address it', () => {
		const reason = '<b>Say</b> what the job is & who it is for.';
		const html = panel(job({ matching: { enabledAt: NOW, review: review('rejected', reason) } }));
		const shown = textOf(html);
		expect(shown).toContain('Not accepted');
		expect(shown).toContain('A reviewer did not accept it for candidates. Their reason:');
		// Text, never markup
		expect(html).toContain('&lt;b>Say&lt;/b> what the job is &amp; who it is for.');
		expect(html).not.toContain('<b>Say</b>');
		expect(shown).toContain('once saved, it goes back for review');
		expect(html).toContain(`href="/recruiter/jobs/${JOB_ID}/edit"`);
		// Its terms are locked: a reason about them is answered by stopping it, or by a copy
		expect(shown).toContain('If the reason is about its terms, which are locked');
		expect(html).toContain(`href="/recruiter/jobs/new?duplicate=${JOB_ID}"`);
		expect(shown).toContain('Duplicate');
		// It still takes one of the places of the jobs proposed at once
		expect(shown).toContain('turning it off frees its place');
	});

	it('keeps an open job’s switch usable (never disabled but for a job that cannot be proposed)', () => {
		const html = panel(job({ matching: { enabledAt: NOW, review: review('approved') } }));
		expect(html).not.toMatch(/<input[^>]*disabled/);
	});

	it('says it is proposed, with the way to the candidates, never how many', () => {
		const html = panel(job({ matching: { enabledAt: NOW, review: review('approved') } }));
		const shown = textOf(html);
		expect(shown).toContain('Proposed to candidates');
		expect(shown).toContain('Candidates whose criteria it meets see it now.');
		expect(html).toContain(`href="/recruiter/jobs/${JOB_ID}/candidates"`);
		expect(shown).toContain('Review candidates');
		expect(shown).not.toMatch(/\d+ candidates?/i);
	});

	it('says an accepted job on hold is proposed to nobody', () => {
		const html = panel(
			job({ status: 'on_hold', matching: { enabledAt: NOW, review: review('approved') } })
		);
		expect(textOf(html)).toContain('It is proposed to nobody while it is on hold.');
		expect(html).toContain('data-matching-panel="paused"');
	});

	it('reads in French', () => {
		const shown = withLocale('fr', () =>
			textOf(panel(job({ matching: { enabledAt: NOW, review: review('pending') } })))
		);
		expect(shown).toContain('Proposer aux candidats');
		expect(shown).toContain('En relecture');
	});
});

describe('RecruiterInterest', () => {
	const answer = {
		_id: '65e2e00000000000000000d2',
		side: 'recruiter',
		matchedAt: NOW,
		changedAt: null,
		endedAt: null,
		endReason: null,
		seen: false,
		job: {
			_id: JOB_ID,
			title: 'Staff Platform Engineer',
			company: 'E2E Matching Corp',
			status: 'open'
		},
		candidate: {
			domain: 'e2e-match-card',
			title: null,
			name: 'Cleo',
			email: 'e2e.matchcard@example.com'
		}
	};
	const interest = readMutualInterest(answer, 'recruiter') as RecruiterMutualInterest;

	it('shows the portfolio revealed, its page for recruiters, the job and where it stands', () => {
		const html = render(RecruiterInterest, {
			props: { interest, fresh: true, onEnd: noop }
		}).body;
		const shown = textOf(html);
		expect(shown).toContain('Going on');
		expect(shown).toContain('New');
		expect(shown).toContain('e2e-match-card');
		expect(shown).toContain('Staff Platform Engineer');
		expect(shown).toContain('Both interested on 20 Nov 2026');
		expect(shown).toContain('go through the steps of their page for recruiters');
		expect(html).toContain('href="/e2e-match-card/hire"');
		expect(html).toContain('href="/e2e-match-card/experiences"');
		expect(html).toContain(`href="/recruiter/jobs/${JOB_ID}"`);
		expect(shown).toContain('End it');
		// Never a name or an email address, never a bare "match", no email promised
		for (const word of ['Cleo', 'e2e.matchcard@example.com', "It's a match"]) {
			expect(html).not.toContain(word);
		}
		expect(shown).not.toMatch(/\bemail\b/i);
	});

	it('says that a job on hold is held again once open, and offers no way to book meanwhile', () => {
		const onHold = readMutualInterest(
			{ ...answer, job: { ...answer.job, status: 'on_hold' } },
			'recruiter'
		) as RecruiterMutualInterest;
		const html = render(RecruiterInterest, { props: { interest: onHold, onEnd: noop } }).body;
		const shown = textOf(html);
		expect(shown).toContain('Going on');
		expect(shown).toContain(
			'Your job is on hold: their page for recruiters holds it again once you open it again'
		);
		expect(shown).not.toContain('go through the steps of their page for recruiters');
		expect(shown).not.toContain('Go to their page for recruiters');
		expect(html).not.toContain('href="/e2e-match-card/hire"');
		// The portfolio stays theirs to see, and the mutual interest theirs to end
		expect(html).toContain('href="/e2e-match-card/experiences"');
		expect(html).toMatch(/<button[^>]*data-end/);
		expect(
			withLocale('fr', () =>
				textOf(render(RecruiterInterest, { props: { interest: onHold, onEnd: noop } }).body)
			)
		).toContain('Votre offre est en pause');
	});

	it('names nothing before the portfolio is revealed, and offers no end once ended', () => {
		const ended = readMutualInterest(
			{ ...answer, candidate: null, endedAt: NOW, endReason: 'candidate' },
			'recruiter'
		) as RecruiterMutualInterest;
		const shown = textOf(
			render(RecruiterInterest, { props: { interest: ended, showJob: false, onEnd: noop } }).body
		);
		expect(shown).toContain('The candidate ended it');
		expect(shown).toContain('Portfolio not available');
		expect(shown).not.toContain('End it');
		expect(shown).not.toContain('Go to their page for recruiters');
		expect(shown).not.toContain('Staff Platform Engineer');
	});
});
