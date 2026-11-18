import { get } from 'svelte/store';
import {
	RESERVED_DOMAIN_NAMES,
	legalMessages,
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
import { clearAuthentication, isSessionValid, readUser, termsVersionText } from './authentication';
import { disableGoogleAutoSelect } from './googleIdentity';
import { errorStatus } from './apiErrors';
import { accountMessages } from './account.messages';

// The account's spaces (portfolio-common USER_MODES): the candidate space is the portfolio of the
// domain it owns, the recruiter space its job descriptions (/recruiter). The active mode only
// decides what the client shows: the API authorises on what the account has.

const withCredentials = { fetch: { credentials: 'include' } } as const;

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
	return name || user?.email?.trim() || accountMessages.yourAccount;
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
	if (!name) return accountMessages.name.empty;
	if (isValidDomainName(name)) return null;
	if (RESERVED_DOMAIN_NAMES.has(name)) return accountMessages.name.reserved(name);
	if (name.length > DOMAIN_NAME_MAX_LENGTH) {
		return accountMessages.name.tooLong(DOMAIN_NAME_MAX_LENGTH);
	}
	if (!DOMAIN_NAME_CHARACTERS.test(name)) {
		return accountMessages.name.characters;
	}
	if (!/^[a-z0-9]/.test(name) || !/[a-z0-9]$/.test(name)) {
		return accountMessages.name.edges;
	}
	if (name.includes('..')) return accountMessages.name.doubleDot;
	if (FILE_LIKE_NAME.test(name)) return accountMessages.name.fileLike;
	return accountMessages.name.unusable;
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

/** The example name of the claim forms: their address preview while no name is typed, and their field's placeholder */
export const PORTFOLIO_NAME_PLACEHOLDER = 'jane.doe';

/**
 * The address a portfolio would have, as text for the claim forms' live preview:
 * "portfolio.example/jane.doe". `originOrHost` is the site's origin ("https://portfolio.example")
 * or host ("portfolio.example", `page.url.host`); the scheme is left out. The name is shown as it
 * would be claimed (trimmed, lower case), the example name (PORTFOLIO_NAME_PLACEHOLDER) while empty.
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
 * claim forms hide the age and terms checkbox when it did. The version may be a Date or its ISO
 * string (Eden's date parsing, termsVersionText).
 */
export const hasAcceptedCurrentTerms = (
	user: { termsVersion?: unknown } | null | undefined
): boolean => isCurrentTermsVersion(termsVersionText(user?.termsVersion));

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

/**
 * A 422 about the age and terms confirmation (`consent`, `consent.termsVersion`...): a claim or
 * the opening of the recruiter space without it, or a recruiter route of an account that has not
 * accepted the terms in force (its recruiter pages then ask to accept them, TermsAcceptance)
 */
export const isConsentProblem = (status: number | undefined, body: unknown): boolean =>
	status === 422 && /^consent(\.|$)/.test(bodyProperty(body));

/**
 * The message of a refused confirmation: the version this page sends is outdated (only a reload
 * helps), else `missing` (the form shows its checkbox)
 */
const consentMessage = (body: unknown, missing: string): string =>
	// The client always sends the version it was built with: a refused one is outdated
	bodyProperty(body) === 'consent.termsVersion' ? legalMessages.staleTerms : missing;

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
	if (status === 401) return accountMessages.sessionExpired;
	if (isConsentProblem(status, body)) return consentMessage(body, accountMessages.claim.consent);
	if (status === 409 && /already own/i.test(text)) {
		return accountMessages.claim.ownsPortfolio;
	}
	if (status === 409) return accountMessages.name.taken;
	if (status === 400 || status === 422) return accountMessages.name.unusable;
	return accountMessages.claim.failed;
};

/** The message shown when choosing a space failed for another reason than the session or network */
export const switchErrorMessage = (mode: UserMode): string =>
	mode === 'recruiter'
		? accountMessages.switchFailed.recruiter
		: accountMessages.switchFailed.candidate;

// --- API calls -----------------------------------------------------------------------------

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

/**
 * An account request: 401 clears the session, `refusal` says what another error was about (its
 * failure, or undefined for the plain `errorMessage`)
 */
const accountRequest = async <Failure extends AccountFailure = AccountFailure>(
	request: () => Promise<{ data: unknown; error: { status: unknown; value?: unknown } | null }>,
	errorMessage: string,
	refusal?: (status: number | undefined, value: unknown) => Failure | undefined
): Promise<{ ok: true; user: AuthUser } | AccountFailure | Failure> => {
	try {
		const { data, error } = await request();
		if (error) {
			const status = errorStatus(error);
			if (status === 401) {
				clearAuthentication();
				return failure('session-expired', accountMessages.sessionExpired);
			}
			return refusal?.(status, error.value) ?? failure('error', errorMessage);
		}
		const user = readUser(data);
		if (!user) return failure('error', errorMessage);
		storeUser(user);
		return { ok: true, user };
	} catch {
		return failure('network', accountMessages.networkError);
	}
};

export type SwitchFailure = AccountFailure & { cause?: 'consent' };
export type SwitchResult = { ok: true; user: AuthUser } | SwitchFailure;

/**
 * Makes `mode` the account's active space (PUT /me/mode): choosing 'recruiter' the first time
 * creates the recruiter space, which needs the terms in force: `consent` (the age and terms
 * checkbox ticked where the space is opened, portfolio-common currentConsent()) is required by
 * the API from an account that has not accepted them (hasAcceptedCurrentTerms), recorded from the
 * source 'recruiter'; without it the switch fails with the cause 'consent'. Updates the persisted
 * session with the account returned.
 */
export const switchMode = (mode: UserMode, consent?: ConsentInput): Promise<SwitchResult> =>
	accountRequest<SwitchFailure>(
		() => portfolioApi.me.mode.put({ mode, ...(consent ? { consent } : {}) }, withCredentials),
		switchErrorMessage(mode),
		(status, value) =>
			isConsentProblem(status, value)
				? {
						...failure('error', consentMessage(value, accountMessages.recruiter.consent)),
						cause: 'consent'
					}
				: undefined
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
	accountRequest(() => portfolioApi.me.get(withCredentials), accountMessages.loadFailed);

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
				return failure('session-expired', accountMessages.sessionExpired);
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
		return failure('network', accountMessages.networkError);
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
			return accountMessages.name.taken;
		case 'invalid':
		case 'reserved':
			return domainNameProblem(rawName) ?? accountMessages.name.unusable;
		case 'rate-limited':
			return accountMessages.name.tooManyChecks;
		case 'error':
			return accountMessages.name.notChecked;
	}
};

/** Where PUT /me/consent says the terms were accepted: a claim form, the account page, the recruiter space */
export type AcceptTermsSource = 'claim' | 'account' | 'recruiter';

/**
 * Records that the signed-in account accepts the Terms of use in force, with the age confirmation
 * (PUT /me/consent): for an account that signed in without the checkbox, or a recruiter whose
 * acceptance is older than the terms in force. `source` says where it was given. Updates the
 * persisted session with the account returned (its termsVersion).
 */
export const acceptTerms = async (
	source: AcceptTermsSource = 'account'
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
				return failure('session-expired', accountMessages.sessionExpired);
			}
			if (isConsentProblem(status, error.value)) return failure('error', legalMessages.staleTerms);
			return failure('error', accountMessages.acceptanceFailed);
		}
		const user = readUser(data);
		if (!user) return failure('error', accountMessages.acceptanceFailed);
		storeUser(user);
		return { ok: true, user };
	} catch {
		return failure('network', accountMessages.networkError);
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

/** How long deleteAccount waits for Google's automatic sign-in to be turned off */
export const GOOGLE_AUTO_SELECT_TIMEOUT_MS = 3000;

/** The API's 401 for a session whose account no longer exists (deleted, here or elsewhere) */
const UNKNOWN_USER = 'Unauthorized: unknown user';

/** Whether a failed request was refused because the session's account no longer exists */
const isUnknownUser = (error: { status: unknown; value?: unknown }): boolean =>
	errorStatus(error) === 401 && bodyText(error.value).trim() === UNKNOWN_USER;

/**
 * Deletes the signed-in account and everything tied to it (DELETE /me): its portfolio, hiring
 * journey, job postings, applications and schedules; the API asks Google to revoke its Google
 * Calendar access and ends the session. Then this browser forgets the account: the session, its
 * drafts (clearUserBrowserData) and Google's automatic sign-in. A 401 saying the account no longer
 * exists counts as deleted: a retry after a lost answer (the first request did delete it), or a
 * deletion from another tab. Any other 401 (the session expired) says nothing about the account.
 */
export const deleteAccount = async (): Promise<{ ok: true } | AccountFailure> => {
	const userId = get(authenticationStore).user?._id;
	try {
		const { error } = await portfolioApi.me.delete({ confirm: 'DELETE' }, withCredentials);
		if (error && !isUnknownUser(error)) {
			if (errorStatus(error) === 401) {
				clearAuthentication();
				return failure('session-expired', accountMessages.sessionExpired);
			}
			return failure('error', accountMessages.deleteFailed);
		}
	} catch {
		return failure('network', accountMessages.networkError);
	}
	if (userId) clearUserBrowserData(String(userId));
	clearAuthentication();
	// Loading Google's script can hang (a firewall dropping packets): the account is already gone,
	// so the page does not wait for it longer than this
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			disableGoogleAutoSelect(),
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, GOOGLE_AUTO_SELECT_TIMEOUT_MS);
			})
		]);
	} catch {
		// Only Google's automatic sign-in is left on: the account is gone either way
	} finally {
		clearTimeout(timer);
	}
	return { ok: true };
};
