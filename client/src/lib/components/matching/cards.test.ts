import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import { withLocale } from 'portfolio-common';
import {
	readAnonymousCard,
	readCardOutcomes,
	readMutualInterest,
	readOpportunity,
	type AnonymousCard,
	type MutualInterest,
	type Opportunity
} from '#services/matching.ts';
import { jobMatch } from '#services/workflow.ts';
import CandidateCard from './CandidateCard.svelte';
import CriterionOutcomes from './CriterionOutcomes.svelte';
import MatchDeck from './MatchDeck.svelte';
import MutualInterestPanel from './MutualInterestPanel.svelte';
import OpportunityCard from './OpportunityCard.svelte';

// The cards of matching as they render, from what the readers keep of the API's answers: what a
// recruiter reads of a candidate (never who they are), what a candidate reads of a job (never who
// posted it), and the moment both are interested (never a bare "match")

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

/** An answer holding what a card must never show, as a careless API could send it */
const LEAKY_CARD = {
	headline: 'Platform engineer, distributed systems',
	experienceMonths: 75,
	roles: [
		{ title: 'Staff engineer', months: 26, current: true, company: 'Globex', city: 'Lyon' },
		{ title: 'Backend engineer', months: 49, current: false, start: '2019-01-01' }
	],
	skills: [
		{ name: 'Kafka', months: 40, project: 'Secret billing revamp' },
		{ name: 'Go', months: null }
	],
	name: 'Jane Doe',
	domain: 'jane-doe',
	email: 'jane.doe@example.com',
	score: 87
};

const NEVER_ON_A_CARD = [
	'Globex',
	'Lyon',
	'2019',
	'Secret billing',
	'Jane',
	'jane-doe',
	'example.com',
	'87',
	'Commute',
	'Cities'
];

describe('CandidateCard', () => {
	const card = readAnonymousCard(LEAKY_CARD) as AnonymousCard;
	const outcomes = readCardOutcomes([
		{ criterion: 'pay', outcome: 'partial' },
		{ criterion: 'seniority', outcome: 'miss', notStated: true },
		{ criterion: 'commute', outcome: 'match' },
		{ criterion: 'cities', outcome: 'match' },
		{ criterion: 'contractTypes', outcome: 'miss', dealBreaker: true }
	]);

	it('shows the headline, the experience, the roles and the skills with their time', () => {
		const shown = textOf(
			render(CandidateCard, { props: { card, outcomes, interested: true, headingId: 'top' } }).body
		);
		expect(shown).toContain('Interested in your job');
		expect(shown).toContain('Platform engineer, distributed systems');
		expect(shown).toContain('6 years 3 months of professional experience');
		expect(shown).toContain('Staff engineer 2 years 2 months Now');
		expect(shown).toContain('Backend engineer 4 years 1 month');
		expect(shown).toContain('Kafka, 3 years 4 months');
		expect(shown).toContain('Go');
		expect(shown).toContain("Your job reaches this candidate's minimum score.");
		expect(shown).toContain('Pay · Partly matches');
		expect(shown).toContain('Seniority · Not stated in your job description');
		expect(shown).toContain('Anonymous until you are both interested');
	});

	it('never shows a name, an address, a company, a place, a date, a score or the commute', () => {
		// Its markup, attributes included, the icons' drawings aside
		const html = render(CandidateCard, {
			props: { card, outcomes, interested: true }
		}).body.replace(/<svg[\s\S]*?<\/svg>/g, '');
		for (const word of NEVER_ON_A_CARD) expect(html).not.toContain(word);
		// Nor whether a criterion is a deal-breaker
		expect(html).not.toContain('Deal-breaker');
	});

	it("says when the candidate's journey shares no outcome, and leaves it out of a preview", () => {
		const shared = textOf(render(CandidateCard, { props: { card, outcomes: [] } }).body);
		expect(shared).toContain('This candidate does not share how your job does');
		const preview = textOf(render(CandidateCard, { props: { card } }).body);
		expect(preview).not.toContain('minimum score');
		expect(preview).not.toContain('Interested in your job');
	});

	it('is headed by the latest role, or says it is anonymous, without a headline', () => {
		const untitled = { ...card, headline: null };
		expect(render(CandidateCard, { props: { card: untitled } }).body).toMatch(
			/<h2[^>]*>\s*Staff engineer\s*(<!---->)?<\/h2>/
		);
		const bare = { headline: null, experienceMonths: 0, roles: [], skills: [] };
		const shown = textOf(render(CandidateCard, { props: { card: bare } }).body);
		expect(shown).toContain('Anonymous candidate');
		expect(shown).toContain('No professional experience listed');
	});

	it('leaves the total unsaid for roles without dates, never "none listed" above them', () => {
		const undated = {
			headline: null,
			experienceMonths: 0,
			roles: [{ title: 'Staff engineer', months: null, current: false }],
			skills: []
		};
		const shown = textOf(render(CandidateCard, { props: { card: undated } }).body);
		expect(shown).toContain('Staff engineer No dates');
		expect(shown).not.toContain('No professional experience');
		expect(shown).not.toContain('of professional experience');
	});

	it('reads in French', () => {
		const shown = withLocale('fr', () =>
			textOf(render(CandidateCard, { props: { card, outcomes, interested: true } }).body)
		);
		expect(shown).toContain("Votre offre l'intéresse");
		expect(shown).toContain("6 ans 3 mois d'expérience professionnelle");
		expect(shown).toContain('Rémunération · Correspond en partie');
	});
});

describe('OpportunityCard', () => {
	const opportunity = readOpportunity({
		job: {
			_id: JOB_ID,
			publishedAt: '2026-11-03T09:00:00.000Z',
			title: 'Staff Platform Engineer',
			company: 'Acme',
			description: 'Build the **platform**. <script>alert(1)</script>',
			location: { country: 'FR', city: 'Lyon', workMode: 'hybrid', remoteDaysPerWeek: 2 },
			contract: { type: 'cdi' },
			workingTime: { arrangement: 'annual_days', daysPerYear: 218 },
			pay: { min: 6500000, max: 8000000, currency: 'EUR', period: 'year' },
			recruiter: '65e2e0000000000000000001',
			recruiterEmail: 'hr@acme-hiring.example'
		},
		score: 82,
		minScore: 60,
		criteria: [
			{ criterion: 'pay', outcome: 'match' },
			{ criterion: 'seniority', outcome: 'miss', notStated: true },
			{ criterion: 'commute', outcome: 'unknown' }
		],
		transit: 'here',
		interested: true,
		recruiterDomain: 'acme-hiring.example'
	}) as Opportunity;

	it('shows the job, the day it was opened, its score against the candidate’s criteria', () => {
		const html = render(OpportunityCard, { props: { opportunity, headingId: 'top' } }).body;
		const shown = textOf(html);
		expect(shown).toContain('Its recruiter is interested in you');
		expect(shown).toContain('Staff Platform Engineer');
		expect(shown).toContain('Acme');
		expect(shown).toContain('Opened 3 Nov 2026');
		expect(html).toContain('datetime="2026-11-03T09:00:00.000Z"');
		expect(shown).toContain('Score: 82 / 100 out of 100');
		expect(shown).toContain('Your minimum score: 60');
		expect(shown).toContain('Seniority · Not stated in the job description');
		expect(shown).toContain('Commute · Could not be computed right now: not counted');
		expect(shown).toContain("The commute counts your travel time to the job's address");
		expect(shown).toContain('by public transport, HERE');
		expect(html).toContain(`href="/opportunities/${JOB_ID}"`);
		// The recruiter's description, its raw HTML as text
		expect(html).not.toContain('<script>');
	});

	it('shows nothing of who posted it', () => {
		const html = render(OpportunityCard, { props: { opportunity } }).body;
		expect(html).not.toContain('acme-hiring');
		expect(html).not.toContain('65e2e0000000000000000001');
	});
});

describe('CriterionOutcomes', () => {
	const match = jobMatch({
		score: 0,
		minScore: 60,
		job: { _id: JOB_ID, title: 'Engineer' },
		criteria: [
			{ criterion: 'contractTypes', outcome: 'miss', dealBreaker: true },
			{ criterion: 'commute', outcome: 'partial' }
		]
	});

	it("words the commute for the recruiter, with the candidate's name, as the job match step did", () => {
		const shown = textOf(
			render(CriterionOutcomes, {
				props: { criteria: match?.criteria ?? [], audience: 'recruiter', ownerName: 'Jane' }
			}).body
		);
		expect(shown).toContain('Contract · Does not match Deal-breaker');
		expect(shown).toContain(
			"The commute is Jane's travel time to your job's address, there and back, over a week. Travel times: Géoplateforme (IGN)"
		);
	});
});

describe('MutualInterestPanel', () => {
	const base = {
		_id: '65e2e00000000000000000aa',
		matchedAt: '2026-11-20T10:00:00.000Z',
		changedAt: null,
		endedAt: null,
		endReason: null,
		seen: false
	};
	const panel = (interest: unknown) =>
		render(MutualInterestPanel, {
			props: { interest: readMutualInterest(interest) as MutualInterest, onContinue: () => {} }
		}).body;

	it('tells the recruiter where to book: the portfolio revealed, its page for recruiters', () => {
		const html = panel({
			...base,
			side: 'recruiter',
			job: { _id: JOB_ID, title: 'Staff Platform Engineer', status: 'open' },
			candidate: { domain: 'jane-doe', title: 'Jane Doe' }
		});
		const shown = textOf(html);
		expect(shown).toContain("You're both interested");
		expect(shown).toContain('This candidate is interested in Staff Platform Engineer too.');
		expect(shown).toContain('Jane Doe');
		expect(html).toContain('href="/jane-doe/hire"');
		expect(html).toContain('href="/jane-doe/experiences"');
		expect(shown).not.toMatch(/\bmatch(ed)?\b|e-mail|email/i);
	});

	it('tells the candidate what happens next, and promises no email', () => {
		const html = panel({
			...base,
			side: 'candidate',
			job: { _id: JOB_ID, title: 'Staff Platform Engineer', description: '', status: 'open' },
			score: 82,
			minScore: 60,
			criteria: []
		});
		const shown = textOf(html);
		// How a meeting is booked, never that the portfolio is shown (their answer does not say it)
		expect(shown).toContain(
			'The recruiter of Staff Platform Engineer is interested in you too. To book a meeting with you, they go through the steps of your page for recruiters.'
		);
		expect(shown).not.toMatch(/portfolio/i);
		expect(html).toContain(`href="/opportunities/${JOB_ID}"`);
		expect(shown).not.toMatch(/\bmatch(ed)?\b|e-mail|email/i);
	});

	it('names no job whose version no longer reads back, in a whole sentence', () => {
		const untitled = {
			...base,
			side: 'candidate',
			job: null,
			score: 82,
			minScore: 60,
			criteria: []
		};
		const shown = textOf(panel(untitled));
		expect(shown).toContain(
			'The recruiter of this job is interested in you too. To book a meeting with you, they go through the steps of your page for recruiters.'
		);
		expect(panel(untitled)).not.toContain('/opportunities/');
		const french = withLocale('fr', () => textOf(panel(untitled)));
		expect(french).toContain('Intérêt réciproque');
		expect(french).toContain(
			"Le recruteur de cette offre s'intéresse aussi à vous. Pour réserver un rendez-vous avec vous, il passe par les étapes de votre page recruteurs."
		);
		expect(french).not.toMatch(/de l'offre\s+s'intéresse/);
	});

	it('says a portfolio not revealed is not available, with nothing to follow', () => {
		const html = panel({
			...base,
			side: 'recruiter',
			job: { _id: JOB_ID, title: 'Staff Platform Engineer', status: 'open' },
			candidate: null
		});
		expect(textOf(html)).toContain('their portfolio is not available right now');
		expect(html).not.toContain('/hire"');
	});
});

describe('MatchDeck', () => {
	it('shows a placeholder until its first read, which only the browser makes', () => {
		let asked = false;
		const html = render(MatchDeck<{ id: string }>, {
			props: {
				side: 'recruiter',
				label: 'Candidates for your job',
				key: (card) => card.id,
				load: async () => {
					asked = true;
					return { ok: true as const, page: { cards: [], more: false } };
				},
				decide: async () => ({ ok: true as const, match: null }),
				undo: async () => ({ ok: true as const, match: null }),
				card: createRawSnippet(() => ({ render: () => '<p>card</p>' })),
				empty: createRawSnippet(() => ({ render: () => '<p>empty</p>' }))
			}
		}).body;
		expect(asked).toBe(false);
		expect(html).toContain('aria-label="Candidates for your job"');
		expect(html).toContain('aria-live="polite"');
		expect(html).toContain('aria-busy="true"');
		expect(html).not.toContain('Interested');
	});
});
