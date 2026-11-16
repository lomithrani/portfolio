// Feedback: a signed-in person tells the site's maintainers about a problem or an idea, from the
// "Send feedback" dialog (the account menu, the footer of every page). The API classifies it
// (a bug, a feature request or a task) and files it as an issue of that type in the project's
// GitHub repository (POST /feedback), without the person's name. The rules are shared by the
// dialog (which shows them) and the API (which enforces them).
import { cleanIssueText } from './issueText';
import { feedbackMessages as m } from './feedback.messages';

export const FEEDBACK_LIMITS = {
	/** Shortest message filed, in characters once cleaned: "it's broken" says nothing yet */
	minMessage: 10,
	/** Longest message filed, in characters once cleaned */
	message: 4000,
	/** Longest route id taken as context */
	route: 120,
	/** Largest viewport side taken as context, in CSS pixels */
	viewport: 20_000
} as const;

/** What a feedback is filed as: each kind is an issue type of the repository */
export const FEEDBACK_KINDS = ['bug', 'feature', 'task'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** The GitHub issue type of each kind (the repository's types: Bug, Feature, Task) */
export const FEEDBACK_ISSUE_TYPES: Record<FeedbackKind, string> = {
	bug: 'Bug',
	feature: 'Feature',
	task: 'Task'
};

export const FEEDBACK_THEMES = ['light', 'dark'] as const;
export type FeedbackTheme = (typeof FEEDBACK_THEMES)[number];

/**
 * Where the feedback was written, sent by the dialog and filed with it. Nothing that names
 * anyone: the page is its SvelteKit route id (`/[domain]/experiences`, never the address name
 * of the portfolio), the screen is a size. The browser and the language are the API's to read
 * (its User-Agent and Accept-Language headers), never the client's
 */
export interface FeedbackContext {
	/** SvelteKit route id of the page, e.g. `/[domain]/experiences` or `/(app)/jobs/[id]` */
	route?: string;
	/** Size of the browser's viewport in CSS pixels */
	viewport?: { width: number; height: number };
	/** The page's colour scheme */
	theme?: FeedbackTheme;
}

export interface FeedbackInput {
	/** What the person wrote */
	message: string;
	context?: FeedbackContext;
}

export type FeedbackField = 'message';

export type FeedbackResult =
	| { ok: true; feedback: FeedbackInput }
	| { ok: false; field: FeedbackField; message: string };

// A route id is static segments, [params] (with SvelteKit's optional [[param]] and rest
// [...param]) and (groups): nothing that could mention, link or name anyone in the issue. It
// starts with one of the client's top-level route groups (client/src/routes), so a word typed in
// its place is not filed either
const ROUTE_ROOTS = String.raw`(?:\(site\)|\(app\)|\[domain\])`;
const ROUTE_SEGMENT = String.raw`(?:[a-z0-9-]+|\[{1,2}(?:\.\.\.)?[A-Za-z_][A-Za-z0-9_]*\]{1,2}|\([a-z0-9-]+\))`;
const ROUTE_ID = new RegExp(String.raw`^/${ROUTE_ROOTS}(?:/${ROUTE_SEGMENT})*$`);

/** Whether a value is a route id the issue may carry */
export const isFeedbackRoute = (value: unknown): value is string =>
	typeof value === 'string' && value.length <= FEEDBACK_LIMITS.route && ROUTE_ID.test(value);

const viewportSide = (value: unknown): value is number =>
	typeof value === 'number' &&
	Number.isInteger(value) &&
	value > 0 &&
	value <= FEEDBACK_LIMITS.viewport;

/**
 * The context as it is filed: what breaks a rule is left out (it is a help to the maintainers,
 * never a reason to refuse what the person wrote), unknown keys are dropped
 */
export function parseFeedbackContext(input: unknown): FeedbackContext {
	if (!input || typeof input !== 'object') return {};
	const { route, viewport, theme } = input as Record<string, unknown>;
	const context: FeedbackContext = {};
	if (isFeedbackRoute(route)) context.route = route;
	if (viewport && typeof viewport === 'object') {
		const { width, height } = viewport as Record<string, unknown>;
		if (viewportSide(width) && viewportSide(height)) context.viewport = { width, height };
	}
	if (typeof theme === 'string' && (FEEDBACK_THEMES as readonly string[]).includes(theme)) {
		context.theme = theme as FeedbackTheme;
	}
	return context;
}

/** The message as it is filed: one kind of line break, nothing invisible, trimmed */
export const cleanFeedbackText = cleanIssueText;

/**
 * The feedback as it is filed (cleaned, its context checked), or the rule its message breaks:
 * the rules are checked on the text that would reach the issue, so nothing invisible counts
 */
export function parseFeedback(input: { message?: unknown; context?: unknown }): FeedbackResult {
	const message = typeof input.message === 'string' ? cleanFeedbackText(input.message) : '';
	if (!message) return { ok: false, field: 'message', message: m.messageRequired };
	if (message.length < FEEDBACK_LIMITS.minMessage) {
		return { ok: false, field: 'message', message: m.messageTooShort(FEEDBACK_LIMITS.minMessage) };
	}
	if (message.length > FEEDBACK_LIMITS.message) {
		return { ok: false, field: 'message', message: m.messageTooLong(FEEDBACK_LIMITS.message) };
	}
	const context = parseFeedbackContext(input.context);
	return {
		ok: true,
		feedback: { message, ...(Object.keys(context).length > 0 ? { context } : {}) }
	};
}
