import { describe, it, expect } from 'vitest';
import { formatPayAmount, withLocale, type PerfectJob } from 'portfolio-common';
import type { Readiness } from '../candidateSetup';
import {
	UNKNOWN_JOURNEY,
	factLines,
	linkIn,
	linkedInText,
	payAmountValid,
	perfectJobFacts,
	recruiterPageLink,
	replyText,
	sharedJourney,
	type SharedJourney
} from '../shareKit';

const PORTFOLIO = 'https://portfolio.example/jane.doe';
/** French texts keep their non-breaking spaces (before ":", "?", in amounts): compared as spaces */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');
const PAGE = `${PORTFOLIO}/hire`;

const readiness = (
	journey: Partial<Readiness['journey']>,
	calendar: Partial<Readiness['calendar']> = {},
	criteria = 1
): Readiness => ({
	domain: 'jane.doe',
	experiences: 1,
	perfectJob: {
		criteria,
		essentials: { pay: criteria > 0, workMode: false, place: false, contractTypes: false }
	},
	journey: {
		saved: true,
		types: ['meeting'],
		blocked: false,
		gate: false,
		meeting: true,
		...journey
	},
	calendar: {
		configured: true,
		connected: true,
		reconnect: false,
		enabledSchedules: 1,
		...calendar
	}
});

const journeyOf = (journey: Partial<SharedJourney>): SharedJourney => ({
	...UNKNOWN_JOURNEY,
	...journey
});
/** The gate: a note, a job, its match, the meeting */
const GATE = journeyOf({ job: true, scored: true, meeting: true });
/** The default journey: the meeting alone */
const MEETING = journeyOf({ meeting: true });
/** A job step then the meeting, without a score */
const JOB = journeyOf({ job: true, meeting: true });
/** The gate, with a perfect job that has no criterion: every job would score 100 */
const NOTHING_TO_SCORE = journeyOf({ job: true, meeting: true, nothingToScore: true });
/** Steps that lead to a meeting nobody can book yet: the calendar is not open */
const CLOSED = journeyOf({ calendarClosed: true });
/** A step that can never be passed: nobody gets through the page */
const BLOCKED = journeyOf({ blocked: true });
const GATE_TYPES = ['note', 'job', 'job-match', 'meeting'];

/** A perfect job stating every fact the kit reads, and a commute it must never read */
const CRITERIA: PerfectJob = {
	pay: { importance: 5, dealBreaker: true, perYear: 65000, perDay: 550 },
	workMode: { importance: 4, modes: ['hybrid', 'remote'], minRemoteDays: 2 },
	cities: { importance: 3, places: ['Paris', 'Lyon'] },
	contractTypes: { importance: 3, types: ['freelance', 'cdi'] },
	commute: {
		importance: 4,
		from: '12 rue Secrète, Paris',
		modes: ['transit'],
		maxMinutesPerWeek: 300
	}
};

describe('what the texts say of the journey', () => {
	it('reads the journey the readiness describes', () => {
		expect(sharedJourney(null)).toEqual(UNKNOWN_JOURNEY);
		expect(sharedJourney(readiness({}))).toEqual(MEETING);
		expect(sharedJourney(readiness({ types: GATE_TYPES, gate: true, meeting: true }))).toEqual(
			GATE
		);
		expect(sharedJourney(readiness({ types: ['job', 'meeting'] }))).toEqual(JOB);
		// A step that blocks the meeting: no promise of the job step either, and the tab says why
		expect(
			sharedJourney(
				readiness({ types: ['job', 'gone', 'meeting'], blocked: true, gate: false, meeting: false })
			)
		).toEqual(BLOCKED);
	});

	it('says the job is scored only against a perfect job with a criterion', () => {
		const gate = { types: GATE_TYPES, gate: true, meeting: true };
		expect(sharedJourney(readiness(gate, {}, 0))).toEqual(NOTHING_TO_SCORE);
		expect(sharedJourney(readiness(gate, {}, 3))).toEqual(GATE);
		// Without the gate, nothing is scored either way
		expect(sharedJourney(readiness({ types: ['job', 'meeting'] }, {}, 0))).toEqual(JOB);
	});

	it('sends recruiters to the page for recruiters only once they can book there', () => {
		const gate = { types: GATE_TYPES, gate: true, meeting: true };
		for (const calendar of [
			{ connected: false },
			{ reconnect: true },
			{ enabledSchedules: 0 },
			// A site that takes no Google Calendar connection
			{ configured: false, connected: false, enabledSchedules: 0 }
		]) {
			expect(sharedJourney(readiness({}, calendar))).toEqual(CLOSED);
			expect(sharedJourney(readiness(gate, calendar))).toEqual(CLOSED);
		}
		// A journey that leads to no meeting says nothing of the calendar
		expect(
			sharedJourney(
				readiness(
					{ types: ['job', 'gone', 'meeting'], blocked: true, meeting: false },
					{ connected: false }
				)
			)
		).toEqual(BLOCKED);
		expect(
			sharedJourney(readiness({ types: ['note'], meeting: false }, { connected: false }))
		).toEqual(UNKNOWN_JOURNEY);
	});
});

describe('the links', () => {
	it('opens the page for recruiters, in the language of the text', () => {
		expect(recruiterPageLink(PORTFOLIO)).toBe(PAGE);
		expect(linkIn('en', PAGE)).toBe(PAGE);
		expect(linkIn('fr', PAGE)).toBe(`${PAGE}?lang=fr`);
	});
});

describe('the facts', () => {
	it('reads the pay, remote days, places and contracts of the perfect job, never the commute', () => {
		const facts = perfectJobFacts(CRITERIA);
		expect(facts).toEqual({
			pay: { amount: 65000, per: 'year' },
			remoteDays: 2,
			places: 'Paris, Lyon',
			contracts: ['freelance', 'cdi']
		});
		expect(JSON.stringify(facts)).not.toContain('Secrète');
		// A day rate when no yearly pay is asked; 5 days when only fully remote jobs are
		expect(
			perfectJobFacts({
				pay: { importance: 3, perDay: 550 },
				workMode: { importance: 3, modes: ['remote'] }
			})
		).toEqual({ pay: { amount: 550, per: 'day' }, remoteDays: 5 });
		// On site, or hybrid without a number of days: nothing to say of remote days
		expect(perfectJobFacts({ workMode: { importance: 3, modes: ['on_site', 'hybrid'] } })).toEqual(
			{}
		);
		// An on-site job matches whatever the hybrid minimum: the owner asks for no remote day
		expect(
			perfectJobFacts({
				workMode: { importance: 3, modes: ['on_site', 'hybrid'], minRemoteDays: 2 }
			})
		).toEqual({});
		expect(perfectJobFacts({ workMode: { importance: 3, modes: ['on_site', 'remote'] } })).toEqual(
			{}
		);
		expect(
			perfectJobFacts({ workMode: { importance: 3, modes: ['hybrid'], minRemoteDays: 3 } })
		).toEqual({ remoteDays: 3 });
		expect(perfectJobFacts({})).toEqual({});
	});

	it('names the cities, not the first digits of a postal code', () => {
		expect(
			perfectJobFacts({
				cities: { importance: 3, places: ['69', 'Paris', '750', 'Saint-Étienne'] }
			})
		).toEqual({ places: 'Paris, Saint-Étienne' });
		expect(perfectJobFacts({ cities: { importance: 3, places: ['69', '38000'] } })).toEqual({});
	});

	it('writes only the facts set, in the language in use', () => {
		expect(factLines({})).toEqual([]);
		expect(factLines({ pay: { amount: 65000, per: 'year' } })).toEqual([
			`Pay: at least ${withLocale('en', () => formatPayAmount(65000))} gross a year`
		]);
		expect(
			factLines({
				pay: { amount: 550, per: 'day' },
				remoteDays: 2,
				places: '  Paris,\n Lyon ',
				// Listed in the order of the contracts, whatever the order ticked
				contracts: ['freelance', 'cdi']
			})
		).toEqual([
			'Pay: at least €550 gross a day',
			'Remote work: at least 2 days a week',
			'Location: Paris, Lyon',
			'Contract: CDI (permanent), Freelance'
		]);
		expect(factLines({ remoteDays: 1 })).toEqual(['Remote work: at least 1 day a week']);
		expect(factLines({ remoteDays: 5 })).toEqual(['Remote work: fully remote']);
		expect(
			withLocale('fr', () =>
				factLines({
					pay: { amount: 65000, per: 'year' },
					remoteDays: 2,
					places: 'Paris',
					contracts: ['cdi']
				})
			).map(plain)
		).toEqual([
			'Rémunération : au moins 65 000 € brut par an',
			'Télétravail : au moins 2 jours par semaine',
			'Lieu : Paris',
			'Contrat : CDI'
		]);
	});

	it('leaves out what is empty or not a number', () => {
		expect(
			factLines({
				pay: { amount: Number.NaN, per: 'year' },
				remoteDays: 0,
				places: '   ',
				contracts: []
			})
		).toEqual([]);
		expect(factLines({ pay: { amount: 0, per: 'year' } })).toEqual([]);
		expect(factLines({ pay: { amount: 65000.5, per: 'year' } })).toEqual([]);
	});

	it('takes a pay amount only as a whole number of euros above 0', () => {
		expect(payAmountValid(65000)).toBe(true);
		for (const amount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(payAmountValid(amount), String(amount)).toBe(false);
		}
	});
});

describe('the reply to a recruiter', () => {
	it('asks for the job and its pay range on the page for recruiters of a gate journey', () => {
		const text = replyText('en', { portfolio: PORTFOLIO, journey: GATE });
		expect(text).toBe(
			[
				'Hello,',
				'Thank you for your message. Before we talk, could you share the role on my page for recruiters, with its pay range? It is scored against what I am looking for and, if it fits, you can book a meeting with me there.',
				PAGE,
				'Best regards,'
			].join('\n\n')
		);
	});

	it('promises no score where the journey has none, or scores against nothing', () => {
		const text = replyText('en', { portfolio: PORTFOLIO, journey: JOB });
		expect(text).toContain('with its pay range? You can then book a meeting with me there.');
		expect(text).not.toContain('scored');
		for (const locale of ['en', 'fr'] as const) {
			expect(replyText(locale, { portfolio: PORTFOLIO, journey: NOTHING_TO_SCORE })).toBe(
				replyText(locale, { portfolio: PORTFOLIO, journey: JOB })
			);
			expect(linkedInText(locale, { portfolio: PORTFOLIO, journey: NOTHING_TO_SCORE })).toBe(
				linkedInText(locale, { portfolio: PORTFOLIO, journey: JOB })
			);
		}
	});

	it('asks for the job in the reply when the journey does not', () => {
		const text = replyText('en', { portfolio: PORTFOLIO, journey: MEETING });
		expect(text).toContain(
			'Before we talk, could you send me the job description, with its pay range? You can then book a meeting with me on my page for recruiters:'
		);
		expect(text).toContain(`\n\n${PAGE}\n\n`);
		expect(text).not.toContain('scored');
		// The journey unknown, or leading nowhere: the portfolio, and no meeting promised
		const unknown = replyText('en', { portfolio: PORTFOLIO, journey: UNKNOWN_JOURNEY });
		expect(unknown).toContain('My experiences and projects are in my portfolio:');
		expect(unknown).toContain(`\n\n${PORTFOLIO}\n\n`);
		expect(unknown).not.toContain('/hire');
		expect(unknown).not.toContain('meeting');
	});

	it('promises no meeting while nobody can book one, or get through the page', () => {
		for (const locale of ['en', 'fr'] as const) {
			for (const journey of [CLOSED, BLOCKED]) {
				const text = replyText(locale, { portfolio: PORTFOLIO, journey });
				expect(text).toBe(replyText(locale, { portfolio: PORTFOLIO, journey: UNKNOWN_JOURNEY }));
				expect(text).not.toContain('/hire');
				expect(text).not.toMatch(/meeting|rendez-vous|scored|notée/);
			}
		}
		expect(replyText('en', { portfolio: PORTFOLIO, journey: CLOSED })).toContain(
			'could you send me the job description, with its pay range? My experiences and projects are in my portfolio:'
		);
	});

	it('says nothing of what the owner asks for until a fact is ticked', () => {
		const bare = replyText('en', { portfolio: PORTFOLIO, journey: GATE });
		expect(bare).not.toContain('matter to me');
		expect(bare).not.toMatch(/65[,\s]?000/);
		const withPay = replyText('en', {
			portfolio: PORTFOLIO,
			journey: GATE,
			facts: { pay: { amount: 65000, per: 'year' } }
		});
		expect(withPay).toContain(
			`${PAGE}\n\nA few things that matter to me:\n- Pay: at least €65,000 gross a year\n\nBest regards,`
		);
	});

	it('is written in French, with the French links, whatever the language in use', () => {
		const text = replyText('fr', {
			portfolio: PORTFOLIO,
			journey: GATE,
			facts: { remoteDays: 5 }
		});
		expect(plain(text)).toBe(
			[
				'Bonjour,',
				"Merci pour votre message. Avant d'échanger, pourriez-vous présenter le poste sur ma page recruteurs, avec sa fourchette de rémunération ? L'offre est notée au regard de ce que je recherche et, si elle correspond, vous pouvez y réserver un rendez-vous avec moi.",
				`${PAGE}?lang=fr`,
				'Ce qui compte pour moi :\n- Télétravail : complet',
				'Bien cordialement,'
			].join('\n\n')
		);
		// And in English from a French page
		expect(withLocale('fr', () => replyText('en', { portfolio: PORTFOLIO, journey: GATE }))).toBe(
			replyText('en', { portfolio: PORTFOLIO, journey: GATE })
		);
	});
});

describe('the LinkedIn text', () => {
	it('says what the page for recruiters asks, then gives the portfolio', () => {
		expect(linkedInText('en', { portfolio: PORTFOLIO, journey: GATE })).toBe(
			`Recruiters: to propose a role, start on my page for recruiters. It asks for the job and its pay range first, and scores it against what I am looking for: ${PAGE}\n\nMy experiences and projects: ${PORTFOLIO}`
		);
		expect(linkedInText('en', { portfolio: PORTFOLIO, journey: JOB })).toContain(
			`It asks for the job and its pay range first: ${PAGE}`
		);
		expect(linkedInText('en', { portfolio: PORTFOLIO, journey: MEETING })).toContain(
			`Recruiters: to propose a role, start on my page for recruiters: ${PAGE}`
		);
		expect(linkedInText('en', { portfolio: PORTFOLIO, journey: UNKNOWN_JOURNEY })).toBe(
			`My experiences and projects: ${PORTFOLIO}`
		);
		// Nobody can book yet, or get through the page: the portfolio alone
		for (const journey of [CLOSED, BLOCKED]) {
			expect(linkedInText('en', { portfolio: PORTFOLIO, journey })).toBe(
				`My experiences and projects: ${PORTFOLIO}`
			);
		}
		expect(plain(linkedInText('fr', { portfolio: PORTFOLIO, journey: MEETING }))).toBe(
			`Recruteurs : pour me proposer un poste, commencez par ma page recruteurs : ${PAGE}?lang=fr\n\nMes expériences et mes projets : ${PORTFOLIO}?lang=fr`
		);
	});
});
