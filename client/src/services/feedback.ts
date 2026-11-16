import { writable } from 'svelte/store';
import type { FeedbackContext, FeedbackKind } from 'portfolio-common';
import { portfolioApi } from '#services';
import { isNetworkFailure, networkError } from './recruiter';
import { m } from './feedback.messages';

// "Send feedback" (components/feedback/): a signed-in person tells the maintainers about a problem
// or an idea, and the API classifies it and files it as a GitHub issue (GET/POST /feedback). One
// dialog per page (FeedbackDialog, mounted by Header.svelte), opened from the account menu or
// the footer (FeedbackButton): this module is what they share. The rules of the message are
// portfolio-common's parseFeedback; here, what the server takes and what its refusals mean.

const withCredentials = { fetch: { credentials: 'include' } } as const;

/** What GET /feedback says: whether the server files feedback, and whether Claude sorts it */
export interface FeedbackAvailability {
	enabled: boolean;
	classifies: boolean;
}

const unavailable: FeedbackAvailability = { enabled: false, classifies: false };

let availability: Promise<FeedbackAvailability> | undefined;

/**
 * Whether this server takes feedback, asked once per page load (the answer only changes with the
 * server's configuration). Without an answer, the openers stay away: nothing else depends on it
 */
export const feedbackAvailability = (): Promise<FeedbackAvailability> => {
	availability ??= portfolioApi.feedback
		.get(withCredentials)
		.then(({ data }) =>
			data ? { enabled: data.enabled === true, classifies: data.classifies === true } : unavailable
		)
		.catch(() => unavailable)
		.then((answer) => {
			// A server that could not be asked is asked again on the next opener's mount
			if (!answer.enabled) availability = undefined;
			return answer;
		});
	return availability;
};

/** Forgets the answer (tests) */
export const resetFeedbackAvailability = () => {
	availability = undefined;
};

// ── The dialog ──────────────────────────────────────────────

export interface FeedbackDialogState {
	open: boolean;
	/** Where the focus goes back once the dialog closes: the opener, or the account menu's trigger */
	returnFocus?: () => HTMLElement | null;
}

export const feedbackDialog = writable<FeedbackDialogState>({ open: false });

/** Opens the page's dialog; `returnFocus` finds where the focus goes back when it closes */
export const openFeedback = (returnFocus?: () => HTMLElement | null) =>
	feedbackDialog.set({ open: true, returnFocus });

export const closeFeedback = () => feedbackDialog.update((state) => ({ ...state, open: false }));

// ── What is sent ────────────────────────────────────────────

/**
 * Where the feedback is written: the page's route id (`/[domain]/experiences`, never the address
 * of the portfolio), the size of the window and the colour scheme. The API checks it again, and
 * reads the browser and the language from its own headers
 */
export const feedbackContext = (routeId: string | null | undefined): FeedbackContext => {
	const context: FeedbackContext = {};
	if (routeId) context.route = routeId;
	if (typeof window !== 'undefined') {
		const width = Math.round(window.innerWidth);
		const height = Math.round(window.innerHeight);
		if (width > 0 && height > 0) context.viewport = { width, height };
		context.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
	}
	return context;
};

export type FeedbackSent = { ok: true; kind: FeedbackKind; issueUrl?: string };

export interface FeedbackFailure {
	ok: false;
	message: string;
	/** The problem is about the message: shown under it */
	field?: 'message';
}

const bodyText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Why POST /feedback failed, as the dialog says it */
export const feedbackFailure = (status: number | undefined, value: unknown): FeedbackFailure => {
	if (isNetworkFailure(value)) return { ok: false, message: networkError() };
	const text = bodyText(value);
	switch (status) {
		case 401:
			// Said, not acted on: the text stays in the dialog, to be copied before signing in again
			return { ok: false, message: m.sessionExpired };
		case 404:
			return { ok: false, message: m.unavailable };
		case 422: {
			const problem = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
			const message = bodyText(problem.message);
			return problem.property === 'message' && message
				? { ok: false, message, field: 'message' }
				: { ok: false, message: m.checkMessage };
		}
		case 429:
			// The API says which limit (the account's or the site's) and when to come back
			return { ok: false, message: text || m.tooMany };
		case 503:
			return { ok: false, message: text || m.sendFailed };
		default:
			return { ok: false, message: m.sendFailed };
	}
};

const KINDS: readonly string[] = ['bug', 'feature', 'task'];

/** Sends a feedback already through parseFeedback */
export async function sendFeedback(
	message: string,
	context: FeedbackContext
): Promise<FeedbackSent | FeedbackFailure> {
	try {
		const { data, error } = await portfolioApi.feedback.post({ message, context }, withCredentials);
		if (error) {
			return feedbackFailure(
				typeof error.status === 'number' ? error.status : undefined,
				error.value
			);
		}
		const kind = data && KINDS.includes(data.kind) ? data.kind : 'task';
		const issueUrl =
			data && typeof data.issueUrl === 'string' && /^https:\/\/github\.com\//.test(data.issueUrl)
				? data.issueUrl
				: undefined;
		return { ok: true, kind, ...(issueUrl ? { issueUrl } : {}) };
	} catch {
		return { ok: false, message: networkError() };
	}
}
