import { get } from 'svelte/store';
import {
	RESERVED_DOMAIN_NAMES,
	STALE_TERMS_MESSAGE,
	USER_MODE_LABELS,
	currentConsent,
	isCurrentTermsVersion,
	isValidDomainName,
	normalizeDomainName,
	type ConsentInput,
	type UserMode
} from 'portfolio-common';
import { portfolioApi } from '#services';
import { authenticationStore, type AuthUser } from './stores';
import { clearAuthentication, isSessionValid } from './authentication';
import { disableGoogleAutoSelect } from './googleIdentity';
import { errorStatus } from './apiErrors';

// The account's spaces (portfolio-common USER_MODES): the candidate space is the portfolio of the
// domain it owns, the recruiter space its job descriptions (/recruiter). The active mode only
// decides what the client shows: the API authorises on what the account has.

const withCredentials = { fetch: { credentials: 'include' } } as const;

export const SESSION_EXPIRED_MESSAGE = 'Your session expired. Sign in again.';
export const NETWORK_ERROR_MESSAGE =
	'Could not reach the server. Check your connection and try again.';

/** Why an account request failed; 'session-expired' (401) has already cleared the session */
export type AccountFailureReason = 'session-expired' | 'network' | 'error';

export type AccountFailure = { ok: false; reason: AccountFailureReason; message: string };
export type AccountResult = { ok: true; user: AuthUser } | AccountFailure;

// --- Pure helpers ------------------------------------------------------------------------

/** Where a space starts: the recruiter's job descriptions, or the candidate's own portfolio */
export type SpaceHome = '/recruiter' | `/${string}/experiences`;

/**
 * The page a space opens on: '/recruiter' for the recruiter space, the portfolio's experiences for
 * a candidate who owns a domain, null for a candidate without one (they claim a portfolio first).
 */
export const spaceHome = (
	user: Pick<AuthUser, 'domain'> | null | undefined,
	mode: UserMode
): SpaceHome | null => {
	if (mode === 'recruiter') return '/recruiter';
	return user?.domain ? `/${user.domain}/experiences` : null;
};

/** "Recruiter", "Candidate", or null while the account has not chosen a space */
export const spaceLabel = (mode: UserMode | null | undefined): string | null =>
	mode ? USER_MODE_LABELS[mode] : null;

const words = (value: string | undefined) => (value ?? '').trim().split(/\s+/).filter(Boolean);

/** "Louis Gentil", else the email address, else "Your account" */
export const userDisplayName = (
	user: Pick<AuthUser, 'name' | 'surname' | 'email'> | null | undefined
): string => {
	const name = [...words(user?.name), ...words(user?.surname)].join(' ');
	return name || user?.email?.trim() || 'Your account';
};

const initial = (value: string) => Array.from(value)[0]?.toLocaleUpperCase() ?? '';

/**
 * Up to two letters for the avatar: name and surname ("LG"), else the first two words of the
 * name, else the parts of the email's local part ("rita.recruiter@…" → "RR"), else "?".
 */
export const userInitials = (
	user: Pick<AuthUser, 'name' | 'surname' | 'email'> | null | undefined
): string => {
	const name = words(user?.name);
	const surname = words(user?.surname);
	const parts =
		name.length || surname.length
			? [name[0], surname[0] ?? name[1]].filter((part): part is string => !!part)
			: (user?.email?.split('@')[0] ?? '').split(/[._+-]+/).filter(Boolean);
	return parts.slice(0, 2).map(initial).join('') || '?';
};

// Same rules as portfolio-common isValidDomainName, spelled out for the person typing
const FILE_LIKE_NAME = /\.[a-z0-9]{2,4}$/;
const DOMAIN_NAME_CHARACTERS = /^[a-z0-9.-]*$/;
export const DOMAIN_NAME_MAX_LENGTH = 63;

/**
 * Why a portfolio name cannot be claimed (null when it can): the API's rules
 * (isValidDomainName), as a message for the claim form.
 */
export const domainNameProblem = (raw: string): string | null => {
	const name = normalizeDomainName(raw);
	if (!name) return 'Enter a name for your portfolio.';
	if (isValidDomainName(name)) return null;
	if (RESERVED_DOMAIN_NAMES.has(name)) return `“${name}” is reserved. Choose another name.`;
	if (name.length > DOMAIN_NAME_MAX_LENGTH) {
		return `Use at most ${DOMAIN_NAME_MAX_LENGTH} characters.`;
	}
	if (!DOMAIN_NAME_CHARACTERS.test(name)) {
		return 'Use only lowercase letters, digits, dots and hyphens.';
	}
	if (!/^[a-z0-9]/.test(name) || !/[a-z0-9]$/.test(name)) {
		return 'Start and end with a letter or a digit.';
	}
	if (name.includes('..')) return 'Do not use two dots in a row.';
	if (FILE_LIKE_NAME.test(name)) return 'This name looks like a file name. Choose another one.';
	return 'This name cannot be used. Choose another one.';
};

const slug = (value: string) =>
	value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

/**
 * A portfolio name to start from: "louis.gentil" for Louis Gentil, else the email's local part
 * made valid; '' when nothing usable comes out (the person types one).
 */
export const suggestDomainName = (
	user: Pick<AuthUser, 'name' | 'surname' | 'email'> | null | undefined
): string => {
	const fromName = [slug(user?.name ?? ''), slug(user?.surname ?? '')].filter(Boolean).join('.');
	const fromEmail = (user?.email?.split('@')[0] ?? '')
		.split('.')
		.map(slug)
		.filter(Boolean)
		.join('.');
	for (const candidate of [fromName, fromEmail]) {
		const name = candidate.slice(0, DOMAIN_NAME_MAX_LENGTH).replace(/[.-]+$/, '');
		if (name && isValidDomainName(name)) return name;
	}
	return '';
};

/** What the address preview shows while no name is typed */
export const PORTFOLIO_NAME_PLACEHOLDER = 'your-name';

/**
 * The address a portfolio would have, as text for the claim forms' live preview:
 * "portfolio.example/jane.doe". `originOrHost` is the site's origin ("https://portfolio.example")
 * or host ("portfolio.example", `page.url.host`); the scheme is left out. The name is shown as it
 * would be claimed (trimmed, lower case), "your-name" while empty.
 */
export const portfolioUrlPreview = (originOrHost: string, rawName: string): string => {
	const host = originOrHost
		.trim()
		.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
		.replace(/\/.*$/, '');
	return `${host}/${normalizeDomainName(rawName) || PORTFOLIO_NAME_PLACEHOLDER}`;
};

/**
 * Whether the account accepted the Terms of use in force (portfolio-common LEGAL_VERSION): the
 * claim forms hide the age and terms checkbox when it did.
 */
export const hasAcceptedCurrentTerms = (
	user: Pick<AuthUser, 'termsVersion'> | null | undefined
): boolean => isCurrentTermsVersion(user?.termsVersion);

/** Whether `pathname` is `base` or a page under it ('/recruiter/jobs/1' is under '/recruiter') */
export const isCurrentSection = (pathname: string, base: string): boolean =>
	pathname === base || pathname.startsWith(base.endsWith('/') ? base : `${base}/`);

/** The portfolio (domain name) a page belongs to: its first path segment, lower case */
const portfolioOfPath = (pathname: string): string => {
	try {
		return decodeURIComponent(pathname.split('/')[1] ?? '').toLowerCase();
	} catch {
		return '';
	}
};

/**
 * The space to record (PUT /me/mode) for the page shown, so the account menu names it: 'recruiter'
 * on a /recruiter page for an account that has a recruiter space, 'candidate' on the account's
 * own portfolio, when another space is active; null otherwise. An account without a recruiter
 * space creates it from the page instead.
 */
export const spaceToRecord = (
	user: Pick<AuthUser, 'activeMode' | 'recruiter' | 'domain'> | null | undefined,
	pathname: string
): UserMode | null => {
	if (!user) return null;
	if (isCurrentSection(pathname, '/recruiter')) {
		return user.recruiter && user.activeMode !== 'recruiter' ? 'recruiter' : null;
	}
	const ownPortfolio = !!user.domain && portfolioOfPath(pathname) === user.domain.toLowerCase();
	return ownPortfolio && user.activeMode !== 'candidate' ? 'candidate' : null;
};

const bodyText = (value: unknown): string => {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && 'message' in value) {
		return typeof value.message === 'string' ? value.message : '';
	}
	return '';
};

/** The field a 422 validation error names (`property`), '' for any other body */
const bodyProperty = (value: unknown): string =>
	value && typeof value === 'object' && 'property' in value && typeof value.property === 'string'
		? value.property
		: '';

/** A 422 about the age and terms confirmation (`consent`, `consent.termsVersion`...) */
const isConsentProblem = (status: number | undefined, body: unknown): boolean =>
	status === 422 && /^consent(\.|$)/.test(bodyProperty(body));

/** The claim form's message when the API asks for the age and terms confirmation */
export const CLAIM_CONSENT_MESSAGE =
	'Confirm your age and accept the terms of use to create a portfolio.';

/**
 * What a failed POST /domain/claim was about: 'name' (invalid or already taken: the person picks
 * another one), 'owns-domain' (the account already owns a portfolio), 'consent' (the account has
 * not accepted the terms in force: the form shows the age and terms checkbox), or nothing else
 * to fix.
 */
export type ClaimFailureCause = 'name' | 'owns-domain' | 'consent';

export const claimFailureCause = (
	status: number | undefined,
	body: unknown
): ClaimFailureCause | undefined => {
	if (status === 409) return /already own/i.test(bodyText(body)) ? 'owns-domain' : 'name';
	if (isConsentProblem(status, body)) return 'consent';
	if (status === 400 || status === 422) return 'name';
	return undefined;
};

/** The claim form's message for a failed POST /domain/claim */
export const claimErrorMessage = (status: number | undefined, body: unknown): string => {
	const text = bodyText(body);
	if (status === 401) return SESSION_EXPIRED_MESSAGE;
	if (isConsentProblem(status, body)) {
		// The client always sends the version it was built with: a refused one is outdated
		return bodyProperty(body) === 'consent.termsVersion'
			? STALE_TERMS_MESSAGE
			: CLAIM_CONSENT_MESSAGE;
	}
	if (status === 409 && /already own/i.test(text)) {
		return 'Your account already owns a portfolio.';
	}
	if (status === 409) return 'This name is already taken. Choose another one.';
	if (status === 400 || status === 422) return 'This name cannot be used. Choose another one.';
	return 'Could not claim this portfolio. Try again.';
};

/** The message shown when choosing a space failed for another reason than the session or network */
export const switchErrorMessage = (mode: UserMode): string =>
	mode === 'recruiter'
		? 'Could not open your recruiter space. Try again.'
		: 'Could not switch to your candidate space. Try again.';

// --- API calls -----------------------------------------------------------------------------

const readUser = (data: unknown): AuthUser | undefined => {
	if (!data || typeof data !== 'object' || !('user' in data)) return undefined;
	const user = (data as { user?: unknown }).user;
	return user && typeof user === 'object' && '_id' in user ? (user as AuthUser) : undefined;
};

/**
 * Stores the account the API returned, keeping the session's expiry. Ignored when the session
 * ended or changed meanwhile (a logout during the request must not bring it back).
 */
const storeUser = (user: AuthUser) =>
	authenticationStore.update((auth) =>
		auth.user && String(auth.user._id) === String(user._id) ? { ...auth, user } : auth
	);

const failure = (reason: AccountFailureReason, message: string): AccountFailure => ({
	ok: false,
	reason,
	message
});

const accountRequest = async (
	request: () => Promise<{ data: unknown; error: { status: unknown; value?: unknown } | null }>,
	errorMessage: string
): Promise<AccountResult> => {
	try {
		const { data, error } = await request();
		if (error) {
			if (errorStatus(error) === 401) {
				clearAuthentication();
				return failure('session-expired', SESSION_EXPIRED_MESSAGE);
			}
			return failure('error', errorMessage);
		}
		const user = readUser(data);
		if (!user) return failure('error', errorMessage);
		storeUser(user);
		return { ok: true, user };
	} catch {
		return failure('network', NETWORK_ERROR_MESSAGE);
	}
};

/**
 * Makes `mode` the account's active space (PUT /me/mode): choosing 'recruiter' the first time
 * creates the recruiter space. Updates the persisted session with the account returned.
 */
export const switchMode = (mode: UserMode): Promise<AccountResult> =>
	accountRequest(
		() => portfolioApi.me.mode.put({ mode }, withCredentials),
		switchErrorMessage(mode)
	);

/** The space being recorded by recordSpaceShown: one request at a time per space */
let recording: UserMode | null = null;

/**
 * Records the space of the page shown (spaceToRecord) as the account's active one, once a
 * navigation to it ended: the layouts call it after every navigation (a link, a bookmark, the
 * account menu or the space chooser, which only navigate) and once the session is known. A
 * navigation the page kept (unsaved changes) records nothing, so the menu never names a space
 * the page is not in. A failure only leaves the menu's label as it was.
 */
export const recordSpaceShown = async (pathname: string): Promise<void> => {
	const auth = get(authenticationStore);
	if (!isSessionValid(auth)) return;
	const mode = spaceToRecord(auth.user, pathname);
	if (!mode || recording === mode) return;
	recording = mode;
	try {
		await switchMode(mode);
	} finally {
		recording = null;
	}
};

/** Reloads the signed-in account (GET /me), e.g. once it claimed a domain */
export const refreshAccount = (): Promise<AccountResult> =>
	accountRequest(() => portfolioApi.me.get(withCredentials), 'Could not load your account.');

export type ClaimFailure = AccountFailure & { cause?: ClaimFailureCause };
export type ClaimResult = { ok: true; name: string } | ClaimFailure;

/**
 * Claims the portfolio `name` for the signed-in account (POST /domain/claim). The name is
 * normalised first and must pass domainNameProblem. `consent` (the age and terms checkbox,
 * portfolio-common currentConsent()) is required by the API from an account that has not
 * accepted the terms in force (hasAcceptedCurrentTerms): without it the claim fails with the
 * cause 'consent'. Once claimed, the session's account has the domain (and the terms version
 * when consent was sent).
 */
export const claimPortfolio = async (
	rawName: string,
	consent?: ConsentInput
): Promise<ClaimResult> => {
	const name = normalizeDomainName(rawName);
	const problem = domainNameProblem(name);
	if (problem) return { ...failure('error', problem), cause: 'name' };
	try {
		const { error } = await portfolioApi.domain.claim.post(
			{ name, ...(consent ? { consent } : {}) },
			withCredentials
		);
		if (error) {
			const status = errorStatus(error);
			if (status === 401) {
				clearAuthentication();
				return failure('session-expired', SESSION_EXPIRED_MESSAGE);
			}
			const cause = claimFailureCause(status, error.value);
			return {
				...failure('error', claimErrorMessage(status, error.value)),
				...(cause ? { cause } : {})
			};
		}
		const user = get(authenticationStore).user;
		if (user) {
			storeUser({
				...user,
				domain: name,
				...(consent ? { termsVersion: consent.termsVersion } : {})
			});
		}
		return { ok: true, name };
	} catch {
		return failure('network', NETWORK_ERROR_MESSAGE);
	}
};

/** What the availability check says about a name: free, why not, or that it could not tell */
export type DomainAvailabilityStatus =
	'available' | 'taken' | 'invalid' | 'reserved' | 'error' | 'rate-limited';

export type DomainAvailabilityCheck = { status: DomainAvailabilityStatus };

const AVAILABILITY_REASONS = new Set<DomainAvailabilityStatus>(['taken', 'invalid', 'reserved']);

const readAvailability = (data: unknown): DomainAvailabilityStatus => {
	if (!data || typeof data !== 'object' || !('available' in data)) return 'error';
	if (data.available === true) return 'available';
	const reason = 'reason' in data ? data.reason : undefined;
	return AVAILABILITY_REASONS.has(reason as DomainAvailabilityStatus)
		? (reason as DomainAvailabilityStatus)
		: 'error';
};

/**
 * Asks the API whether the portfolio `name` can still be claimed (GET /domain/:name/availability,
 * public): a hint while typing, the claim decides. Call it only once domainNameProblem(name) is
 * null; an invalid or reserved name is answered here without a request. 'rate-limited' (429) and
 * 'error' (network, other failures, or `signal` aborted) mean the name could not be checked.
 */
export const checkDomainAvailability = async (
	rawName: string,
	signal?: AbortSignal
): Promise<DomainAvailabilityCheck> => {
	const name = normalizeDomainName(rawName);
	if (RESERVED_DOMAIN_NAMES.has(name)) return { status: 'reserved' };
	if (domainNameProblem(name)) return { status: 'invalid' };
	try {
		const { data, error } = await portfolioApi
			.domain({ name })
			.availability.get(signal ? { fetch: { signal } } : undefined);
		if (error) return { status: errorStatus(error) === 429 ? 'rate-limited' : 'error' };
		return { status: readAvailability(data) };
	} catch {
		return { status: 'error' };
	}
};

/** The line the claim forms show for an availability check of `rawName` (null while it is available) */
export const domainAvailabilityMessage = (
	status: DomainAvailabilityStatus,
	rawName: string
): string | null => {
	switch (status) {
		case 'available':
			return null;
		case 'taken':
			return 'This name is already taken. Choose another one.';
		case 'invalid':
		case 'reserved':
			return domainNameProblem(rawName) ?? 'This name cannot be used. Choose another one.';
		case 'rate-limited':
			return 'Too many checks for now: the name will be checked when you claim it.';
		case 'error':
			return 'Could not check this name: it will be checked when you claim it.';
	}
};

/**
 * Records that the signed-in account accepts the Terms of use in force, with the age confirmation
 * (PUT /me/consent): for an account that signed in without the checkbox. `source` says where it
 * was given. Updates the persisted session with the account returned (its termsVersion).
 */
export const acceptTerms = async (
	source: 'claim' | 'account' = 'account'
): Promise<AccountResult> => {
	try {
		const { data, error } = await portfolioApi.me.consent.put(
			{ ...currentConsent(), source },
			withCredentials
		);
		if (error) {
			const status = errorStatus(error);
			if (status === 401) {
				clearAuthentication();
				return failure('session-expired', SESSION_EXPIRED_MESSAGE);
			}
			if (isConsentProblem(status, error.value)) return failure('error', STALE_TERMS_MESSAGE);
			return failure('error', 'Could not record your acceptance. Try again.');
		}
		const user = readUser(data);
		if (!user) return failure('error', 'Could not record your acceptance. Try again.');
		storeUser(user);
		return { ok: true, user };
	} catch {
		return failure('network', NETWORK_ERROR_MESSAGE);
	}
};

/**
 * The localStorage keys this browser keeps for the account `userId`: its experience editor drafts
 * (`experienceDraft:<userId>:…`), résumé import reviews (`resumeImport:<userId>:…`), job
 * description drafts (`jobDraft:<userId>:…`) and job description import (`jobImportDraft:<userId>`).
 */
export const isUserStorageKey = (key: string, userId: string): boolean =>
	!!userId &&
	(key.startsWith(`experienceDraft:${userId}:`) ||
		key.startsWith(`resumeImport:${userId}:`) ||
		key.startsWith(`jobDraft:${userId}:`) ||
		key === `jobImportDraft:${userId}`);

type KeyedStorage = Pick<Storage, 'length' | 'key' | 'removeItem'>;

const browserStorage = (): KeyedStorage | undefined => {
	try {
		return globalThis.localStorage ?? undefined;
	} catch {
		return undefined;
	}
};

/**
 * Removes what this browser keeps for the account `userId` (isUserStorageKey). Storage that
 * cannot be read (private mode, blocked) is left as it is. Returns the keys removed.
 */
export const clearUserBrowserData = (
	userId: string,
	storage: KeyedStorage | undefined = browserStorage()
): string[] => {
	if (!storage || !userId) return [];
	try {
		const keys: string[] = [];
		for (let index = 0; index < storage.length; index++) {
			const key = storage.key(index);
			if (key !== null && isUserStorageKey(key, userId)) keys.push(key);
		}
		for (const key of keys) storage.removeItem(key);
		return keys;
	} catch {
		return [];
	}
};

export const DELETE_ACCOUNT_ERROR_MESSAGE = 'Could not delete your account. Try again.';

/**
 * Deletes the signed-in account and everything tied to it (DELETE /me): its portfolio, hiring
 * journey, job postings, applications and schedules; the API revokes its Google Calendar access
 * and ends the session. Then this browser forgets the account: the session, its drafts
 * (clearUserBrowserData) and Google's automatic sign-in.
 */
export const deleteAccount = async (): Promise<{ ok: true } | AccountFailure> => {
	const userId = get(authenticationStore).user?._id;
	try {
		const { error } = await portfolioApi.me.delete({ confirm: 'DELETE' }, withCredentials);
		if (error) {
			if (errorStatus(error) === 401) {
				clearAuthentication();
				return failure('session-expired', SESSION_EXPIRED_MESSAGE);
			}
			return failure('error', DELETE_ACCOUNT_ERROR_MESSAGE);
		}
	} catch {
		return failure('network', NETWORK_ERROR_MESSAGE);
	}
	if (userId) clearUserBrowserData(String(userId));
	clearAuthentication();
	try {
		await disableGoogleAutoSelect();
	} catch {
		// Only Google's automatic sign-in is left on: the account is gone either way
	}
	return { ok: true };
};
