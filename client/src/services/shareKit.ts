import {
	CONTRACT_TYPE_LABELS,
	FR_CONTRACT_TYPES,
	formatPayAmount,
	withLocale,
	type ContractType,
	type Locale,
	type PerfectJob
} from 'portfolio-common';
import { calendarOpen, type Readiness } from './candidateSetup';
import { m } from './shareKit.messages';

// The share kit of the admin's Share tab (ShareTab.svelte): the texts an owner copies to answer a
// recruiter who wrote to them, and to put on their LinkedIn profile, in English or in French
// whatever the page's language (the recruiter's, which the owner picks). Pure: nothing here is
// saved or sent anywhere, the owner copies what they want. The reply asks the recruiter for the
// job and its pay range; it says nothing of what the owner asks for, unless they tick a fact
// (their pay, remote days, places, contracts), which the tab prefills from their perfect job
// (GET /perfect-job) only once ticked. What a text says of the journey is what the owner's
// journey does (GET /me/readiness): a reply never promises a step their page does not have, nor a
// meeting nobody can book yet.

// --- The journey -------------------------------------------------------------------------

/** What the owner's journey asks of a recruiter, as the texts say it */
export interface SharedJourney {
	/** A job step recruiters can reach: they share the job there, with its pay (every job has one) */
	job: boolean;
	/**
	 * The job is scored against the perfect job, then a meeting can be booked (the gate), and the
	 * perfect job has a criterion to score it against
	 */
	scored: boolean;
	/** It leads to a meeting recruiters can reach and book */
	meeting: boolean;
	/**
	 * The steps lead to a meeting, but nobody can book it yet (the calendar is not open): the texts
	 * then send recruiters nowhere on the page for recruiters, which would stop them at "No online
	 * booking" (and a job shared there before a meeting never reaches the owner)
	 */
	calendarClosed: boolean;
	/**
	 * A step can never be passed (readiness' `blocked`: a type this version does not have, or one
	 * whose needs are not before it): the texts send recruiters nowhere on the page for recruiters,
	 * which they could not get through
	 */
	blocked: boolean;
	/**
	 * The gate, with a perfect job that has no criterion yet: every job would score 100, so the
	 * texts do not say the job is scored (`scored` is false)
	 */
	nothingToScore: boolean;
}

/** Unknown (the readiness could not be read): the texts ask for the job, and promise nothing */
export const UNKNOWN_JOURNEY: SharedJourney = {
	job: false,
	scored: false,
	meeting: false,
	calendarClosed: false,
	blocked: false,
	nothingToScore: false
};

/** What the journey of the readiness asks of recruiters */
export const sharedJourney = (readiness: Readiness | null): SharedJourney => {
	if (!readiness) return UNKNOWN_JOURNEY;
	const { journey, calendar, perfectJob } = readiness;
	if (journey.blocked) return { ...UNKNOWN_JOURNEY, blocked: true };
	if (journey.meeting && !calendarOpen(calendar)) {
		return { ...UNKNOWN_JOURNEY, calendarClosed: true };
	}
	const rated = perfectJob.criteria > 0;
	return {
		...UNKNOWN_JOURNEY,
		job: journey.types.includes('job'),
		scored: journey.gate && rated,
		meeting: journey.meeting,
		nothingToScore: journey.gate && !rated
	};
};

// --- The links ---------------------------------------------------------------------------

/** The page for recruiters (the Hire page) of the portfolio at `portfolio` (portfolioLink) */
export const recruiterPageLink = (portfolio: string): string => `${portfolio}/hire`;

/** A link of the site in the text's language: French adds ?lang=fr (English is the address) */
export const linkIn = (locale: Locale, link: string): string =>
	locale === 'fr' ? `${link}?lang=fr` : link;

// --- The facts ---------------------------------------------------------------------------

/** The facts an owner can add to a reply, in the order the tab and the text list them */
export const SHARE_FACTS = ['pay', 'remoteDays', 'places', 'contracts'] as const;
export type ShareFact = (typeof SHARE_FACTS)[number];

export type PayPer = 'year' | 'day';

/** What the owner tells the recruiter they ask for: only the facts they ticked, as they set them */
export interface ShareFacts {
	/** At least this gross pay (euros), a year or a day */
	pay?: { amount: number; per: PayPer };
	/** At least this many remote days a week, 1 to 5 (5: fully remote) */
	remoteDays?: number;
	/** Where, as the owner wrote it */
	places?: string;
	contracts?: ContractType[];
}

export const MAX_REMOTE_DAYS = 5;

/** A place of a perfect job that is the first digits of a postal code ("69"), as scored */
const POSTAL_CODE_PREFIX = /^\d{2,5}$/;

/**
 * The facts of a perfect job, to prefill those the owner ticks, only as the scorer reads them:
 * the pay asked (a year, else a day); the remote days, only when every job the owner accepts has
 * them (5 when only a fully remote job is, the hybrid minimum when no on-site job is: an owner who
 * accepts on-site jobs asks for no remote day); the cities, without the first digits of a postal
 * code ("69", which a recruiter would not read as a place); the contracts. Never the commute: its
 * address is the owner's alone
 */
export const perfectJobFacts = (criteria: PerfectJob): ShareFacts => {
	const facts: ShareFacts = {};
	const { pay, workMode, cities, contractTypes } = criteria;
	if (pay?.perYear) facts.pay = { amount: pay.perYear, per: 'year' };
	else if (pay?.perDay) facts.pay = { amount: pay.perDay, per: 'day' };
	if (workMode && !workMode.modes.includes('on_site')) {
		if (workMode.modes.length === 1 && workMode.modes[0] === 'remote') {
			facts.remoteDays = MAX_REMOTE_DAYS;
		} else if (workMode.modes.includes('hybrid') && workMode.minRemoteDays) {
			facts.remoteDays = workMode.minRemoteDays;
		}
	}
	const places = cities?.places.filter((place) => !POSTAL_CODE_PREFIX.test(place)) ?? [];
	if (places.length) facts.places = places.join(', ');
	if (contractTypes?.types.length) facts.contracts = [...contractTypes.types];
	return facts;
};

/** A pay amount the reply can carry, as the owner typed it: a whole number of euros above 0 */
export const payAmountValid = (amount: number): boolean => Number.isInteger(amount) && amount > 0;

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The lines of the facts set, in the language in use: a fact left empty or invalid is left out */
export const factLines = (facts: ShareFacts): string[] => {
	const lines: string[] = [];
	const { pay, remoteDays, places, contracts } = facts;
	if (pay && payAmountValid(pay.amount)) {
		lines.push(m.fact.pay[pay.per](formatPayAmount(pay.amount)));
	}
	if (remoteDays !== undefined && Number.isInteger(remoteDays) && remoteDays >= 1) {
		lines.push(remoteDays >= MAX_REMOTE_DAYS ? m.fact.fullyRemote : m.fact.remoteDays(remoteDays));
	}
	if (places !== undefined && oneLine(places)) lines.push(m.fact.places(oneLine(places)));
	const types = FR_CONTRACT_TYPES.filter((type) => contracts?.includes(type));
	if (types.length) {
		lines.push(m.fact.contracts(types.map((type) => CONTRACT_TYPE_LABELS[type]).join(', ')));
	}
	return lines;
};

// --- The texts ---------------------------------------------------------------------------

export interface ShareTextInput {
	/** The portfolio's address on this site (portfolioLink), in English (without ?lang=) */
	portfolio: string;
	journey: SharedJourney;
	/** The facts the owner ticked */
	facts?: ShareFacts;
}

/**
 * The reply to a recruiter's message, in `locale`: it asks for the job and its pay range (on the
 * page for recruiters when it has a job step), says what follows on that page, gives the link,
 * then the facts the owner ticked
 */
export const replyText = (locale: Locale, { portfolio, journey, facts = {} }: ShareTextInput) =>
	withLocale(locale, () => {
		const ask = journey.job
			? [
					m.reply.shareThere,
					...(journey.scored ? [m.reply.scored] : journey.meeting ? [m.reply.thenBook] : [])
				]
			: [m.reply.sendIt, journey.meeting ? m.reply.bookThere : m.reply.portfolio];
		const link = journey.job || journey.meeting ? recruiterPageLink(portfolio) : portfolio;
		const lines = factLines(facts);
		return [
			m.reply.greeting,
			[m.reply.thanks, ...ask].join(' '),
			linkIn(locale, link),
			...(lines.length
				? [[m.reply.factsIntro, ...lines.map((line) => `- ${line}`)].join('\n')]
				: []),
			m.reply.closing
		].join('\n\n');
	});

/**
 * The LinkedIn text (a profile's About section), in `locale`: how recruiters propose a role on the
 * page for recruiters, then the portfolio. Only the portfolio for a journey that leads nowhere
 */
export const linkedInText = (locale: Locale, { portfolio, journey }: ShareTextInput) =>
	withLocale(locale, () => {
		const page = linkIn(locale, recruiterPageLink(portfolio));
		const start = journey.job
			? journey.scored
				? m.linkedIn.scored(page)
				: m.linkedIn.asksJob(page)
			: journey.meeting
				? m.linkedIn.start(page)
				: undefined;
		return [...(start ? [start] : []), m.linkedIn.portfolio(linkIn(locale, portfolio))].join(
			'\n\n'
		);
	});
