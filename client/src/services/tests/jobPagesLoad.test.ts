import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

vi.mock('#services', () => {
	const listGet = vi.fn();
	const jobGet = vi.fn();
	const jobs = Object.assign(
		vi.fn(() => ({ get: jobGet })),
		{ get: listGet }
	);
	return { portfolioApi: { jobs } };
});

import { portfolioApi } from '#services';
import { load as loadList } from '../../routes/(app)/jobs/+page.server';
import { load as loadJob } from '../../routes/(app)/jobs/[id]/+page.server';

const mockJobs = portfolioApi.jobs as unknown as Mock;
const mockListGet = portfolioApi.jobs.get as unknown as Mock;
const mockJobGet = portfolioApi.jobs({ id: '' }).get as unknown as Mock;

const ID = '65a1f0c2b3d4e5f6a7b8c9d0';

const runList = () => loadList({} as unknown as Parameters<typeof loadList>[0]);
const runJob = (id: string) =>
	loadJob({ params: { id } } as unknown as Parameters<typeof loadJob>[0]);

const httpError = async (run: () => unknown) => {
	try {
		await run();
	} catch (thrown) {
		if (isHttpError(thrown)) return thrown;
		throw thrown;
	}
	throw new Error('load() did not throw');
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('/jobs load', () => {
	it('returns the open postings', async () => {
		const jobs = [{ _id: ID, title: 'Backend engineer', status: 'open' }];
		mockListGet.mockResolvedValue({ data: { jobs }, error: null });
		await expect(runList()).resolves.toEqual({ jobs });
	});

	it('answers 503 when the API fails or cannot be reached', async () => {
		mockListGet.mockResolvedValue({ data: null, error: { status: 500, value: 'Oops' } });
		expect((await httpError(runList)).status).toBe(503);

		mockListGet.mockRejectedValue(new TypeError('fetch failed'));
		expect((await httpError(runList)).status).toBe(503);
	});
});

describe('/jobs/[id] load', () => {
	it('returns the posting', async () => {
		const job = { _id: ID, title: 'Backend engineer', status: 'open' };
		mockJobGet.mockResolvedValue({ data: job, error: null });
		await expect(runJob(ID)).resolves.toEqual({ job });
		expect(mockJobs).toHaveBeenCalledWith({ id: ID });
	});

	it('answers 404 for a draft or unknown posting', async () => {
		mockJobGet.mockResolvedValue({
			data: null,
			error: { status: 404, value: 'Job posting not found' }
		});
		const error = await httpError(() => runJob(ID));
		expect(error.status).toBe(404);
		expect(error.body.message).toBe('Job posting not found');
	});

	it('answers 404 without asking the API for something that is not a posting id', async () => {
		for (const id of ['abc', '../recruiter', `${ID}?x=1`, 'wp-login.php']) {
			expect((await httpError(() => runJob(id))).status).toBe(404);
		}
		expect(mockJobs).not.toHaveBeenCalled();
	});

	it('answers 503 for any other failure, a 404 that is not the API one included', async () => {
		mockJobGet.mockResolvedValue({ data: null, error: { status: 404, value: 'NOT_FOUND' } });
		expect((await httpError(() => runJob(ID))).status).toBe(503);

		mockJobGet.mockResolvedValue({ data: null, error: { status: 502, value: 'Bad gateway' } });
		expect((await httpError(() => runJob(ID))).status).toBe(503);

		mockJobGet.mockRejectedValue(new TypeError('fetch failed'));
		expect((await httpError(() => runJob(ID))).status).toBe(503);
	});
});
