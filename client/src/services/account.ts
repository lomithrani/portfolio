import { get } from 'svelte/store';
import {
	RESERVED_DOMAIN_NAMES,
	USER_MODE_LABELS,
	isValidDomainName,
	normalizeDomainName,
	type UserMode
} from 'portfolio-common';
import { portfolioApi } from '#services';
import { authenticationStore, type AuthUser } from './stores';
import { clearAuthentication } from './authentication';
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

/** Whether `pathname` is `base` or a page under it ('/recruiter/jobs/1' is under '/recruiter') */
export const isCurrentSection = (pathname: string, base: string): boolean =>
	pathname === base || pathname.startsWith(base.endsWith('/') ? base : `${base}/`);

const bodyText = (value: unknown): string => {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && 'message' in value) {
		return typeof value.message === 'string' ? value.message : '';
	}
	return '';
};

/**
 * What a failed POST /domain/claim was about: 'name' (invalid or already taken: the person picks
 * another one), 'owns-domain' (the account already owns a portfolio), or nothing else to fix.
 */
export type ClaimFailureCause = 'name' | 'owns-domain';

export const claimFailureCause = (
	status: number | undefined,
	body: unknown
): ClaimFailureCause | undefined => {
	if (status === 409) return /already own/i.test(bodyText(body)) ? 'owns-domain' : 'name';
	if (status === 400 || status === 422) return 'name';
	return undefined;
};

/** The claim form's message for a failed POST /domain/claim */
export const claimErrorMessage = (status: number | undefined, body: unknown): string => {
	const text = bodyText(body);
	if (status === 401) return SESSION_EXPIRED_MESSAGE;
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

/** Reloads the signed-in account (GET /me), e.g. once it claimed a domain */
export const refreshAccount = (): Promise<AccountResult> =>
	accountRequest(() => portfolioApi.me.get(withCredentials), 'Could not load your account.');

export type ClaimFailure = AccountFailure & { cause?: ClaimFailureCause };
export type ClaimResult = { ok: true; name: string } | ClaimFailure;

/**
 * Claims the portfolio `name` for the signed-in account (POST /domain/claim). The name is
 * normalised first and must pass domainNameProblem.
 */
export const claimPortfolio = async (rawName: string): Promise<ClaimResult> => {
	const name = normalizeDomainName(rawName);
	const problem = domainNameProblem(name);
	if (problem) return { ...failure('error', problem), cause: 'name' };
	try {
		const { error } = await portfolioApi.domain.claim.post({ name }, withCredentials);
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
		if (user) storeUser({ ...user, domain: name });
		return { ok: true, name };
	} catch {
		return failure('network', NETWORK_ERROR_MESSAGE);
	}
};
