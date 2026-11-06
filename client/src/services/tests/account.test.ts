import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { get } from 'svelte/store';

// vi.mock factories are hoisted — they cannot reference outer variables
vi.mock('#services', () => ({
	portfolioApi: {
		me: { get: vi.fn(), mode: { put: vi.fn() } },
		domain: { claim: { post: vi.fn() } }
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

import {
	NETWORK_ERROR_MESSAGE,
	SESSION_EXPIRED_MESSAGE,
	claimErrorMessage,
	claimFailureCause,
	claimPortfolio,
	domainNameProblem,
	isCurrentSection,
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
import { portfolioApi } from '#services';

const mockModePut = portfolioApi.me.mode.put as unknown as Mock;
const mockMeGet = portfolioApi.me.get as unknown as Mock;
const mockClaimPost = portfolioApi.domain.claim.post as unknown as Mock;

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
});
