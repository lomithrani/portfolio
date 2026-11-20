// Path 2, matching on open jobs (behind the API's MATCHING flag): a candidate turns discovery on
// (opt-in, 18 or over, withdrawable at once, legal.ts: parseDiscoveryConsent), and an anonymous
// card of theirs is then proposed to recruiters whose open jobs meet their criteria; their
// portfolio is revealed only once both sides are interested. Matching is deterministic: the
// candidate's own criteria (perfectJob.ts: scorePerfectJob), never a model.
//
// The rules the API enforces and the client shows: what a candidate must have set up to be
// proposed (discoveryRequirements, read from the readiness of GET /me/readiness: one readiness,
// for sharing the link and for discovery), how long discovery lasts without activity or a new
// consent, the state it is in, the settings of the anonymous card, and the limits.

import { cleanIssueText } from './issueText';
import { OPEN_JOB_STATUS } from './jobPosting';
import type { JobStatus } from './jobPosting';
import { matchingMessages as m } from './matching.messages';
import type { PerfectJobCriterion } from './perfectJob';
import type { CandidateReadiness } from './readiness';

/** Criteria a candidate rates, at least, to be proposed to recruiters: the pay among them */
export const DISCOVERY_MIN_CRITERIA = 3;

/**
 * Days without the candidate signing in (a session lasts 7 days) or changing their discovery
 * after which they are paused: in no recruiter's feed until they come back
 */
export const DISCOVERY_INACTIVITY_DAYS = 180;

/** Months after which a discovery consent lapses: the candidate gives it again to stay proposed */
export const DISCOVERY_CONSENT_MONTHS = 24;

/**
 * Days before a discovery consent lapses from which the candidate can confirm it again: a new
 * consent, recorded like the first, from which DISCOVERY_CONSENT_MONTHS count again (earlier, an
 * opt-in of a candidate already on records nothing)
 */
export const DISCOVERY_CONSENT_RENEWAL_DAYS = 30;

/**
 * Days after a withdrawal during which the candidate cannot turn discovery on again: a withdrawal
 * drops every decision about them no mutual interest came of, recruiters' passes included, so
 * withdrawing then turning it on again at once would put them back before every recruiter who
 * passed them, and tell them which jobs those were
 */
export const DISCOVERY_REJOIN_DAYS = 7;

/** Lengths and counts of what a candidate sets for discovery, which PUT /discovery enforces */
export const DISCOVERY_LIMITS = {
	/** The line a candidate writes atop their anonymous card, in characters */
	headline: 80,
	/** Experiences of their portfolio they hide from the card */
	hiddenExperiences: 50
} as const;

/** The limits of matching itself (the jobs in it, the feeds, the anonymous card) */
export const MATCHING_LIMITS = {
	/** Jobs a recruiter has in matching at once */
	matchingJobsPerRecruiter: 10,
	/** Jobs in one page of a candidate's feed */
	candidateFeedPage: 30,
	/**
	 * Anonymous cards a recruiter gets per read of a job's feed: one, the next once it is answered,
	 * and whether there are more. A page of several would count the candidates of a job whenever
	 * it is not full, and counts compared across jobs that differ by one term would tell the
	 * candidates' floors
	 */
	recruiterCardsPerRead: 1,
	/** Professional roles an anonymous card lists, at most */
	roles: 8,
	/** Skills an anonymous card lists, at most */
	skills: 15,
	/** The reason a reviewer gives a recruiter for not accepting a job, in characters */
	reviewReason: 300,
	/** Jobs one read of the reviewers' list gives, the oldest request first */
	reviewsPerRead: 100,
	/** Mutual interests one read of a side's list gives, the latest first */
	matchesPerRead: 50,
	/**
	 * Decisions an account takes (or undoes) per UTC day, as a candidate and as a recruiter
	 * together: what a person answers, not a script trying versions of an answer
	 */
	decisionsPerDay: 300,
	/**
	 * Minutes after a decision during which its side can undo it, and only while it is their latest
	 * decision: an undo puts back a choice just made, never a way to pass every candidate (or job)
	 * then take it all back
	 */
	undoMinutes: 10
} as const;

// --- Requirements ----------------------------------------------------------------------

/**
 * What a candidate must have to be proposed to recruiters, in the order they are set up: a
 * portfolio; the terms in force accepted; DISCOVERY_MIN_CRITERIA criteria rated, the pay among
 * them; a journey that asks for the job, scores it, then leads to a meeting (the gate: a mutual
 * interest goes on into it, with its one minimum); Google Calendar connected, and a meeting type
 * with hours (the meeting can be booked); and activity in the last DISCOVERY_INACTIVITY_DAYS days
 */
export const DISCOVERY_REQUIREMENTS = [
	'portfolio',
	'terms',
	'criteria',
	'pay',
	'journey',
	'calendar',
	'schedule',
	'active'
] as const;
export type DiscoveryRequirement = (typeof DISCOVERY_REQUIREMENTS)[number];

/** What discoveryRequirements reads besides the readiness */
export interface DiscoveryFacts {
	/** The account accepted the terms in force (LEGAL_VERSION) */
	termsAccepted: boolean;
	/**
	 * When the candidate last signed in or changed their discovery (their discovery profile's);
	 * none yet (never turned on) is not held against them: turning it on is activity
	 */
	lastActiveAt?: Date | string | null;
	now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the candidate last active at `lastActiveAt` is paused for inactivity at `now`: more
 * than DISCOVERY_INACTIVITY_DAYS days ago. A date that cannot be read counts as inactive (fails
 * closed); none counts as active
 */
export const discoveryInactive = (
	lastActiveAt: Date | string | null | undefined,
	now = new Date()
) => {
	if (lastActiveAt === undefined || lastActiveAt === null) return false;
	const at = new Date(lastActiveAt).getTime();
	return Number.isNaN(at) || now.getTime() - at > DISCOVERY_INACTIVITY_DAYS * DAY_MS;
};

/**
 * What the candidate whose readiness (GET /me/readiness) is `readiness` still misses to be
 * proposed to recruiters, in the order of DISCOVERY_REQUIREMENTS: empty when nothing is
 */
export const discoveryRequirements = (
	readiness: CandidateReadiness,
	{ termsAccepted, lastActiveAt, now = new Date() }: DiscoveryFacts
): DiscoveryRequirement[] => {
	const { perfectJob, journey, calendar } = readiness;
	const missing: Record<DiscoveryRequirement, boolean> = {
		portfolio: readiness.domain === null,
		terms: !termsAccepted,
		criteria: perfectJob.criteria < DISCOVERY_MIN_CRITERIA,
		pay: !perfectJob.essentials.pay,
		// False for a journey that is blocked or was never saved (the default: a meeting alone)
		journey: !journey.gate,
		calendar: !calendar.configured || !calendar.connected || calendar.reconnect,
		schedule: calendar.enabledSchedules < 1,
		active: discoveryInactive(lastActiveAt, now)
	};
	return DISCOVERY_REQUIREMENTS.filter((requirement) => missing[requirement]);
};

/** What `requirement` asks, in the language in use (the API's 422, the checklist) */
export const discoveryRequirementMessage = (requirement: DiscoveryRequirement): string => {
	switch (requirement) {
		case 'criteria':
			return m.requirement.criteria(DISCOVERY_MIN_CRITERIA);
		case 'active':
			return m.requirement.active(DISCOVERY_INACTIVITY_DAYS);
		default:
			return m.requirement[requirement];
	}
};

// --- State -----------------------------------------------------------------------------

/** `at` moved by `months` calendar months, in UTC (a day past the month's end runs into the next) */
const addUtcMonths = (at: Date | string, months: number): Date => {
	const moved = new Date(at);
	moved.setUTCMonth(moved.getUTCMonth() + months);
	return moved;
};

/** When a discovery consent given at `grantedAt` lapses: DISCOVERY_CONSENT_MONTHS later */
export const discoveryConsentExpiry = (grantedAt: Date | string): Date =>
	addUtcMonths(grantedAt, DISCOVERY_CONSENT_MONTHS);

/**
 * The latest grant that has lapsed at `now` (DISCOVERY_CONSENT_MONTHS before it): a consent given
 * after it is in force. What a database query of the candidates in force compares with
 */
export const discoveryConsentCutoff = (now = new Date()): Date =>
	addUtcMonths(now, -DISCOVERY_CONSENT_MONTHS);

/**
 * The latest grant that can be confirmed again at `now`: one that lapses within
 * DISCOVERY_CONSENT_RENEWAL_DAYS (or has lapsed). What the API's opt-in compares with, so that two
 * opt-ins at once record one consent
 */
export const discoveryRenewalCutoff = (now = new Date()): Date =>
	discoveryConsentCutoff(new Date(now.getTime() + DISCOVERY_CONSENT_RENEWAL_DAYS * DAY_MS));

/**
 * Whether the consent given at `enabledAt` can be confirmed again at `now`: it lapses within
 * DISCOVERY_CONSENT_RENEWAL_DAYS, or has lapsed. None (off): no, it is given, not confirmed
 */
export const discoveryConsentRenewable = (
	enabledAt: Date | string | null | undefined,
	now = new Date()
): boolean => {
	if (enabledAt === undefined || enabledAt === null) return false;
	const at = new Date(enabledAt).getTime();
	return !Number.isNaN(at) && at <= discoveryRenewalCutoff(now).getTime();
};

/**
 * Where a candidate stands: `off` (never turned on, or withdrawn), `on` (proposed to
 * recruiters), `paused` (turned on, but a requirement is missing since: proposed to nobody until
 * it is back) or `lapsed` (the consent is DISCOVERY_CONSENT_MONTHS old: given again to be
 * proposed)
 */
export const DISCOVERY_STATES = ['off', 'on', 'paused', 'lapsed'] as const;
export type DiscoveryState = (typeof DISCOVERY_STATES)[number];

/**
 * The state of a candidate who turned discovery on at `enabledAt` (none: off) and misses
 * `missing` (discoveryRequirements)
 */
export const discoveryState = (
	enabledAt: Date | string | null | undefined,
	missing: readonly DiscoveryRequirement[],
	now = new Date()
): DiscoveryState => {
	if (enabledAt === undefined || enabledAt === null) return 'off';
	if (discoveryConsentExpiry(enabledAt).getTime() <= now.getTime()) return 'lapsed';
	return missing.length > 0 ? 'paused' : 'on';
};

// --- The anonymous card's settings ------------------------------------------------------

/**
 * What a candidate sets of their anonymous card (PUT /discovery): a headline of their own, and
 * the experiences of their portfolio it leaves out (their ids)
 */
export interface DiscoveryCardSettings {
	headline: string | null;
	hiddenExperiences: string[];
}

/** The field of refused card settings, as the API names it in a 422 (`property`) */
export type DiscoveryCardField = 'card' | 'card.headline' | 'card.hiddenExperiences';

export type DiscoveryCardResult =
	| { ok: true; card: DiscoveryCardSettings }
	| { ok: false; property: DiscoveryCardField; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const OBJECT_ID = /^[0-9a-f]{24}$/i;

// Ways to reach or find the candidate, which the card is read before both sides are interested
// in: a link (a scheme, `www.`, a host followed by a path, `linkedin.com/in/jane` or
// `behance.net/jane`, or a host alone under a domain people take for their own pages,
// `janedoe.dev`), an email address, and a phone number (9 digits or more, one separator at most
// between two of them). Tested on the text as the card keeps it, folded by NFKC (`jane＠acme.fr` is
// `jane@acme.fr`), once the technologies written like a host are read as words
// (TECHNOLOGY_HOSTS): `Node.js/React`, `ASP.NET/Azure` or `Socket.IO` name no site
const HEADLINE_CONTACTS = [
	/[a-z][a-z0-9+.-]*:\/\/|www\./i,
	// .js and .ts are no domains: Node.js/React
	/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?!(?:js|ts)\/)[a-z]{2,24}\/\S/i,
	/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|dev|me|app|co|fr|eu|uk)\b(?!\.[a-z0-9])/i,
	/[^\s@]+@[^\s@]+\.[^\s@]{2,}/,
	/(?:\+?\d[\s.()-]?){9,}/
];

/**
 * Technologies written like a host, which name no site: a .NET library written as Microsoft
 * writes it (`ASP.NET`, `ML.NET`, `Akka.NET`), ASP.NET, ADO.NET and VB.NET in any case, and
 * Socket.IO. Only these, so that `behance.net/jane` and `jane.io` stay links, and only standing
 * alone (`jane@asp.net` is an email address)
 */
const TECHNOLOGY_HOSTS = [
	/(?<![@.\p{L}\p{N}_-])[\p{L}\p{N}]+\.NET\b/gu,
	/(?<![@.\p{L}\p{N}_-])(?:asp|ado|vb)\.net\b/giu,
	/(?<![@.\p{L}\p{N}_-])socket\.io\b/giu
];

/** Whether `text` (cleaned) has a link, an email address or a phone number (HEADLINE_CONTACTS) */
const hasContact = (text: string): boolean => {
	const read = TECHNOLOGY_HOSTS.reduce((words, technology) => words.replace(technology, ' '), text);
	return HEADLINE_CONTACTS.some((pattern) => pattern.test(read));
};

/**
 * A headline as it is kept: folded by NFKC (what looks like a letter or a sign is that letter or
 * that sign), nothing invisible (cleanIssueText), on one line, trimmed
 */
export const cleanHeadline = (value: string) =>
	cleanIssueText(value.normalize('NFKC')).replace(/\s+/g, ' ').trim();

/** Text compared without its case, its accents or its spacing */
const folded = (text: string) =>
	text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A sign that is neither a letter nor a digit: where a name starts or ends */
const NOT_WORD = '[^\\p{L}\\p{N}]';

/** Names shorter than this are words (`a`, `go`), not a way to find someone */
const MIN_NAME_LENGTH = 3;

/**
 * Whether `headline` names one of `names` (the candidate's name, the title of their portfolio, its
 * address name), whole, whatever its case, accents or spacing: `Jane Doe` in `jane doe, backend`,
 * `dev` not in `developer`. Names shorter than MIN_NAME_LENGTH are left out. The API refuses such a
 * headline (422 on `card.headline`): the card is anonymous until both sides are interested
 * (cardTextIdentifies, which also looks for companies, places and acronyms)
 */
export const headlineNames = (
	headline: string,
	names: readonly (string | null | undefined)[]
): boolean => {
	const text = folded(headline);
	return names.some((name) => {
		const key = typeof name === 'string' ? folded(name) : '';
		if (key.length < MIN_NAME_LENGTH) return false;
		return new RegExp(`(?:^|${NOT_WORD})${escapeRegExp(key)}(?:$|${NOT_WORD})`, 'u').test(text);
	});
};

/**
 * The card settings a client sent (untrusted), as they are kept, or the first rule they break:
 * the headline cleaned (cleanHeadline; empty is none), at most DISCOVERY_LIMITS.headline
 * characters, without a link, an email address or a phone number (the API also refuses one that
 * says who the candidate is, their name, their portfolio, a company or a place of their
 * experiences or of their perfect job: cardTextIdentifies); the hidden experiences a list of ids,
 * without duplicates, at most DISCOVERY_LIMITS.hiddenExperiences (the API keeps those of the
 * candidate's own portfolio)
 */
export const parseDiscoveryCard = (input: unknown): DiscoveryCardResult => {
	if (!isRecord(input)) return { ok: false, property: 'card', message: m.card.invalid };

	let headline: string | null = null;
	if (input.headline !== undefined && input.headline !== null) {
		if (typeof input.headline !== 'string') {
			return { ok: false, property: 'card.headline', message: m.card.headlineInvalid };
		}
		const cleaned = cleanHeadline(input.headline);
		if (cleaned.length > DISCOVERY_LIMITS.headline) {
			return {
				ok: false,
				property: 'card.headline',
				message: m.card.headlineTooLong(DISCOVERY_LIMITS.headline)
			};
		}
		if (hasContact(cleaned)) {
			return { ok: false, property: 'card.headline', message: m.card.headlineContact };
		}
		headline = cleaned || null;
	}

	const raw = input.hiddenExperiences ?? [];
	if (!Array.isArray(raw) || !raw.every((id) => typeof id === 'string' && OBJECT_ID.test(id))) {
		return { ok: false, property: 'card.hiddenExperiences', message: m.card.hiddenExperiences };
	}
	const hiddenExperiences = [...new Set(raw.map((id: string) => id.toLowerCase()))];
	if (hiddenExperiences.length > DISCOVERY_LIMITS.hiddenExperiences) {
		return {
			ok: false,
			property: 'card.hiddenExperiences',
			message: m.card.tooManyHidden(DISCOVERY_LIMITS.hiddenExperiences)
		};
	}
	return { ok: true, card: { headline, hiddenExperiences } };
};

// --- The anonymous card -------------------------------------------------------------------

/**
 * The criteria whose outcome an anonymous card never shows, whatever the candidate's journey shows
 * on their page for recruiters: the commute (it tells where they live) and the places they want to
 * work (no area or location before both sides are interested)
 */
export const CARD_WITHHELD_CRITERIA = ['commute', 'cities'] as const;

const withheldCriteria: ReadonlySet<PerfectJobCriterion> = new Set(CARD_WITHHELD_CRITERIA);

/**
 * The criteria, of those the candidate rates (`rated`, in order), whose outcome for a recruiter's
 * job their anonymous card shows: none unless the job match of their journey shows details
 * (`showDetails`), so that one setting decides what recruiters learn of a job's outcomes on both
 * paths (the candidate's link and matching), and never CARD_WITHHELD_CRITERIA
 */
export const cardOutcomeCriteria = (
	rated: readonly PerfectJobCriterion[],
	showDetails: boolean
): PerfectJobCriterion[] =>
	showDetails ? rated.filter((criterion) => !withheldCriteria.has(criterion)) : [];

/** What says who a candidate is, which their anonymous card never shows (cardIdentityNames) */
export interface CardIdentity {
	/** Their given name, as their account has it (a Google sign-in keeps none: few accounts have one) */
	name?: string | null;
	/** Their surname, as their account has it */
	surname?: string | null;
	/** The email address of their account: its local part is most often their name (`zoe.marchetti`) */
	email?: string | null;
	/** The title of their portfolio, and its address name */
	portfolio?: readonly (string | null | undefined)[];
	/** The companies of their experiences */
	companies?: readonly (string | null | undefined)[];
	/**
	 * The places of their experiences, as they typed them (`Lyon, France`), and those of their
	 * perfect job (the towns they want to work in, the town they travel from)
	 */
	places?: readonly (string | null | undefined)[];
}

/**
 * Words that stand for no company and no place, which a card's texts may use whatever the
 * experiences say: `Freelance backend developer` names no company, even when an experience's
 * company is `Freelance`; `Remote` is no place
 */
const GENERIC_NAMES: ReadonlySet<string> = new Set(
	[
		'freelance',
		'freelancer',
		'free-lance',
		'self-employed',
		'self employed',
		'independent',
		'indépendant',
		'indépendante',
		'auto-entrepreneur',
		'micro-entrepreneur',
		'consultant',
		'confidential',
		'confidentiel',
		'remote',
		'full remote',
		'fully remote',
		'télétravail',
		'hybrid',
		'hybride',
		'worldwide',
		'anywhere'
	].map(folded)
);

/**
 * Words that, alone, stand for nobody: never taken alone as a word of the candidate's name read in
 * their email address (`contact@`, `data.jane@`), nor as what is left of a company's name without
 * its legal form (`Data Group`), so that `Data engineer` stays on such a candidate's card
 */
const PLAIN_WORDS: ReadonlySet<string> = new Set(
	[
		'contact',
		'info',
		'infos',
		'hello',
		'bonjour',
		'mail',
		'email',
		'courriel',
		'pro',
		'perso',
		'personal',
		'work',
		'job',
		'jobs',
		'emploi',
		'career',
		'careers',
		'carrière',
		'admin',
		'office',
		'team',
		'dev',
		'developer',
		'data',
		'tech',
		'design',
		'web',
		'code',
		'hire',
		'recrutement',
		'resume',
		'candidature',
		'the',
		'and',
		'official',
		'software',
		'digital',
		'cloud',
		'consulting',
		'conseil',
		'solutions',
		'systems',
		'services',
		'global',
		'international',
		'partners',
		'studio',
		'agency'
	].map(folded)
);

/**
 * Legal forms and the words companies add to their name, left out to find the name itself: Acme
 * SAS, Acme Corporation and Acme Group are Acme
 */
const LEGAL_FORMS: ReadonlySet<string> = new Set([
	'sa',
	'sas',
	'sasu',
	'sarl',
	'eurl',
	'sci',
	'snc',
	'scop',
	'inc',
	'incorporated',
	'ltd',
	'limited',
	'llc',
	'llp',
	'plc',
	'corp',
	'corporation',
	'co',
	'company',
	'cie',
	'gmbh',
	'ag',
	'bv',
	'nv',
	'spa',
	'srl',
	'sl',
	'group',
	'groupe',
	'holding',
	'labs',
	'technology',
	'technologies'
]);

/** The words of a name written as one token (`zoe.marchetti92`, `zoe-marchetti`): its runs of letters */
const nameWords = (value: string): string[] =>
	value
		.normalize('NFC')
		.split(/[^\p{L}\p{M}]+/u)
		.filter(Boolean);

/**
 * A person's name as the phrases that write it: as written, its words spaced (`zoe marchetti` for
 * `zoe.marchetti`) and its last word first (`Marchetti Zoé`, as French résumés write a surname)
 */
const nameOrders = (value: string): string[] => {
	const words = nameWords(value);
	if (words.length < 2) return [value];
	const last = words[words.length - 1];
	return [value, words.join(' '), [last, ...words.slice(0, -1)].join(' ')];
};

/**
 * The names an email address stands for: its local part (without a `+tag`) in the orders of
 * nameOrders, and each of its words (`marchetti` of `zoe.marchetti92`), but those that stand for
 * nobody (PLAIN_WORDS); nothing when all of them do (`contact@`)
 */
const emailNames = (email: string): string[] => {
	const local = email.split('@')[0].split('+')[0].trim();
	const words = nameWords(local).filter((word) => !PLAIN_WORDS.has(folded(word)));
	return words.length === 0 ? [] : [...nameOrders(local), ...words];
};

/**
 * A company's name, and the same without its legal form when it has one (Acme for Acme S.A.S.),
 * unless what is left is a word that stands for nobody (Data Group stays whole)
 */
const companyNames = (name: string): string[] => {
	const words = folded(name)
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
	// Single letters too: S.A.S. is s, a, s
	const kept = words.filter((word) => word.length > 1 && !LEGAL_FORMS.has(word));
	if (kept.length === 0 || kept.length === words.length) return [name];
	return kept.length === 1 && PLAIN_WORDS.has(kept[0]) ? [name] : [name, kept.join(' ')];
};

/** A place as typed, and each of its parts (Lyon and France for `Lyon, France`) */
const placeNames = (place: string): string[] => [
	place,
	...place.split(/[,;/()|·•]|\s[-–—]\s/).map((part) => part.trim())
];

/**
 * An acronym of two signs, written in capitals (EY, HP, UK, 3M): a company or a part of a place
 * that short names it only so written, which is how a text must write it to name it (`Engineer,
 * EY`), never a word (`Chef de projet` does not name Berlin, DE)
 */
const isAcronym = (name: string): boolean => {
	const written = name.normalize('NFKC').trim();
	return /^[\p{Lu}\p{N}]{2}$/u.test(written) && /\p{Lu}/u.test(written);
};

/** Whether `text` (cleaned) has the acronym `acronym`, whole, as written (in capitals) */
const namesAcronym = (text: string, acronym: string): boolean =>
	new RegExp(
		`(?:^|${NOT_WORD})${escapeRegExp(acronym.normalize('NFKC').trim())}(?:$|${NOT_WORD})`,
		'u'
	).test(text);

/**
 * The names an anonymous card never shows, of the candidate `identity`, of MIN_NAME_LENGTH signs or
 * more: their name (given name and surname in both orders, and the surname alone), their email
 * address's local part (in both orders, and each word of it: the account's name is most often only
 * there), the title and address name of their portfolio (in both orders: `louis.gentil` is `gentil
 * louis`; never a word alone, an address may be `data-engineer`), the companies of their
 * experiences (also without their legal form: Acme for Acme SAS or Acme Corporation) and their
 * places and those of their perfect job (also each part: Lyon and France for `Lyon, France`), the
 * words that stand for no company or place left out (Freelance, Remote); and the acronyms of two
 * capitals among their companies and the parts of their places (EY, UK), which name them only so
 * written: what cardTextIdentifies looks for
 */
export const cardIdentityNames = ({
	name,
	surname,
	email,
	portfolio = [],
	companies = [],
	places = []
}: CardIdentity): string[] => {
	const text = (value: string | null | undefined): value is string =>
		typeof value === 'string' && value.trim() !== '';
	// Given name then surname, and the surname first (`MARCHETTI Zoé`), as they are: a surname may
	// have several words (`De La Fontaine`)
	const person =
		text(name) && text(surname) ? [`${name} ${surname}`, `${surname} ${name}`] : [name, surname];
	const companyList = companies.filter(text);
	const placeList = places.filter(text).flatMap(placeNames);
	const names = [
		...person.filter(text),
		...portfolio.filter(text).flatMap(nameOrders),
		...(text(surname) ? nameWords(surname) : []),
		...(text(email) ? emailNames(email) : []),
		...companyList.flatMap(companyNames),
		...placeList
	];
	const keep = new Map<string, string>();
	for (const value of names) {
		const key = folded(value);
		if (key.length >= MIN_NAME_LENGTH && !GENERIC_NAMES.has(key) && !keep.has(key)) {
			keep.set(key, value);
		}
	}
	for (const acronym of [...companyList, ...placeList].filter(isAcronym)) {
		const written = acronym.normalize('NFKC').trim();
		if (!keep.has(written)) keep.set(written, written);
	}
	return [...keep.values()];
};

/**
 * Whether `text`, which an anonymous card would show (its headline, a role title, a skill), says who
 * the candidate is or how to reach them: a link, an email address or a phone number, or one of
 * `names` (cardIdentityNames), whole, whatever its case, accents or spacing (headlineNames), an
 * acronym of two capitals only as written (EY in `Senior consultant EY`, not `ey`). The API leaves
 * such a text out of the card, and refuses such a headline (422 on `card.headline`): the card is
 * anonymous until both sides are interested
 */
export const cardTextIdentifies = (text: string, names: readonly string[]): boolean => {
	const cleaned = cleanHeadline(text);
	return (
		hasContact(cleaned) ||
		headlineNames(cleaned, names) ||
		names.some((name) => isAcronym(name) && namesAcronym(cleaned, name))
	);
};

// --- Jobs in matching --------------------------------------------------------------------

/**
 * The statuses a job in matching keeps it in: open (proposed to the candidates whose criteria it
 * meets) and on hold (in matching, proposed to nobody until it is open again). Turned on only for
 * an open job; filled, closed or back to draft, a job leaves matching (its recruiter turns it on
 * again once it is open)
 */
export const MATCHING_JOB_STATUSES: readonly JobStatus[] = [OPEN_JOB_STATUS, 'on_hold'];

/** Whether a job with this status stays in matching once it is in it (MATCHING_JOB_STATUSES) */
export const keepsMatching = (status: JobStatus): boolean => MATCHING_JOB_STATUSES.includes(status);

/** A posting's field a job in matching cannot do without, as the API names it in a 422 */
export type MatchingJobField = 'company' | 'description';

/**
 * What a job's posting lacks to be proposed through matching, the first of it, or null: the
 * company it hires for (candidates decide whether they are interested before they know who the
 * recruiter is: the company is what tells them who hires) and a description (what they read
 * before they decide). Its status is the API's to check: only an open job enters matching
 */
export const matchingJobProblem = (job: {
	company?: string | null;
	description?: string | null;
}): { field: MatchingJobField; message: string } | null => {
	if (!job.company?.trim()) return { field: 'company', message: m.job.companyRequired };
	if (!job.description?.trim()) return { field: 'description', message: m.job.descriptionRequired };
	return null;
};

// --- The review of a job in matching -------------------------------------------------------

/**
 * Where a job in matching stands with the reviewers (MATCHING_REVIEWERS, the operator's), who read
 * every job by hand before it reaches a candidate: `pending` (sent for review: proposed to nobody
 * yet), `approved` (proposed to the candidates whose criteria it meets) or `rejected` (with a
 * reason its recruiter reads). A review holds for the version of the posting it was of: a job
 * changed since (its description, or another field no criterion reads: its terms are locked) is
 * pending again, and so is one put back into matching changed since
 */
export const MATCHING_REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type MatchingReviewStatus = (typeof MATCHING_REVIEW_STATUSES)[number];

/** What a reviewer decides of a job pending review */
export const MATCHING_REVIEW_DECISIONS = ['approve', 'reject'] as const;
export type MatchingReviewDecision = (typeof MATCHING_REVIEW_DECISIONS)[number];

/**
 * Whether a job is proposed to candidates now, as far as the job itself says: open, in matching,
 * and approved by a reviewer (on hold, pending or rejected: nobody). The API adds the one thing the
 * job does not hold, that its recruiter accepted the terms in force (isLiveInMatching and
 * liveJobsQuery of server/services/jobMatching.ts): the rule the feeds, the decisions and the
 * counts follow
 */
export const jobLiveInMatching = (job: {
	status: JobStatus;
	matching?: { enabledAt?: Date | string | null; review?: { status?: string | null } | null } | null;
}): boolean =>
	job.status === OPEN_JOB_STATUS &&
	!!job.matching?.enabledAt &&
	job.matching.review?.status === 'approved';

/**
 * The reason a reviewer gave (untrusted text, read by the recruiter as it was written), as it is
 * kept, or the rule it breaks: cleaned (nothing invisible: cleanIssueText), on one line, trimmed;
 * required to reject a job, at most MATCHING_LIMITS.reviewReason characters, and left out of an
 * approval
 */
export const parseReviewReason = (
	decision: MatchingReviewDecision,
	reason: unknown
): { ok: true; reason: string | null } | { ok: false; message: string } => {
	if (decision === 'approve') return { ok: true, reason: null };
	const cleaned =
		typeof reason === 'string' ? cleanIssueText(reason).replace(/\s+/g, ' ').trim() : '';
	if (!cleaned) return { ok: false, message: m.review.reasonRequired };
	if (cleaned.length > MATCHING_LIMITS.reviewReason) {
		return { ok: false, message: m.review.reasonTooLong(MATCHING_LIMITS.reviewReason) };
	}
	return { ok: true, reason: cleaned };
};

// --- Matches ---------------------------------------------------------------------------------

/**
 * What one side says of the other: a candidate of a job proposed to them, a recruiter of a
 * candidate's anonymous card for their job. Both `interested` is a mutual interest, the only way a
 * portfolio is revealed; either `pass` ends it there
 */
export const MATCH_DECISIONS = ['interested', 'pass'] as const;
export type MatchDecision = (typeof MATCH_DECISIONS)[number];

/**
 * The two sides of a match: the candidate (a job proposed to them) and the recruiter (the
 * candidate's anonymous card proposed for their job). An account is one side of a match, never
 * both: a recruiter's own jobs are never proposed to them
 */
export const MATCH_SIDES = ['candidate', 'recruiter'] as const;
export type MatchSide = (typeof MATCH_SIDES)[number];

/**
 * Why a mutual interest ended: the candidate or the recruiter ended it, or its job left matching
 * for good (filled, closed or back to draft). A job deleted takes its mutual interests with it
 */
export const MATCH_END_REASONS = ['candidate', 'recruiter', 'job_closed'] as const;
export type MatchEndReason = (typeof MATCH_END_REASONS)[number];

/**
 * How long matching keeps what it records, the one place these numbers live: the TTL of each
 * match implements them (its `expiresAt`), the privacy policy states them.
 * - A decision no mutual interest came of (an interest the other side has not answered, a pass):
 *   at most `decisionMonths` after it was made, and less when its job closes, is deleted or leaves
 *   matching (an interest), or when the candidate withdraws (theirs, and recruiters' on them).
 * - A mutual interest, with what each side saw of the other then (its snapshot): while it lasts,
 *   then `endedMatchMonths` after it ended.
 * Discovery's own: its consent lapses after DISCOVERY_CONSENT_MONTHS, and a candidate is paused
 * after DISCOVERY_INACTIVITY_DAYS days without signing in.
 */
export const MATCH_RETENTION = {
	decisionMonths: 6,
	endedMatchMonths: 3
} as const;

/** When a decision made at `decidedAt` goes, at the latest: MATCH_RETENTION.decisionMonths later */
export const matchDecisionExpiry = (decidedAt: Date | string): Date =>
	addUtcMonths(decidedAt, MATCH_RETENTION.decisionMonths);

/** When a mutual interest that ended at `endedAt` goes: MATCH_RETENTION.endedMatchMonths later */
export const endedMatchExpiry = (endedAt: Date | string): Date =>
	addUtcMonths(endedAt, MATCH_RETENTION.endedMatchMonths);

// --- Helpers ---------------------------------------------------------------------------

const HOSTNAME =
	/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/**
 * The domain of an email address, lower case (`Jane@Acme.FR` → `acme.fr`): what a reviewer of
 * matching reads of who is behind a job (GET /matching/reviews). Never a candidate: nothing of the
 * recruiter reaches one before both sides are interested (the founder's decision). Null when
 * `email` is not an address with a domain name
 */
export const emailDomainOf = (email: unknown): string | null => {
	if (typeof email !== 'string') return null;
	const at = email.lastIndexOf('@');
	if (at <= 0) return null;
	const domain = email
		.slice(at + 1)
		.trim()
		.toLowerCase()
		.replace(/\.$/, '');
	return HOSTNAME.test(domain) ? domain : null;
};
