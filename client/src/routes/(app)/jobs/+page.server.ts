import { error } from '@sveltejs/kit';
import { portfolioApi } from '#services';
import { JOBS_UNAVAILABLE_MESSAGE } from '#services/applications.ts';
import type { PageServerLoad } from './$types';

// The public list of open job postings (GET /jobs: most recently published first). Rendered on the
// server: the list is the same for every visitor, applying happens on each posting's page.
export const load: PageServerLoad = async () => {
	// Eden throws when the API cannot be reached at all (connection refused, DNS)
	const response = await portfolioApi.jobs.get().catch(() => null);
	if (!response || response.error || !response.data) error(503, JOBS_UNAVAILABLE_MESSAGE);
	return { jobs: response.data.jobs };
};
