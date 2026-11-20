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
	skills: 15,
	/** The reason a reviewer gives a recruiter for not accepting a job, in characters */
	reviewReason: 300,
	/** Jobs one read of the reviewers' list gives, the oldest request first */
	reviewsPerRead: 100
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
// in: a link (a scheme, `www.`, or a host followed by a path, `linkedin.com/in/jane`, but not a
// technology such as `Node.js/React` or `ASP.NET/Azure`: .js, .ts and .net there are no domains),
// an email address, and a phone number (9 digits or more, one separator at most between two of
// them). Tested on the text as the card keeps it, folded by NFKC (`jane＠acme.fr` is
// `jane@acme.fr`)
const HEADLINE_CONTACTS = [
	/[a-z][a-z0-9+.-]*:\/\/|www\./i,
	/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?!(?:js|ts|net)\/)[a-z]{2,24}\/\S/i,
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
 * `dev` not in `developer`. Names shorter than `minLength` (MIN_NAME_LENGTH unless said) are left
 * out. The API refuses such a headline (422 on `card.headline`): the card is anonymous until both
 * sides are interested (cardTextIdentifies, which also looks for companies and places)
 */
export const headlineNames = (
	headline: string,
	names: readonly (string | null | undefined)[],
	minLength = MIN_NAME_LENGTH
): boolean => {
	const text = folded(headline);
	return names.some((name) => {
		const key = typeof name === 'string' ? folded(name) : '';
		if (key.length < minLength) return false;
		return new RegExp(`(?:^|${NOT_WORD})${escapeRegExp(key)}(?:$|${NOT_WORD})`, 'u').test(text);
	});
};

/**
 * The card settings a client sent (untrusted), as they are kept, or the first rule they break:
 * the headline cleaned (cleanHeadline; empty is none), at most DISCOVERY_LIMITS.headline
 * characters, without a link, an email address or a phone number (the API also refuses one that
 * says who the candidate is, their name, their portfolio, a company or a place of their
 * experiences: cardTextIdentifies); the hidden experiences a list of ids,
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
	/** Their name, as their account has it */
	person?: string | null;
	/** The title of their portfolio, and its address name */
	portfolio?: readonly (string | null | undefined)[];
	/** The companies of their experiences */
	companies?: readonly (string | null | undefined)[];
	/** The places of their experiences, as they typed them (`Lyon, France`) */
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

/** Legal forms in a company's name, left out to find the name itself: Acme SAS is Acme */
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
	'ltd',
	'llc',
	'llp',
	'plc',
	'corp',
	'gmbh',
	'ag',
	'bv',
	'nv',
	'spa',
	'srl',
	'sl'
]);

/** A company's name, and the same without its legal form when it has one (Acme for Acme S.A.S.) */
const companyNames = (name: string): string[] => {
	const words = folded(name)
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
	// Single letters too: S.A.S. is s, a, s
	const kept = words.filter((word) => word.length > 1 && !LEGAL_FORMS.has(word));
	return kept.length > 0 && kept.length < words.length ? [name, kept.join(' ')] : [name];
};

/** A place as typed, and each of its parts (Lyon and France for `Lyon, France`) */
const placeNames = (place: string): string[] => [
	place,
	...place.split(/[,;/()|·•]|\s[-–—]\s/).map((part) => part.trim())
];

/** Names of two letters can name a company or a place (EY, HP, UK), never one of one */
const CARD_NAME_MIN_LENGTH = 2;

/**
 * The names an anonymous card never shows, of the candidate `identity`: their name, the title and
 * address name of their portfolio, the companies of their experiences (also without their legal
 * form: Acme for Acme SAS) and their places (also each part: Lyon and France for `Lyon, France`),
 * the words that stand for no company or place left out (Freelance, Remote): what
 * cardTextIdentifies looks for
 */
export const cardIdentityNames = ({
	person,
	portfolio = [],
	companies = [],
	places = []
}: CardIdentity): string[] => {
	const text = (value: string | null | undefined): value is string =>
		typeof value === 'string' && value.trim() !== '';
	const names = [
		...[person, ...portfolio].filter(text),
		...companies.filter(text).flatMap(companyNames),
		...places.filter(text).flatMap(placeNames)
	];
	const keep = new Map<string, string>();
	for (const name of names) {
		const key = folded(name);
		if (key.length >= CARD_NAME_MIN_LENGTH && !GENERIC_NAMES.has(key) && !keep.has(key)) {
			keep.set(key, name);
		}
	}
	return [...keep.values()];
};

/**
 * Whether `text`, which an anonymous card would show (its headline, a role title, a skill), says who
 * the candidate is or how to reach them: a link, an email address or a phone number, or one of
 * `names` (cardIdentityNames), whole, whatever its case, accents or spacing (headlineNames, from two
 * letters: EY, HP). The API leaves such a text out of the card, and refuses such a headline (422 on
 * `card.headline`): the card is anonymous until both sides are interested
 */
export const cardTextIdentifies = (text: string, names: readonly string[]): boolean => {
	const cleaned = cleanHeadline(text);
	return (
		HEADLINE_CONTACTS.some((pattern) => pattern.test(cleaned)) ||
		headlineNames(cleaned, names, CARD_NAME_MIN_LENGTH)
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
 * Whether a job is proposed to candidates now: open, in matching, and approved by a reviewer. The
 * one rule the feeds, the decisions and the counts follow (on hold, pending or rejected: nobody)
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
