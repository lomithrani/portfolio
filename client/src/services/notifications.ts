import { get, writable } from 'svelte/store';
import { portfolioTextApi } from '#services';
import { errorStatus } from './apiErrors';
import { matchingOff, readNotifications, type MatchNotifications } from './matching';
import { m } from './notifications.messages';

// What matching (Path 2, CLAUDE.md "Matching") brought that the signed-in account has not seen
// yet: its mutual interests going on, unseen, per side (GET /me/notifications), and whether
// matching is available at all (the route answers the 404 of a route that does not exist while
// MATCHING is off: nothing of matching shows then). In-app only, decision 10 of the founder: the
// account menu's badge (AccountMenu.svelte) is all there is, no email. Header.svelte starts the
// reads once signed in (startNotifications: at once, and each time the page comes back in view);
// the pages read again after what changes the counts (a decision, a mutual interest marked seen or
// ended). Nothing is stored in the browser.

/**
 * Whether matching is available: `on` (the route answered, with counts or asking for a session),
 * `off` (its 404: show nothing of matching), `unknown` before an answer (show nothing either)
 */
export type MatchingAvailability = 'unknown' | 'off' | 'on';

export interface NotificationsState {
	matching: MatchingAvailability;
	/** The mutual interests going on not seen yet, as a candidate and as a recruiter */
	unseen: MatchNotifications;
}

const NONE: MatchNotifications = { candidate: 0, recruiter: 0 };

export const initialNotifications: NotificationsState = { matching: 'unknown', unseen: NONE };

export const notificationsStore = writable<NotificationsState>(initialNotifications);

/** What GET /me/notifications answered */
export type NotificationsAnswer =
	| { kind: 'counts'; unseen: MatchNotifications }
	/** The 404 of a route that does not exist: matching is off */
	| { kind: 'off' }
	/** A 401: the route exists (matching is on), the visitor is signed out */
	| { kind: 'signed-out' }
	/** No usable answer (no answer at all, another status): what was known stays */
	| { kind: 'failed' };

/**
 * What an answer of GET /me/notifications means, from Eden's error (null: it answered) and data:
 * its counts (a count that is not one is none), matching off (a 404), signed out (a 401: the route
 * exists), or nothing usable
 */
export const notificationsAnswer = (
	error: { status: unknown; value?: unknown } | null | undefined,
	data: unknown
): NotificationsAnswer => {
	if (!error) {
		return data && typeof data === 'object'
			? { kind: 'counts', unseen: readNotifications(data) }
			: { kind: 'failed' };
	}
	const status = errorStatus(error);
	if (matchingOff(status)) return { kind: 'off' };
	if (status === 401) return { kind: 'signed-out' };
	return { kind: 'failed' };
};

/** The state once `answer` came: a failed read keeps what was known */
export const nextNotifications = (
	state: NotificationsState,
	answer: NotificationsAnswer
): NotificationsState => {
	switch (answer.kind) {
		case 'counts':
			return { matching: 'on', unseen: answer.unseen };
		case 'off':
			return { matching: 'off', unseen: NONE };
		case 'signed-out':
			return { matching: 'on', unseen: NONE };
		default:
			return state;
	}
};

const withCredentials = { fetch: { credentials: 'include' } } as const;

// The latest read: an answer of an older one (or of one before a sign-out) is dropped
let latest = 0;
// The account the counts are of (another account signed in starts from none)
let countedFor: string | undefined;

/**
 * Reads GET /me/notifications, signed in or not (a signed-out read only says whether matching is
 * available), and keeps its answer in notificationsStore. Never fails: a read that got no usable
 * answer keeps what was known
 */
export const refreshNotifications = async (): Promise<void> => {
	const id = ++latest;
	let answer: NotificationsAnswer;
	try {
		const { data, error } = await portfolioTextApi.me.notifications.get(withCredentials);
		answer = notificationsAnswer(error, data);
	} catch {
		answer = { kind: 'failed' };
	}
	if (id !== latest) return;
	notificationsStore.update((state) => nextNotifications(state, answer));
};

/**
 * Signed out: nothing is unseen anymore (whether matching is available stays known), and the
 * answers of reads still on their way are dropped
 */
export const resetNotifications = (): void => {
	latest++;
	countedFor = undefined;
	notificationsStore.update((state) => ({ ...state, unseen: NONE }));
};

/**
 * Whether the header asks for the counts: not once an answer said matching is off, for the rest
 * of the page's life (a reload asks again). Each read would be another 404 of a route that does not
 * exist in the API's metrics (`route: unmatched`), on every page of every signed-in account while
 * MATCHING is off
 */
export const notificationsWanted = (state: NotificationsState): boolean => state.matching !== 'off';

/**
 * Reads the counts of the account `userId` now, and again each time the page comes back in view
 * (the other side may have answered meanwhile, in another tab or on another device), unless
 * matching was found off. Returns what stops it. Each page's header starts it: the counts known
 * stay meanwhile, unless they are another account's
 */
export const startNotifications = (userId: string): (() => void) => {
	if (countedFor !== userId) {
		resetNotifications();
		countedFor = userId;
	}
	if (!notificationsWanted(get(notificationsStore))) return () => {};
	void refreshNotifications();
	const onVisible = () => {
		if (document.visibilityState !== 'visible') return;
		if (notificationsWanted(get(notificationsStore))) void refreshNotifications();
	};
	document.addEventListener('visibilitychange', onVisible);
	return () => document.removeEventListener('visibilitychange', onVisible);
};

/**
 * Whether matching is available, asked once when nothing answered yet (a page that changes its
 * words with it: the private page of a job description, signed out too)
 */
export const matchingAvailability = async (): Promise<MatchingAvailability> => {
	if (get(notificationsStore).matching === 'unknown') await refreshNotifications();
	return get(notificationsStore).matching;
};

/**
 * PUT /matches/:id/seen for each of `ids`: those mutual interests were shown to the account, they
 * no longer count in the badge; the counts are read again once. Returns the ids marked (one that
 * could not be marked counts until a later showing marks it)
 */
export const markMutualInterestsSeen = async (ids: readonly string[]): Promise<string[]> => {
	if (ids.length === 0) return [];
	const marked = await Promise.all(
		ids.map(async (id) => {
			try {
				const { error } = await portfolioTextApi
					.matches({ id })
					.seen.put(undefined, withCredentials);
				return error ? [] : [id];
			} catch {
				return [];
			}
		})
	);
	await refreshNotifications();
	return marked.flat();
};

// --- Texts -----------------------------------------------------------------------------------

/** The badge's visible text: '1 new' */
export const unseenBadgeText = (count: number): string => m.unseenBadge(count);

/** What the badge says to screen readers: '1 new mutual interest' */
export const unseenLabel = (count: number): string => m.unseenLabel(count);
