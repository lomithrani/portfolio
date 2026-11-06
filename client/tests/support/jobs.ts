import { expect, type APIRequestContext } from '@playwright/test';
import type { JobPostingInput } from 'portfolio-common';
import { API_URL } from './owner';

// Job postings of the e2e recruiter, set up and cleaned up through the API (`api` sends the
// recruiter's cookie: apiAs(await recruiterSession())). The recruiter is shared by the test files
// of the recruiter space, which run in parallel: each test names its postings with its own tag
// and removes those alone.

export type RecruiterJob = { _id: string; title: string; status: string; applicantCount: number };

/** A complete posting: a full-time CDI on site in Paris, `fields` replacing whole fields */
export const jobPosting = (
	fields: Partial<JobPostingInput> & Pick<JobPostingInput, 'title'>
): JobPostingInput => ({
	description: '## The job\n\nCreated by an end-to-end test.',
	company: 'E2E Corp',
	status: 'draft',
	openings: 1,
	location: { country: 'FR', city: 'Paris', workMode: 'on_site' },
	contract: { type: 'cdi' },
	workingTime: { arrangement: 'weekly_hours', hoursPerWeek: 35 },
	pay: { min: 45000, max: 55000, currency: 'EUR', period: 'year' },
	...fields
});

/** POST /jobs: the posting as the API stored it */
export const createJob = async (
	api: APIRequestContext,
	fields: Parameters<typeof jobPosting>[0]
): Promise<Omit<RecruiterJob, 'applicantCount'>> => {
	const response = await api.post(`${API_URL}/jobs`, { data: jobPosting(fields) });
	expect(response.ok(), await response.text()).toBe(true);
	return response.json();
};

/** GET /recruiter/jobs */
export const listRecruiterJobs = async (api: APIRequestContext): Promise<RecruiterJob[]> => {
	const response = await api.get(`${API_URL}/recruiter/jobs`);
	expect(response.ok(), `GET /recruiter/jobs: run \`bun run --cwd server seed:e2e\``).toBe(true);
	return (await response.json()).jobs;
};

/** Deletes the recruiter's postings whose title matches (404: deleted by the test itself) */
export const deleteJobs = async (api: APIRequestContext, title: string | RegExp) => {
	for (const job of await listRecruiterJobs(api)) {
		const matches = typeof title === 'string' ? job.title.includes(title) : title.test(job.title);
		if (!matches) continue;
		const response = await api.delete(`${API_URL}/jobs/${job._id}`);
		expect([200, 404]).toContain(response.status());
	}
};
