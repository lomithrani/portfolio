import {
	DISCOVERY_REJOIN_DAYS,
	currentDiscoveryConsent,
	discoveryConsentRenewable,
	intlLocale,
	legalMessages,
	parseDiscoveryCard,
	stepManifest,
	type DiscoveryCardSettings,
	type DiscoveryRequirement,
	type WorkflowStep
} from 'portfolio-common';
import { portfolioTextApi } from '#services';
import { bodyProperty, errorStatus } from './apiErrors';
import { sortExperiences } from './experienceDates';
import {
	matchingOff,
	readCardPreview,
	readDiscovery,
	retryAfterSeconds,
	type CardPreview,
	type DiscoveryStatus
} from './matching';
import { isNetworkFailure } from './recruiter';
import { addStep, addStepProblem } from './workflow';

// Discovery (Path 2, CLAUDE.md "Matching"), as the owner sets it in the admin's Perfect job tab
// (components/admin/discovery/DiscoverySettings.svelte) and the "Get started" tab mentions it: to
// be proposed to recruiters as an anonymous card, what is missing for it and what fixes each
// (the API decides it: GET /discovery's `missing`, checked again at the opt-in), the card's
// settings, the consent, and what the API answered. The API calls are here (the admin page owns
// the status, both tabs read it); the texts are the components'. While MATCHING is off every
// route answers a 404: `off`, and nothing of discovery shows.

/** Why a read failed: the session expired, no answer came, or the answer was not one */
export type DiscoveryReadFailure = 'session-expired' | 'network' | 'error';

/** GET /discovery, read: the status, matching off (show nothing), or why it could not be read */
export type DiscoveryLoad =
	| { kind: 'ready'; status: DiscoveryStatus }
	| { kind: 'off' }
	| { kind: 'failed'; reason: DiscoveryReadFailure };

/** GET /discovery/card, read */
export type CardPreviewLoad =
	| { kind: 'ready'; preview: CardPreview }
	| { kind: 'off' }
	| { kind: 'failed'; reason: DiscoveryReadFailure };

const withCredentials = (signal?: AbortSignal) =>
	({ fetch: { credentials: 'include', ...(signal ? { signal } : {}) } }) as const;

/** Why a read failed, from an Eden error (a 404 is matching off: the caller says nothing) */
const readFailure = (error: { status: unknown; value?: unknown }): DiscoveryReadFailure | 'off' => {
	const status = errorStatus(error);
	if (matchingOff(status)) return 'off';
	if (status === 401) return 'session-expired';
	return isNetworkFailure(error.value) ? 'network' : 'error';
};

/**
 * GET /discovery for the signed-in account: where it stands, what it misses, its card's settings.
 * A 401 is only reported: the caller decides whether it signs the page out (the admin page never
 * does for this: its tabs may hold what the owner typed)
 */
export const loadDiscovery = async (signal?: AbortSignal): Promise<DiscoveryLoad> => {
	try {
		const { data, error } = await portfolioTextApi.discovery.get(withCredentials(signal));
		if (error) {
			const failure = readFailure(error);
			return failure === 'off' ? { kind: 'off' } : { kind: 'failed', reason: failure };
		}
		const status = readDiscovery(data);
		return status ? { kind: 'ready', status } : { kind: 'failed', reason: 'error' };
	} catch {
		return { kind: 'failed', reason: 'network' };
	}
};

/** GET /discovery/card: the card as recruiters read it, and what it leaves out */
export const loadCardPreview = async (signal?: AbortSignal): Promise<CardPreviewLoad> => {
	try {
		const { data, error } = await portfolioTextApi.discovery.card.get(withCredentials(signal));
		if (error) {
			const failure = readFailure(error);
			return failure === 'off' ? { kind: 'off' } : { kind: 'failed', reason: failure };
		}
		const preview = readCardPreview(data);
		return preview ? { kind: 'ready', preview } : { kind: 'failed', reason: 'error' };
	} catch {
		return { kind: 'failed', reason: 'network' };
	}
};

// --- What a change answered ------------------------------------------------------------------

/**
 * Why a change of discovery failed (saving the card, turning it on or off):
 * - `requirement`: the opt-in misses what the API names (422 on `requirements.<requirement>`);
 * - `consent`: the consent was refused (422 on `consent...`: an older version of the terms, the
 *   page loaded before they changed, or not ticked), with the API's words;
 * - `headline`, `card`: the card's settings were refused (422 on `card.headline`, a headline that
 *   says who the candidate is, or on another setting), with the API's words;
 * - `wait`: turned on too soon after turning it off (DISCOVERY_REJOIN_DAYS), or too often today
 *   (429): `until` from its Retry-After, null without one;
 * - `off`: matching was turned off meanwhile (404);
 * - `session-expired`, `network`, `error`.
 */
export type DiscoveryFailure =
	| { kind: 'requirement'; requirement: DiscoveryRequirement }
	| { kind: 'consent'; message: string }
	| { kind: 'headline'; message: string }
	| { kind: 'card'; message: string }
	| { kind: 'wait'; until: Date | null }
	| { kind: 'off' }
	| { kind: 'session-expired' }
	| { kind: 'network' }
	| { kind: 'error' };

export type DiscoveryChange =
	{ ok: true; status: DiscoveryStatus } | { ok: false; failure: DiscoveryFailure };

const REQUIREMENT_PROPERTY = /^requirements\.([a-z]+)$/;

/** The validation message of a 422's body, as the API wrote it (in the visitor's language) */
const bodyMessage = (value: unknown): string =>
	value && typeof value === 'object' && 'message' in value && typeof value.message === 'string'
		? value.message
		: '';

/**
 * Why a change failed, from the API's status, body and headers (`now`: when the answer came, to
 * place a Retry-After). The bodies the client compares are none here: a 422 names its field
 * (`property`), whose message the API wrote in the visitor's language
 */
export const discoveryFailure = (
	status: number | undefined,
	value: unknown,
	headers?: unknown,
	now = new Date()
): DiscoveryFailure => {
	if (isNetworkFailure(value)) return { kind: 'network' };
	switch (status) {
		case 401:
			return { kind: 'session-expired' };
		case 404:
			return { kind: 'off' };
		case 422: {
			const property = bodyProperty(value);
			const message = bodyMessage(value);
			const requirement = REQUIREMENT_PROPERTY.exec(property)?.[1];
			if (requirement) {
				return { kind: 'requirement', requirement: requirement as DiscoveryRequirement };
			}
			if (property === 'consent.termsVersion') {
				return { kind: 'consent', message: legalMessages.staleTerms };
			}
			if (/^consent(\.|$)/.test(property)) {
				return { kind: 'consent', message: message || legalMessages.discoveryConsentRequired };
			}
			if (property === 'card.headline' && message) return { kind: 'headline', message };
			if (/^card(\.|$)/.test(property) && message) return { kind: 'card', message };
			return { kind: 'error' };
		}
		case 429: {
			const seconds = retryAfterSeconds(headers);
			return {
				kind: 'wait',
				until: seconds === undefined ? null : new Date(now.getTime() + seconds * 1000)
			};
		}
		default:
			return { kind: 'error' };
	}
};

/** A change's answer: the status it gave, or why it failed */
const changeResult = (result: {
	data: unknown;
	error: { status: unknown; value?: unknown } | null;
	headers?: unknown;
	response?: Response;
}): DiscoveryChange => {
	if (result.error) {
		return {
			ok: false,
			failure: discoveryFailure(
				errorStatus(result.error),
				result.error.value,
				result.response?.headers ?? result.headers
			)
		};
	}
	const status = readDiscovery(result.data);
	return status ? { ok: true, status } : { ok: false, failure: { kind: 'error' } };
};

const networkChange: DiscoveryChange = { ok: false, failure: { kind: 'network' } };

/** PUT /discovery: what the anonymous card shows (a headline, the experiences it leaves out) */
export const saveDiscoveryCard = async (card: DiscoveryCardSettings): Promise<DiscoveryChange> => {
	try {
		return changeResult(await portfolioTextApi.discovery.put({ card }, withCredentials()));
	} catch {
		return networkChange;
	}
};

/**
 * POST /discovery/consent with the consent the box stands for (portfolio-common's
 * currentDiscoveryConsent: 18 or over, under the terms in force): turns discovery on, or confirms
 * the consent again (its last DISCOVERY_CONSENT_RENEWAL_DAYS days, or once it lapsed)
 */
export const turnDiscoveryOn = async (): Promise<DiscoveryChange> => {
	try {
		return changeResult(
			await portfolioTextApi.discovery.consent.post(
				{ consent: currentDiscoveryConsent() },
				withCredentials()
			)
		);
	} catch {
		return networkChange;
	}
};

/** DELETE /discovery/consent: stops being proposed to recruiters, at once */
export const turnDiscoveryOff = async (): Promise<DiscoveryChange> => {
	try {
		return changeResult(
			await portfolioTextApi.discovery.consent.delete(undefined, withCredentials())
		);
	} catch {
		return networkChange;
	}
};

// --- Where the candidate stands --------------------------------------------------------------

/** DISCOVERY_REJOIN_DAYS, in milliseconds */
const REJOIN_MS = DISCOVERY_REJOIN_DAYS * 24 * 60 * 60_000;

/**
 * When discovery can be turned on again after a withdrawal made at `at` (the API holds an opt-in
 * back DISCOVERY_REJOIN_DAYS): what the page says once the owner turned it off
 */
export const rejoinDate = (at: Date): Date => new Date(at.getTime() + REJOIN_MS);

/**
 * What the consent box leads to, where the candidate stands: turning discovery on (off),
 * confirming the consent again (on or paused, in its last DISCOVERY_CONSENT_RENEWAL_DAYS days),
 * giving it again (lapsed), or nothing (on or paused, the consent in force for a while yet: the
 * box is not shown)
 */
export type ConsentAction = 'turn-on' | 'renew' | 'give-again' | null;

export const consentAction = (status: DiscoveryStatus, now = new Date()): ConsentAction => {
	switch (status.state) {
		case 'off':
			return 'turn-on';
		case 'lapsed':
			return 'give-again';
		default:
			return discoveryConsentRenewable(status.enabledAt, now) ? 'renew' : null;
	}
};

/** Whether discovery is on for the candidate (proposed, or paused for something missing) */
export const discoveryOn = (status: DiscoveryStatus): boolean =>
	status.state === 'on' || status.state === 'paused';

/**
 * What fixes a missing requirement, from the Perfect job tab: the account page (the terms), the
 * criteria above (how many are rated, the pay), the hiring journey (the gate's steps), the
 * calendar's settings (Google Calendar, a meeting type with hours), or nothing to do here (a
 * portfolio, which the admin page's owner has; activity, which signing in brings back)
 */
export type RequirementAction = 'account' | 'criteria' | 'pay' | 'journey' | 'appointments' | null;

export const requirementAction = (requirement: DiscoveryRequirement): RequirementAction => {
	switch (requirement) {
		case 'terms':
			return 'account';
		case 'criteria':
			return 'criteria';
		case 'pay':
			return 'pay';
		case 'journey':
			return 'journey';
		case 'calendar':
		case 'schedule':
			return 'appointments';
		default:
			return null;
	}
};

/**
 * What the Get started tab says of discovery (an item never counted: it is optional): `off`, `on`,
 * `renew` (on, its consent lapses within DISCOVERY_CONSENT_RENEWAL_DAYS), `paused` or `lapsed`
 */
export type DiscoverySummary = 'off' | 'on' | 'renew' | 'paused' | 'lapsed';

export const discoverySummary = (status: DiscoveryStatus, now = new Date()): DiscoverySummary => {
	if (status.state === 'on' && consentAction(status, now) === 'renew') return 'renew';
	return status.state;
};

// --- The hiring journey's steps --------------------------------------------------------------

/**
 * The steps discovery asks of a journey (the gate: a job step, then a job match, then a meeting,
 * whatever comes between them), in the order to add them so that each lands where it must: the
 * meeting first (an access step goes last), then the job and its match, which addStep puts before
 * the meeting, in that order
 */
const GATE_ORDER = ['meeting', 'job', 'job-match'] as const;

/** The gate's step types `steps` lacks, in the order to add them (none: it has all three) */
export const missingGateSteps = (steps: readonly { type: string }[]): string[] =>
	GATE_ORDER.filter((type) => !steps.some((step) => step.type === type));

/**
 * `steps` with the gate's missing steps added as the journey editor adds a step (addStep: ids
 * that no step saved (`reserved`) or edited holds, requirement steps before the meeting), each
 * only when it can be added (addStepProblem: the journey is not full): `added`, the steps added;
 * `refused`, the types that could not be
 */
export const withGateSteps = (
	steps: readonly WorkflowStep[],
	reserved: readonly { id: string }[] = []
): { steps: WorkflowStep[]; added: WorkflowStep[]; refused: string[] } => {
	let next = [...steps];
	const added: WorkflowStep[] = [];
	const refused: string[] = [];
	for (const type of missingGateSteps(steps)) {
		const manifest = stepManifest(type);
		if (!manifest || addStepProblem(next, manifest) !== null) {
			refused.push(type);
			continue;
		}
		const before = next;
		next = addStep(next, type, reserved);
		const step = next.find((entry) => !before.includes(entry));
		if (step) added.push(step);
	}
	return { steps: next, added, refused };
};

// --- The anonymous card's settings -----------------------------------------------------------

/** The card's settings as the form edits them: the headline as typed, the experiences hidden */
export interface CardForm {
	headline: string;
	hidden: string[];
}

export const cardForm = (card: DiscoveryStatus['card']): CardForm => ({
	headline: card.headline ?? '',
	hidden: [...card.hiddenExperiences]
});

/** What PUT /discovery is sent (the API cleans the headline again, and keeps its own ids only) */
export const cardSettings = (form: CardForm): DiscoveryCardSettings => ({
	headline: form.headline.trim() ? form.headline : null,
	hiddenExperiences: [...new Set(form.hidden)]
});

/** Whether the form differs from the settings saved (the headline as the API would keep it) */
export const cardChanged = (form: CardForm, card: DiscoveryStatus['card']): boolean => {
	const sent = parseDiscoveryCard(cardSettings(form));
	const headline = sent.ok ? sent.card.headline : form.headline;
	const hidden = new Set(form.hidden);
	return (
		(headline ?? null) !== (card.headline ?? null) ||
		hidden.size !== card.hiddenExperiences.length ||
		card.hiddenExperiences.some((id) => !hidden.has(id))
	);
};

/**
 * What portfolio-common's rules refuse in the form before it is sent (parseDiscoveryCard: a
 * headline too long, or with a link, an email address or a phone number): the API also refuses a
 * headline that says who the candidate is, which only it can tell (their name, their companies)
 */
export const cardProblem = (
	form: CardForm
): { field: 'headline' | 'card'; message: string } | null => {
	const result = parseDiscoveryCard(cardSettings(form));
	if (result.ok) return null;
	return {
		field: result.property === 'card.headline' ? 'headline' : 'card',
		message: result.message
	};
};

/** An experience of the portfolio, as the card's settings list it */
export interface CardExperience {
	id: string;
	title: string;
	/** Its company or school, when it names one */
	company: string | null;
}

interface PortfolioExperience {
	_id?: unknown;
	title?: unknown;
	company?: { name?: unknown } | null;
	start?: Date | string | null;
	end?: Date | string | null;
	projects?: readonly { start?: Date | string | null; end?: Date | string | null }[];
}

/**
 * The experiences of the portfolio the card reads (all of them: the roles are its professional
 * ones, the skills come from the projects of every one), in the order the experiences page lists
 * them, each with its id, title and company
 */
export const cardExperiences = (experiences: readonly PortfolioExperience[]): CardExperience[] =>
	sortExperiences(experiences).flatMap((experience) => {
		const id = typeof experience._id === 'string' ? experience._id : String(experience._id ?? '');
		if (!/^[0-9a-f]{24}$/i.test(id)) return [];
		const title = typeof experience.title === 'string' ? experience.title.trim() : '';
		const company =
			typeof experience.company?.name === 'string' && experience.company.name.trim()
				? experience.company.name.trim()
				: null;
		return [{ id, title, company }];
	});

/** A moment as the page says it: '28 Nov 2026, 14:05' (in the browser's time zone) */
export const formatMoment = (date: Date): string =>
	date.toLocaleString(intlLocale('en-GB'), {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
