import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { get } from 'svelte/store';

// vi.mock factories are hoisted — they cannot reference outer variables (but vi.hoisted ones)
const { mockAvailabilityGet } = vi.hoisted(() => ({ mockAvailabilityGet: vi.fn() }));

vi.mock('#services', () => ({
	portfolioApi: {
		me: { get: vi.fn(), delete: vi.fn(), mode: { put: vi.fn() }, consent: { put: vi.fn() } },
		// portfolioApi.domain({ name }).availability.get(), portfolioApi.domain.claim.post()
		domain: Object.assign(
			vi.fn(() => ({ availability: { get: mockAvailabilityGet } })),
			{ claim: { post: vi.fn() } }
		)
	}
}));

vi.mock('../stores', async () => {
	const { writable } = await import('svelte/store');
	return {
		authenticationStore: writable({ user: undefined, expires: undefined }),
		sessionCheckedStore: writable(false)
	};
});

vi.mock('../googleIdentity', () => ({
	disableGoogleAutoSelect: vi.fn(() => Promise.resolve())
}));

import { LEGAL_VERSION, STALE_TERMS_MESSAGE, currentConsent } from 'portfolio-common';
import {
	CLAIM_CONSENT_MESSAGE,
	DELETE_ACCOUNT_ERROR_MESSAGE,
	GOOGLE_AUTO_SELECT_TIMEOUT_MS,
	NETWORK_ERROR_MESSAGE,
	SESSION_EXPIRED_MESSAGE,
	acceptTerms,
	checkDomainAvailability,
	claimErrorMessage,
	claimFailureCause,
	claimPortfolio,
	clearUserBrowserData,
	deleteAccount,
	domainAvailabilityMessage,
	domainNameProblem,
	hasAcceptedCurrentTerms,
	isCurrentSection,
	isUserStorageKey,
	portfolioUrlPreview,
	recordSpaceShown,
	refreshAccount,
	spaceHome,
	spaceLabel,
	spaceToRecord,
	suggestDomainName,
	switchMode,
	userDisplayName,
	userInitials
} from '../account';
import { authenticationStore } from '../stores';
import { disableGoogleAutoSelect } from '../googleIdentity';
import { portfolioApi } from '#services';

const mockModePut = portfolioApi.me.mode.put as unknown as Mock;
const mockMeGet = portfolioApi.me.get as unknown as Mock;
const mockMeDelete = portfolioApi.me.delete as unknown as Mock;
const mockConsentPut = portfolioApi.me.consent.put as unknown as Mock;
const mockClaimPost = portfolioApi.domain.claim.post as unknown as Mock;
const mockDomain = portfolioApi.domain as unknown as Mock;

const withCredentials = { fetch: { credentials: 'include' } };
const expires = Math.floor(Date.now() / 1000) + 3600;
const user = { _id: 'user-1', email: 'rita@example.com', recruiter: false };
const loggedOut = { user: undefined, expires: undefined };
const apiError = (status: number, value: unknown = 'error') => ({
	data: null,
	error: { status, value }
});

beforeEach(() => {
	vi.clearAllMocks();
	authenticationStore.set({ user: { ...user }, expires });
});

describe('spaceHome', () => {
	it('opens the recruiter space on /recruiter, with or without a domain', () => {
		expect(spaceHome({ domain: 'jane' }, 'recruiter')).toBe('/recruiter');
		expect(spaceHome({}, 'recruiter')).toBe('/recruiter');
		expect(spaceHome(undefined, 'recruiter')).toBe('/recruiter');
	});

	it('opens the candidate space on the portfolio the account owns', () => {
		expect(spaceHome({ domain: 'jane.doe' }, 'candidate')).toBe('/jane.doe/experiences');
	});

	it('has no candidate home without a domain', () => {
		expect(spaceHome({}, 'candidate')).toBeNull();
		expect(spaceHome(null, 'candidate')).toBeNull();
	});
});

describe('spaceLabel', () => {
	it('names the chosen space', () => {
		expect(spaceLabel('candidate')).toBe('Candidate');
		expect(spaceLabel('recruiter')).toBe('Recruiter');
		expect(spaceLabel(undefined)).toBeNull();
	});
});

describe('userDisplayName and userInitials', () => {
	it('uses the name and surname', () => {
		const louis = { name: 'Louis', surname: 'Gentil', email: 'l@example.com' };
		expect(userDisplayName(louis)).toBe('Louis Gentil');
		expect(userInitials(louis)).toBe('LG');
	});

	it('falls back to the email address', () => {
		expect(userDisplayName({ email: 'rita.recruiter@example.com' })).toBe(
			'rita.recruiter@example.com'
		);
		expect(userInitials({ email: 'rita.recruiter@example.com' })).toBe('RR');
		expect(userInitials({ email: 'rita@example.com' })).toBe('R');
	});

	it('uses two words of a name without a surname, and accented letters', () => {
		expect(userInitials({ name: 'émile zola' })).toBe('ÉZ');
		expect(userInitials({ name: 'Cher' })).toBe('C');
	});

	it('never returns an empty label', () => {
		expect(userDisplayName(undefined)).toBe('Your account');
		expect(userDisplayName({ name: '  ', email: ' ' })).toBe('Your account');
		expect(userInitials({})).toBe('?');
	});
});

describe('domainNameProblem', () => {
	it('accepts the names the API accepts, in any case', () => {
		expect(domainNameProblem('jane.doe')).toBeNull();
		expect(domainNameProblem('  Jane-Doe42 ')).toBeNull();
		expect(domainNameProblem('a')).toBeNull();
	});

	it('explains why a name cannot be used', () => {
		expect(domainNameProblem('   ')).toBe('Enter a name for your portfolio.');
		expect(domainNameProblem('recruiter')).toMatch(/reserved/);
		expect(domainNameProblem('jobs')).toMatch(/reserved/);
		expect(domainNameProblem('jane doe')).toMatch(/lowercase letters, digits, dots and hyphens/);
		expect(domainNameProblem('jané')).toMatch(/lowercase letters/);
		expect(domainNameProblem('-jane')).toMatch(/Start and end/);
		expect(domainNameProblem('jane.')).toMatch(/Start and end/);
		expect(domainNameProblem('jane..doe')).toMatch(/two dots/);
		expect(domainNameProblem('config.json')).toMatch(/file name/);
		expect(domainNameProblem('a'.repeat(64))).toMatch(/at most 63/);
	});
});

describe('suggestDomainName', () => {
	it('suggests name.surname, without accents or spaces', () => {
		expect(suggestDomainName({ name: 'Louis', surname: 'Gentil' })).toBe('louis.gentil');
		expect(suggestDomainName({ name: 'Émile', surname: 'de La Tour' })).toBe('emile.de-la-tour');
	});

	it('falls back to the email local part', () => {
		expect(suggestDomainName({ email: 'Rita.Recruiter+jobs@example.com' })).toBe(
			'rita.recruiter-jobs'
		);
	});

	it('returns an empty name when nothing valid comes out', () => {
		expect(suggestDomainName({ name: '日本', email: '' })).toBe('');
		expect(suggestDomainName({ email: 'jobs@example.com' })).toBe('');
		expect(suggestDomainName(undefined)).toBe('');
	});

	it('keeps suggestions within the length limit', () => {
		const name = suggestDomainName({ name: 'a'.repeat(40), surname: 'b'.repeat(40) });
		expect(name.length).toBeLessThanOrEqual(63);
		expect(domainNameProblem(name)).toBeNull();
	});
});

describe('isCurrentSection', () => {
	it('matches the section and the pages under it only', () => {
		expect(isCurrentSection('/recruiter', '/recruiter')).toBe(true);
		expect(isCurrentSection('/recruiter/jobs/1', '/recruiter')).toBe(true);
		expect(isCurrentSection('/recruiters', '/recruiter')).toBe(false);
		expect(isCurrentSection('/jobs', '/recruiter')).toBe(false);
	});
});

describe('spaceToRecord', () => {
	it('records the recruiter space entered by a link while another space is active', () => {
		const user = { recruiter: true, activeMode: 'candidate' as const };
		expect(spaceToRecord(user, '/recruiter')).toBe('recruiter');
		expect(spaceToRecord(user, '/recruiter/jobs/1/edit')).toBe('recruiter');
		expect(spaceToRecord({ recruiter: true }, '/recruiter')).toBe('recruiter');
	});

	it('records nothing when the space is already active, missing, or not shown', () => {
		expect(spaceToRecord({ recruiter: true, activeMode: 'recruiter' }, '/recruiter')).toBeNull();
		// Without a recruiter space the page offers to create it: entering it creates nothing
		expect(spaceToRecord({ recruiter: false, activeMode: 'candidate' }, '/recruiter')).toBeNull();
		expect(spaceToRecord({ activeMode: 'candidate' }, '/recruiter')).toBeNull();
		expect(spaceToRecord({ recruiter: true, activeMode: 'candidate' }, '/jobs')).toBeNull();
		expect(spaceToRecord({ recruiter: true, activeMode: 'candidate' }, '/recruiters')).toBeNull();
		expect(spaceToRecord(undefined, '/recruiter')).toBeNull();
	});

	it("records the candidate space on the account's own portfolio while another space is active", () => {
		const both = { recruiter: true, domain: 'bo.both', activeMode: 'recruiter' as const };
		expect(spaceToRecord(both, '/bo.both/experiences')).toBe('candidate');
		expect(spaceToRecord(both, '/BO.both')).toBe('candidate');
		expect(spaceToRecord({ domain: 'bo.both' }, '/bo.both/admin')).toBe('candidate');
		// Already active, someone else's portfolio, or a page of no space
		expect(spaceToRecord({ ...both, activeMode: 'candidate' }, '/bo.both/experiences')).toBeNull();
		expect(spaceToRecord(both, '/someone.else/experiences')).toBeNull();
		expect(spaceToRecord(both, '/bo.both2/experiences')).toBeNull();
		expect(spaceToRecord(both, '/jobs')).toBeNull();
		expect(spaceToRecord({ ...both, domain: undefined }, '/bo.both/experiences')).toBeNull();
	});
});

describe('recordSpaceShown', () => {
	const recruiter = { ...user, recruiter: true, domain: 'rita', activeMode: 'candidate' as const };

	it('records the space of the page shown, once while a request is in flight', async () => {
		authenticationStore.set({ user: recruiter, expires });
		mockModePut.mockResolvedValue({
			data: { user: { ...recruiter, activeMode: 'recruiter' } },
			error: null
		});

		await Promise.all([recordSpaceShown('/recruiter/jobs/new'), recordSpaceShown('/recruiter')]);

		expect(mockModePut).toHaveBeenCalledTimes(1);
		expect(mockModePut).toHaveBeenCalledWith({ mode: 'recruiter' }, withCredentials);
		expect(get(authenticationStore).user?.activeMode).toBe('recruiter');
		// Back on the account's portfolio: the candidate space
		mockModePut.mockResolvedValue({ data: { user: recruiter }, error: null });
		await recordSpaceShown('/rita/experiences');
		expect(mockModePut).toHaveBeenLastCalledWith({ mode: 'candidate' }, withCredentials);
	});

	it('records nothing on a page of no space, the active one, or signed out', async () => {
		authenticationStore.set({ user: recruiter, expires });
		await recordSpaceShown('/jobs');
		await recordSpaceShown('/rita/experiences');
		authenticationStore.set(loggedOut);
		await recordSpaceShown('/recruiter');
		expect(mockModePut).not.toHaveBeenCalled();
	});
});

describe('claimErrorMessage', () => {
	it('tells a taken name from an account that already owns a portfolio', () => {
		expect(claimErrorMessage(409, 'Domain already exists')).toMatch(/already taken/);
		expect(claimErrorMessage(409, 'You already own a domain')).toMatch(/already owns/);
		expect(claimErrorMessage(409, { message: 'You already own a domain' })).toMatch(/already owns/);
	});

	it('covers invalid names, expired sessions and other failures', () => {
		expect(claimErrorMessage(400, 'Invalid domain name')).toMatch(/cannot be used/);
		expect(claimErrorMessage(401, 'Unauthorized')).toBe(SESSION_EXPIRED_MESSAGE);
		expect(claimErrorMessage(500, 'Internal')).toMatch(/Try again/);
		expect(claimErrorMessage(undefined, null)).toMatch(/Try again/);
	});

	it('asks for the confirmation, or a reload when the terms changed', () => {
		const validation = (property: string, message = 'Expected required property') => ({
			type: 'validation',
			on: 'body',
			property,
			message
		});
		expect(claimErrorMessage(422, validation('consent'))).toBe(CLAIM_CONSENT_MESSAGE);
		expect(claimErrorMessage(422, validation('consent.ageConfirmed'))).toBe(CLAIM_CONSENT_MESSAGE);
		expect(claimErrorMessage(422, validation('consent.termsVersion'))).toBe(STALE_TERMS_MESSAGE);
	});
});

describe('claimFailureCause', () => {
	it('tells what the person can fix', () => {
		expect(claimFailureCause(409, 'Domain already exists')).toBe('name');
		expect(claimFailureCause(400, 'Invalid domain name')).toBe('name');
		expect(claimFailureCause(422, { message: 'Expected string' })).toBe('name');
		expect(claimFailureCause(409, 'You already own a domain')).toBe('owns-domain');
		expect(claimFailureCause(401, 'Unauthorized')).toBeUndefined();
		expect(claimFailureCause(503, 'Unavailable')).toBeUndefined();
	});

	it('tells a missing or outdated age and terms confirmation from a bad name', () => {
		const validation = (property: string) => ({
			type: 'validation',
			on: 'body',
			property,
			message: 'x'
		});
		expect(claimFailureCause(422, validation('consent'))).toBe('consent');
		expect(claimFailureCause(422, validation('consent.termsVersion'))).toBe('consent');
		expect(claimFailureCause(422, validation('consent.ageConfirmed'))).toBe('consent');
		expect(claimFailureCause(422, validation('consentful'))).toBe('name');
		expect(claimFailureCause(422, validation('name'))).toBe('name');
	});
});

describe('switchMode', () => {
	it('records the space and stores the account returned, keeping the expiry', async () => {
		const updated = { ...user, activeMode: 'recruiter', recruiter: true };
		mockModePut.mockResolvedValue({ data: { user: updated }, error: null });

		await expect(switchMode('recruiter')).resolves.toEqual({ ok: true, user: updated });
		expect(mockModePut).toHaveBeenCalledWith({ mode: 'recruiter' }, withCredentials);
		expect(get(authenticationStore)).toEqual({ user: updated, expires });
	});

	it('clears the session on 401', async () => {
		mockModePut.mockResolvedValue(apiError(401));

		await expect(switchMode('candidate')).resolves.toEqual({
			ok: false,
			reason: 'session-expired',
			message: SESSION_EXPIRED_MESSAGE
		});
		expect(get(authenticationStore)).toEqual(loggedOut);
	});

	it('keeps the session on other errors', async () => {
		mockModePut.mockResolvedValue(apiError(503));

		const result = await switchMode('recruiter');
		expect(result).toMatchObject({ ok: false, reason: 'error' });
		expect(result.ok ? '' : result.message).toMatch(/recruiter space/);
		expect(get(authenticationStore).user).toEqual(user);
	});

	it('reports a network failure', async () => {
		mockModePut.mockRejectedValue(new TypeError('Failed to fetch'));

		await expect(switchMode('candidate')).resolves.toEqual({
			ok: false,
			reason: 'network',
			message: NETWORK_ERROR_MESSAGE
		});
	});

	it('does not bring back a session that ended during the request', async () => {
		mockModePut.mockImplementation(async () => {
			authenticationStore.set({ ...loggedOut });
			return { data: { user: { ...user, activeMode: 'candidate' } }, error: null };
		});

		await switchMode('candidate');
		expect(get(authenticationStore)).toEqual(loggedOut);
	});

	it('treats an answer without a user as a failure', async () => {
		mockModePut.mockResolvedValue({ data: {}, error: null });

		await expect(switchMode('candidate')).resolves.toMatchObject({ ok: false, reason: 'error' });
	});
});

describe('refreshAccount', () => {
	it('stores the account of GET /me', async () => {
		const updated = { ...user, domain: 'rita' };
		mockMeGet.mockResolvedValue({ data: { user: updated }, error: null });

		await expect(refreshAccount()).resolves.toEqual({ ok: true, user: updated });
		expect(mockMeGet).toHaveBeenCalledWith(withCredentials);
		expect(get(authenticationStore).user).toEqual(updated);
	});
});

describe('claimPortfolio', () => {
	it('claims the normalised name and records the domain on the session', async () => {
		mockClaimPost.mockResolvedValue({ data: { name: 'rita' }, error: null });

		await expect(claimPortfolio('  Rita ')).resolves.toEqual({ ok: true, name: 'rita' });
		expect(mockClaimPost).toHaveBeenCalledWith({ name: 'rita' }, withCredentials);
		expect(get(authenticationStore).user).toEqual({ ...user, domain: 'rita' });
	});

	it('never sends a name the API would refuse', async () => {
		await expect(claimPortfolio('recruiter')).resolves.toMatchObject({ ok: false, cause: 'name' });
		expect(mockClaimPost).not.toHaveBeenCalled();
	});

	it('explains a refused claim', async () => {
		mockClaimPost.mockResolvedValue(apiError(409, 'Domain already exists'));

		await expect(claimPortfolio('rita')).resolves.toEqual({
			ok: false,
			reason: 'error',
			message: 'This name is already taken. Choose another one.',
			cause: 'name'
		});
		expect(get(authenticationStore).user).toEqual(user);
	});

	it('clears the session on 401', async () => {
		mockClaimPost.mockResolvedValue(apiError(401, 'Unauthorized'));

		await expect(claimPortfolio('rita')).resolves.toMatchObject({
			ok: false,
			reason: 'session-expired'
		});
		expect(get(authenticationStore)).toEqual(loggedOut);
	});

	it('reports a network failure', async () => {
		mockClaimPost.mockRejectedValue(new TypeError('Failed to fetch'));

		await expect(claimPortfolio('rita')).resolves.toMatchObject({ ok: false, reason: 'network' });
	});

	it('sends the age and terms confirmation when given, and records its version on the session', async () => {
		mockClaimPost.mockResolvedValue({ data: { name: 'rita' }, error: null });

		await expect(claimPortfolio('rita', currentConsent())).resolves.toEqual({
			ok: true,
			name: 'rita'
		});
		expect(mockClaimPost).toHaveBeenCalledWith(
			{ name: 'rita', consent: { termsVersion: LEGAL_VERSION, ageConfirmed: true } },
			withCredentials
		);
		expect(get(authenticationStore).user).toEqual({
			...user,
			domain: 'rita',
			termsVersion: LEGAL_VERSION
		});
	});

	it('says when the API asks for the confirmation, keeping the session', async () => {
		mockClaimPost.mockResolvedValue(
			apiError(422, {
				type: 'validation',
				on: 'body',
				property: 'consent',
				message: 'Confirm your age and accept the terms of use to create a portfolio.'
			})
		);

		await expect(claimPortfolio('rita')).resolves.toEqual({
			ok: false,
			reason: 'error',
			message: CLAIM_CONSENT_MESSAGE,
			cause: 'consent'
		});
		expect(mockClaimPost).toHaveBeenCalledWith({ name: 'rita' }, withCredentials);
		expect(get(authenticationStore).user).toEqual(user);
	});
});

describe('portfolioUrlPreview', () => {
	it('shows the address as it would be claimed, from a host or an origin', () => {
		expect(portfolioUrlPreview('portfolio.example', 'jane.doe')).toBe('portfolio.example/jane.doe');
		expect(portfolioUrlPreview('https://portfolio.example', ' Jane.Doe ')).toBe(
			'portfolio.example/jane.doe'
		);
		expect(portfolioUrlPreview('http://localhost:5173/', 'rita')).toBe('localhost:5173/rita');
		expect(portfolioUrlPreview('https://portfolio.example/some/page', 'rita')).toBe(
			'portfolio.example/rita'
		);
	});

	it('shows a placeholder while no name is typed', () => {
		expect(portfolioUrlPreview('portfolio.example', '')).toBe('portfolio.example/your-name');
		expect(portfolioUrlPreview('portfolio.example', '   ')).toBe('portfolio.example/your-name');
	});
});

describe('hasAcceptedCurrentTerms', () => {
	it('is true only for the version of the terms in force', () => {
		expect(hasAcceptedCurrentTerms({ termsVersion: LEGAL_VERSION })).toBe(true);
		expect(hasAcceptedCurrentTerms({ termsVersion: '2025-01-01' })).toBe(false);
		expect(hasAcceptedCurrentTerms({})).toBe(false);
		expect(hasAcceptedCurrentTerms(null)).toBe(false);
		expect(hasAcceptedCurrentTerms(undefined)).toBe(false);
	});

	it('reads a version Eden parsed into a Date, or its persisted ISO string', () => {
		expect(hasAcceptedCurrentTerms({ termsVersion: new Date(`${LEGAL_VERSION}T00:00:00Z`) })).toBe(
			true
		);
		expect(hasAcceptedCurrentTerms({ termsVersion: `${LEGAL_VERSION}T00:00:00.000Z` })).toBe(true);
		expect(hasAcceptedCurrentTerms({ termsVersion: new Date('2025-01-01T00:00:00Z') })).toBe(false);
	});
});

describe('checkDomainAvailability', () => {
	it('asks the API about a valid name, normalised', async () => {
		mockAvailabilityGet.mockResolvedValue({
			data: { name: 'jane.doe', available: true },
			error: null
		});

		await expect(checkDomainAvailability(' Jane.Doe ')).resolves.toEqual({ status: 'available' });
		expect(mockDomain).toHaveBeenCalledWith({ name: 'jane.doe' });
		expect(mockAvailabilityGet).toHaveBeenCalledWith(undefined);
	});

	it('passes the abort signal to the request', async () => {
		const controller = new AbortController();
		mockAvailabilityGet.mockResolvedValue({ data: { name: 'rita', available: true }, error: null });

		await checkDomainAvailability('rita', controller.signal);
		expect(mockAvailabilityGet).toHaveBeenCalledWith({ fetch: { signal: controller.signal } });
	});

	it.each(['taken', 'invalid', 'reserved'] as const)(
		'reports a name the API says is %s',
		async (reason) => {
			mockAvailabilityGet.mockResolvedValue({
				data: { name: 'rita', available: false, reason },
				error: null
			});

			await expect(checkDomainAvailability('rita')).resolves.toEqual({ status: reason });
		}
	);

	it('answers invalid and reserved names without a request', async () => {
		await expect(checkDomainAvailability('legal')).resolves.toEqual({ status: 'reserved' });
		await expect(checkDomainAvailability('Privacy')).resolves.toEqual({ status: 'reserved' });
		await expect(checkDomainAvailability('-bad')).resolves.toEqual({ status: 'invalid' });
		await expect(checkDomainAvailability('')).resolves.toEqual({ status: 'invalid' });
		expect(mockDomain).not.toHaveBeenCalled();
		expect(mockAvailabilityGet).not.toHaveBeenCalled();
	});

	it('tells a rate limit from other failures', async () => {
		mockAvailabilityGet.mockResolvedValue(apiError(429, 'Too many requests'));
		await expect(checkDomainAvailability('rita')).resolves.toEqual({ status: 'rate-limited' });

		mockAvailabilityGet.mockResolvedValue(apiError(503, 'Unavailable'));
		await expect(checkDomainAvailability('rita')).resolves.toEqual({ status: 'error' });

		mockAvailabilityGet.mockResolvedValue({ data: { surprise: true }, error: null });
		await expect(checkDomainAvailability('rita')).resolves.toEqual({ status: 'error' });

		mockAvailabilityGet.mockResolvedValue({
			data: { available: false, reason: 'odd' },
			error: null
		});
		await expect(checkDomainAvailability('rita')).resolves.toEqual({ status: 'error' });
	});

	it('reports a network failure or an aborted request as an error', async () => {
		mockAvailabilityGet.mockRejectedValue(
			new DOMException('The operation was aborted.', 'AbortError')
		);
		await expect(checkDomainAvailability('rita')).resolves.toEqual({ status: 'error' });
	});
});

describe('domainAvailabilityMessage', () => {
	it('says nothing for a free name, and why another cannot be claimed', () => {
		expect(domainAvailabilityMessage('available', 'rita')).toBeNull();
		expect(domainAvailabilityMessage('taken', 'rita')).toMatch(/already taken/);
		expect(domainAvailabilityMessage('reserved', 'legal')).toMatch(/reserved/);
		expect(domainAvailabilityMessage('invalid', 'jane..doe')).toMatch(/two dots/);
		expect(domainAvailabilityMessage('rate-limited', 'rita')).toMatch(/checked when you claim/);
		expect(domainAvailabilityMessage('error', 'rita')).toMatch(/checked when you claim/);
	});
});

describe('acceptTerms', () => {
	it('records the terms in force from the account page, and stores the account returned', async () => {
		const updated = { ...user, termsVersion: LEGAL_VERSION };
		mockConsentPut.mockResolvedValue({ data: { user: updated }, error: null });

		await expect(acceptTerms()).resolves.toEqual({ ok: true, user: updated });
		expect(mockConsentPut).toHaveBeenCalledWith(
			{ termsVersion: LEGAL_VERSION, ageConfirmed: true, source: 'account' },
			withCredentials
		);
		expect(get(authenticationStore)).toEqual({ user: updated, expires });
	});

	it('stores the version as text when Eden parsed it into a Date', async () => {
		const parsed = { ...user, termsVersion: new Date(`${LEGAL_VERSION}T00:00:00.000Z`) };
		mockConsentPut.mockResolvedValue({ data: { user: parsed }, error: null });

		const result = await acceptTerms();
		expect(result).toEqual({ ok: true, user: { ...user, termsVersion: LEGAL_VERSION } });
		expect(get(authenticationStore).user).toEqual({ ...user, termsVersion: LEGAL_VERSION });
		expect(hasAcceptedCurrentTerms(get(authenticationStore).user)).toBe(true);
	});

	it('says where it was given', async () => {
		mockConsentPut.mockResolvedValue({ data: { user }, error: null });

		await acceptTerms('claim');
		expect(mockConsentPut).toHaveBeenCalledWith(
			{ termsVersion: LEGAL_VERSION, ageConfirmed: true, source: 'claim' },
			withCredentials
		);
	});

	it('clears the session on 401, asks for a reload when the terms changed, and reports failures', async () => {
		mockConsentPut.mockResolvedValue(
			apiError(422, {
				type: 'validation',
				on: 'body',
				property: 'consent.termsVersion',
				message: 'x'
			})
		);
		await expect(acceptTerms()).resolves.toEqual({
			ok: false,
			reason: 'error',
			message: STALE_TERMS_MESSAGE
		});

		mockConsentPut.mockResolvedValue(apiError(503));
		await expect(acceptTerms()).resolves.toMatchObject({ ok: false, reason: 'error' });
		expect(get(authenticationStore).user).toEqual(user);

		mockConsentPut.mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(acceptTerms()).resolves.toMatchObject({ ok: false, reason: 'network' });

		mockConsentPut.mockResolvedValue(apiError(401));
		await expect(acceptTerms()).resolves.toMatchObject({ ok: false, reason: 'session-expired' });
		expect(get(authenticationStore)).toEqual(loggedOut);
	});
});

/** A Storage holding `entries` */
const memoryStorage = (entries: Record<string, string>) => {
	const items = new Map(Object.entries(entries));
	return {
		get length() {
			return items.size;
		},
		key: (index: number) => [...items.keys()][index] ?? null,
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => void items.set(key, value),
		removeItem: (key: string) => void items.delete(key),
		clear: () => items.clear(),
		keys: () => [...items.keys()].sort()
	};
};

describe('isUserStorageKey and clearUserBrowserData', () => {
	const entries = {
		'experienceDraft:user-1:rita:new': '{}',
		'experienceDraft:user-1:rita:import:d1': '{}',
		'resumeImport:user-1:rita': '{}',
		'jobDraft:user-1:new': '{}',
		'jobDraft:user-1:import': '{}',
		jobImportDraft: '{}',
		'jobImportDraft:user-1': '{}',
		'jobImportDraft:user-10': '{}',
		'experienceDraft:user-10:x:new': '{}',
		'resumeImport:user-2:bo': '{}',
		authenticationStore: '{}',
		'portfolio-dark-mode': 'true'
	};

	it("names this account's drafts and import reviews only", () => {
		expect(isUserStorageKey('experienceDraft:user-1:rita:new', 'user-1')).toBe(true);
		expect(isUserStorageKey('jobImportDraft:user-1', 'user-1')).toBe(true);
		expect(isUserStorageKey('jobImportDraft:user-10', 'user-1')).toBe(false);
		expect(isUserStorageKey('experienceDraft:user-10:x:new', 'user-1')).toBe(false);
		expect(isUserStorageKey('portfolio-dark-mode', 'user-1')).toBe(false);
		expect(isUserStorageKey('experienceDraft::x:new', '')).toBe(false);
	});

	it("removes this account's keys and keeps the others", () => {
		const storage = memoryStorage(entries);

		expect(clearUserBrowserData('user-1', storage).sort()).toEqual([
			'experienceDraft:user-1:rita:import:d1',
			'experienceDraft:user-1:rita:new',
			'jobDraft:user-1:import',
			'jobDraft:user-1:new',
			'jobImportDraft:user-1',
			'resumeImport:user-1:rita'
		]);
		expect(storage.keys()).toEqual([
			'authenticationStore',
			'experienceDraft:user-10:x:new',
			'jobImportDraft',
			'jobImportDraft:user-10',
			'portfolio-dark-mode',
			'resumeImport:user-2:bo'
		]);
	});

	it('does nothing without storage, or when it cannot be read', () => {
		expect(clearUserBrowserData('user-1', undefined)).toEqual([]);
		const broken = {
			get length(): number {
				throw new DOMException('denied', 'SecurityError');
			},
			key: () => null,
			removeItem: () => {}
		};
		expect(clearUserBrowserData('user-1', broken)).toEqual([]);
	});
});

describe('deleteAccount', () => {
	let storage: ReturnType<typeof memoryStorage>;

	beforeEach(() => {
		storage = memoryStorage({
			'experienceDraft:user-1:rita:new': '{}',
			'resumeImport:user-1:rita': '{}',
			'jobImportDraft:user-1': '{}',
			'resumeImport:user-2:bo': '{}'
		});
		vi.stubGlobal('localStorage', storage);
		return () => vi.unstubAllGlobals();
	});

	it('deletes the account with the confirmation, then forgets it in this browser', async () => {
		mockMeDelete.mockResolvedValue({ data: null, error: null, status: 204 });

		await expect(deleteAccount()).resolves.toEqual({ ok: true });
		expect(mockMeDelete).toHaveBeenCalledWith({ confirm: 'DELETE' }, withCredentials);
		expect(get(authenticationStore)).toEqual(loggedOut);
		expect(storage.keys()).toEqual(['resumeImport:user-2:bo']);
		expect(disableGoogleAutoSelect).toHaveBeenCalledTimes(1);
	});

	it('keeps everything when the API refuses or cannot be reached', async () => {
		mockMeDelete.mockResolvedValue(apiError(503));
		await expect(deleteAccount()).resolves.toEqual({
			ok: false,
			reason: 'error',
			message: DELETE_ACCOUNT_ERROR_MESSAGE
		});

		mockMeDelete.mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(deleteAccount()).resolves.toEqual({
			ok: false,
			reason: 'network',
			message: NETWORK_ERROR_MESSAGE
		});

		expect(get(authenticationStore).user).toEqual(user);
		expect(storage.keys()).toHaveLength(4);
		expect(disableGoogleAutoSelect).not.toHaveBeenCalled();
	});

	it('does not wait for Google longer than the timeout once the account is deleted', async () => {
		vi.useFakeTimers();
		try {
			mockMeDelete.mockResolvedValue({ data: null, error: null, status: 204 });
			vi.mocked(disableGoogleAutoSelect).mockReturnValueOnce(new Promise<void>(() => {}));

			const result = deleteAccount();
			await vi.advanceTimersByTimeAsync(GOOGLE_AUTO_SELECT_TIMEOUT_MS);
			await expect(result).resolves.toEqual({ ok: true });
			expect(get(authenticationStore)).toEqual(loggedOut);
		} finally {
			vi.useRealTimers();
		}
	});

	it('clears the session on 401, keeping the drafts (the account was not deleted)', async () => {
		mockMeDelete.mockResolvedValue(apiError(401));

		await expect(deleteAccount()).resolves.toMatchObject({ ok: false, reason: 'session-expired' });
		expect(get(authenticationStore)).toEqual(loggedOut);
		expect(storage.keys()).toHaveLength(4);
	});
});
