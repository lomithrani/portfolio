import { portfolioTextApi } from '#services';
import { errorStatus } from './apiErrors';
import { isNetworkFailure } from './recruiter';

// What a candidate still has to set up before they share the link of their portfolio, as the
// API decides it (GET /me/readiness, server/services/candidateReadiness.ts) and as the client
// shows it: the admin's "Get started" tab (StartTab.svelte), step 4 of the landing page's
// onboarding card ("Set your terms") and the owner's experiences page ("Get ready to share your
// link"). The API says what the account has, never what it holds; this file turns it into the
// items of one checklist, in its order, and what counts as done for each. Every item can be
// skipped: none blocks the others, nor sharing the link.

// --- Shapes ------------------------------------------------------------------------------

/** GET /me/readiness, read defensively: a field missing or of the wrong type reads as not set */
export interface Readiness {
	/** The address name of the portfolio the account owns; null until it claims one */
	domain: string | null;
	experiences: number;
	perfectJob: {
		criteria: number;
		essentials: { pay: boolean; workMode: boolean; place: boolean; contractTypes: boolean };
	};
	journey: {
		/** false: the default journey (a meeting step only), never saved by the owner */
		saved: boolean;
		types: string[];
		/**
		 * A step before the meeting can never succeed (a step that is not available anymore):
		 * recruiters never reach the meeting, and `gate` and `meeting` are false
		 */
		blocked: boolean;
		/** A job step, then a job match, then a meeting */
		gate: boolean;
		/** It leads to a meeting recruiters can reach */
		meeting: boolean;
	};
	calendar: {
		/** This site takes Google Calendar connections */
		configured: boolean;
		connected: boolean;
		/** Google refused the stored access: the owner connects again */
		reconnect: boolean;
		/** The appointment schedules turned on that have hours (weekly, or on a day of their own) */
		enabledSchedules: number;
	};
}

/** The essentials of a perfect job (Readiness.perfectJob.essentials), in the order they are shown */
export const ESSENTIALS = ['pay', 'workMode', 'place', 'contractTypes'] as const;
export type Essential = (typeof ESSENTIALS)[number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);
const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});
const flag = (value: unknown): boolean => value === true;
const count = (value: unknown): number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;

/** The readiness the API answered; null for an answer that is not one */
export const readReadiness = (data: unknown): Readiness | null => {
	if (!isRecord(data)) return null;
	const perfectJob = record(data.perfectJob);
	const essentials = record(perfectJob.essentials);
	const journey = record(data.journey);
	const calendar = record(data.calendar);
	return {
		domain: typeof data.domain === 'string' && data.domain ? data.domain : null,
		experiences: count(data.experiences),
		perfectJob: {
			criteria: count(perfectJob.criteria),
			essentials: {
				pay: flag(essentials.pay),
				workMode: flag(essentials.workMode),
				place: flag(essentials.place),
				contractTypes: flag(essentials.contractTypes)
			}
		},
		journey: {
			saved: flag(journey.saved),
			types: Array.isArray(journey.types)
				? journey.types.filter((type): type is string => typeof type === 'string')
				: [],
			blocked: flag(journey.blocked),
			gate: flag(journey.gate),
			meeting: flag(journey.meeting)
		},
		calendar: {
			configured: flag(calendar.configured),
			connected: flag(calendar.connected),
			reconnect: flag(calendar.reconnect),
			enabledSchedules: count(calendar.enabledSchedules)
		}
	};
};

// --- The checklist -----------------------------------------------------------------------

/**
 * The items of the checklist, in order: the experiences (résumé), what the owner wants (the
 * perfect job), the steps recruiters go through (the journey), the calendar they book in. Sharing
 * the link is what they lead to, not one of them: it is always offered, and never counted
 */
export const SETUP_ITEMS = ['resume', 'perfectJob', 'journey', 'calendar'] as const;
export type SetupItemId = (typeof SETUP_ITEMS)[number];

export interface SetupItem {
	id: SetupItemId;
	done: boolean;
	/**
	 * Counted in the progress: every item but the calendar on a site that takes no Google Calendar
	 * connection (nothing the owner can do about it)
	 */
	counted: boolean;
}

/**
 * Recruiters can book a slot (the calendar item is done): Google Calendar is connected on a site
 * that takes it, Google has not refused it since, and a meeting type turned on has hours to book.
 * Until then the meeting step offers no slot ("No online booking")
 */
export const calendarOpen = (calendar: Readiness['calendar']): boolean =>
	calendar.configured && calendar.connected && !calendar.reconnect && calendar.enabledSchedules > 0;

/**
 * Whether each item is done:
 * - resume: the portfolio has an experience;
 * - perfectJob: the pay is rated, the essential the gate journey asks recruiters for first (the
 *   other essentials are suggested, not required: what matters is the owner's to say);
 * - journey: the owner chose their steps (saved a journey, any journey, the gate or the meeting
 *   alone), and it leads to a meeting that no step before it blocks;
 * - calendar: Google Calendar is connected (and Google has not refused it since), with a meeting
 *   type turned on that has hours to book.
 */
export const setupItems = (readiness: Readiness): SetupItem[] => {
	const { experiences, perfectJob, journey, calendar } = readiness;
	const done: Record<SetupItemId, boolean> = {
		resume: experiences > 0,
		perfectJob: perfectJob.essentials.pay,
		journey: journey.saved && journey.meeting,
		calendar: calendarOpen(calendar)
	};
	return SETUP_ITEMS.map((id) => ({
		id,
		done: done[id],
		counted: id !== 'calendar' || calendar.configured
	}));
};

export interface SetupProgress {
	/** The counted items done */
	done: number;
	/** The counted items */
	total: number;
	complete: boolean;
}

const progressOf = (items: readonly SetupItem[]): SetupProgress => {
	const counted = items.filter((item) => item.counted);
	const done = counted.filter((item) => item.done).length;
	return { done, total: counted.length, complete: done === counted.length };
};

/** How far the checklist is: "2 of 4" */
export const setupProgress = (readiness: Readiness): SetupProgress =>
	progressOf(setupItems(readiness));

/**
 * How far the owner is in setting their terms, the landing card's step 4: the items after the
 * experiences (the perfect job, the journey, the calendar)
 */
export const termsProgress = (readiness: Readiness): SetupProgress =>
	progressOf(setupItems(readiness).filter((item) => item.id !== 'resume'));

/** The essentials of a perfect job not rated yet, in their order */
export const missingEssentials = (readiness: Readiness): Essential[] =>
	ESSENTIALS.filter((essential) => !readiness.perfectJob.essentials[essential]);

// --- The admin page's tabs ---------------------------------------------------------------

/**
 * The tabs of the admin page (/[domain]/admin), as `?tab=` names them: a link opens one
 * (/<domain>/admin?tab=start; the account menu's "Share your link": ?tab=share), and the page
 * keeps the one shown in its address
 */
export const ADMIN_TABS = [
	'start',
	'appearance',
	'workflows',
	'perfect-job',
	'appointments',
	'share'
] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

/** The tab `value` names (`?tab=`); undefined for anything else */
export const adminTab = (value: string | null | undefined): AdminTab | undefined =>
	ADMIN_TABS.find((tab) => tab === value);

/**
 * The tab the admin page opens on when its address names none: "Get started" while the checklist
 * is not complete, else the appearance. `readiness` null: it could not be read (the tab says so)
 */
export const defaultAdminTab = (readiness: Readiness | null): AdminTab =>
	readiness && setupProgress(readiness).complete ? 'appearance' : 'start';

// --- The link ----------------------------------------------------------------------------

/**
 * The link the owner shares: their portfolio's address on this site ("https://site/jane.doe",
 * which opens its experiences). `origin`: the site's (page.url.origin)
 */
export const portfolioLink = (origin: string, domain: string): string =>
	`${origin.replace(/\/+$/, '')}/${encodeURIComponent(domain)}`;

/** The link as it reads, without its scheme ("site/jane.doe") */
export const linkText = (link: string): string => link.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');

/**
 * Puts `text` on the clipboard; false when the browser refused (no permission, an insecure page,
 * no clipboard): the caller then lets the person copy it themselves
 */
export const copyText = async (
	text: string,
	/** The browser's when none is given; null: none */
	clipboard: Pick<Clipboard, 'writeText'> | null | undefined = globalThis.navigator?.clipboard
): Promise<boolean> => {
	try {
		if (!clipboard?.writeText) return false;
		await clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
};

// --- The request -------------------------------------------------------------------------

export type ReadinessResult =
	| { ok: true; readiness: Readiness }
	| { ok: false; reason: 'session-expired' | 'network' | 'error' };

/**
 * GET /me/readiness for the signed-in account. A 401 is only reported ('session-expired'): the
 * caller decides whether it signs the page out (the admin page does; the landing page does not)
 */
export const loadReadiness = async (signal?: AbortSignal): Promise<ReadinessResult> => {
	try {
		const { data, error } = await portfolioTextApi.me.readiness.get({
			fetch: { credentials: 'include', ...(signal ? { signal } : {}) }
		});
		if (error) {
			if (errorStatus(error) === 401) return { ok: false, reason: 'session-expired' };
			return { ok: false, reason: isNetworkFailure(error.value) ? 'network' : 'error' };
		}
		const readiness = readReadiness(data);
		return readiness ? { ok: true, readiness } : { ok: false, reason: 'error' };
	} catch {
		return { ok: false, reason: 'network' };
	}
};
