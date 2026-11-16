import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

vi.mock('#services', () => {
	const get = vi.fn();
	// The text client only: the portfolio is read without Eden Treaty's date parsing
	return { portfolioTextApi: { domain: vi.fn(() => ({ get })) } };
});

import { portfolioTextApi as portfolioApi } from '#services';
import { load } from '../../routes/[domain]/+layout.server';

const mockDomain = portfolioApi.domain as unknown as Mock;
const mockGet = portfolioApi.domain({ name: '' }).get as unknown as Mock;

type LoadEvent = Parameters<typeof load>[0];
const runLoad = (domain: string) => load({ params: { domain } } as unknown as LoadEvent);

const loadError = async (domain: string) => {
	try {
		await runLoad(domain);
	} catch (thrown) {
		if (isHttpError(thrown)) return thrown;
		throw thrown;
	}
	throw new Error('load() did not throw');
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('[domain] layout load', () => {
	it('returns the domain when the API finds it', async () => {
		const domain = { name: 'louis.gentil', admin: 'user-1', experiences: [] };
		mockGet.mockResolvedValue({ data: domain, error: null });

		await expect(runLoad('louis.gentil')).resolves.toEqual({
			domain,
			domainName: 'louis.gentil'
		});
	});

	it('keeps every text as written and turns only the experience and project dates into Dates', async () => {
		mockGet.mockResolvedValue({
			data: {
				name: 'jane.doe',
				headerTitle: '2027-01-01',
				headerSubtitle: '2024 05 12',
				experiences: [
					{
						title: '2020-03',
						summary: '01-09-2024',
						start: '2020-03-01T00:00:00.000Z',
						projects: [{ name: '2021-01', end: '2021-01-01T00:00:00.000Z' }]
					}
				]
			},
			error: null
		});

		const { domain } = (await runLoad('jane.doe')) as unknown as {
			domain: {
				headerTitle: unknown;
				headerSubtitle: unknown;
				experiences: {
					title: unknown;
					summary: unknown;
					start: unknown;
					projects: { name: unknown; end: unknown }[];
				}[];
			};
		};
		expect(domain.headerTitle).toBe('2027-01-01');
		expect(domain.headerSubtitle).toBe('2024 05 12');
		const [experience] = domain.experiences;
		expect(experience.title).toBe('2020-03');
		expect(experience.summary).toBe('01-09-2024');
		expect(experience.start).toEqual(new Date('2020-03-01T00:00:00.000Z'));
		expect(experience.projects[0].name).toBe('2021-01');
		expect(experience.projects[0].end).toEqual(new Date('2021-01-01T00:00:00.000Z'));
	});

	it('offers the claim flow for an unknown but valid domain name', async () => {
		mockGet.mockResolvedValue({ data: null, error: { status: 404, value: 'Domain not found' } });

		const error = await loadError('Someone.New');
		expect(error.status).toBe(404);
		expect(error.body.domainName).toBe('someone.new');
	});

	it('returns a plain 404 (no claim flow) for scanner-like paths', async () => {
		mockGet.mockResolvedValue({ data: null, error: { status: 404, value: 'Domain not found' } });

		for (const path of ['wp-login.php', '.env', 'admin', 'a_b']) {
			const error = await loadError(path);
			expect(error.status).toBe(404);
			expect(error.body.domainName).toBeUndefined();
		}
	});

	it('renders 503, never the claim flow, when the API is down or failing', async () => {
		for (const status of [500, 502, 503]) {
			mockGet.mockResolvedValue({ data: null, error: { status, value: 'ECONNREFUSED' } });

			const error = await loadError('louis.gentil');
			expect(error.status).toBe(503);
			expect(error.body.domainName).toBeUndefined();
		}
	});

	it('renders 503 for a 404 that is not the API saying the domain does not exist', async () => {
		// Route miss on the API ('NOT_FOUND' / 'Not Found'), or a wrong PUBLIC_PORTFOLIO_API_URL
		// answered by a proxy or the hosting edge
		for (const value of ['NOT_FOUND', 'Not Found', '<html>404</html>', undefined, null]) {
			mockGet.mockResolvedValue({ data: null, error: { status: 404, value } });

			const error = await loadError('louis.gentil');
			expect(error.status, String(value)).toBe(503);
			expect(error.body.domainName).toBeUndefined();
		}
	});

	it('URL-encodes the domain before building the API path', async () => {
		mockGet.mockResolvedValue({ data: null, error: { status: 404, value: 'Domain not found' } });

		await loadError('a?x=1/../b');
		expect(mockDomain).toHaveBeenLastCalledWith({ name: 'a%3Fx%3D1%2F..%2Fb' });
	});
});
