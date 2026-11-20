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
import { matchingMessages as m } from './matching.messages';
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
	/** Anonymous cards a recruiter gets per read of a job's feed */
	recruiterCardsPerRead: 5,
	/** Professional roles an anonymous card lists, at most */
	roles: 8,
	/** Skills an anonymous card lists, at most */
	skills: 15
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

/** When a discovery consent given at `grantedAt` lapses: DISCOVERY_CONSENT_MONTHS later */
export const discoveryConsentExpiry = (grantedAt: Date | string): Date => {
	const expiry = new Date(grantedAt);
	expiry.setUTCMonth(expiry.getUTCMonth() + DISCOVERY_CONSENT_MONTHS);
	return expiry;
};

/**
 * The latest grant that has lapsed at `now` (DISCOVERY_CONSENT_MONTHS before it): a consent given
 * after it is in force. What a database query of the candidates in force compares with
 */
export const discoveryConsentCutoff = (now = new Date()): Date => {
	const cutoff = new Date(now);
	cutoff.setUTCMonth(cutoff.getUTCMonth() - DISCOVERY_CONSENT_MONTHS);
	return cutoff;
};

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
// in: a link (a scheme, `www.`, or a host followed by a path, `linkedin.com/in/jane`, but not a
// technology such as `Node.js/React`: .js and .ts are no domains), an email address, and a phone
// number (9 digits or more, one separator at most between two of them). Tested on the headline as
// it is kept, folded by NFKC (`jane＠acme.fr` is `jane@acme.fr`)
const HEADLINE_CONTACTS = [
	/[a-z][a-z0-9+.-]*:\/\/|www\./i,
	/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?!(?:js|ts)\/)[a-z]{2,24}\/\S/i,
	/[^\s@]+@[^\s@]+\.[^\s@]{2,}/,
	/(?:\+?\d[\s.()-]?){9,}/
];

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
 * names the candidate or their portfolio: headlineNames); the hidden experiences a list of ids,
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
		if (HEADLINE_CONTACTS.some((pattern) => pattern.test(cleaned))) {
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

// --- Helpers ---------------------------------------------------------------------------

const HOSTNAME =
	/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/**
 * The domain of an email address, lower case (`Jane@Acme.FR` → `acme.fr`): what a candidate is
 * shown of who is behind a job before they say they are interested. Null when `email` is not an
 * address with a domain name
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
