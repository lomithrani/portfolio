import { error } from '@sveltejs/kit';
import { portfolioApi } from '#services';
import {
	JOBS_UNAVAILABLE_MESSAGE,
	JOB_NOT_FOUND_MESSAGE,
	isJobNotFound,
	isJobPostingId
} from '#services/applications.ts';
import type { PageServerLoad } from './$types';

// A public job posting (GET /jobs/:id: any status but draft). Rendered on the server for search
// engines and link previews; whether the visitor can apply is decided in the browser (ApplyPanel).
export const load: PageServerLoad = async ({ params }) => {
	// Not a posting id at all: no need to ask the API (it would answer 422)
	if (!isJobPostingId(params.id)) error(404, JOB_NOT_FOUND_MESSAGE);

	// Path params arrive decoded: re-encoded, a crafted segment cannot change the API URL
	const response = await portfolioApi
		.jobs({ id: encodeURIComponent(params.id) })
		.get()
		.catch(() => null);
	if (!response) error(503, JOBS_UNAVAILABLE_MESSAGE);
	if (isJobNotFound(response.error)) error(404, JOB_NOT_FOUND_MESSAGE);
	// API down, 5xx, or a 404 that is not the API's own (e.g. a wrong PUBLIC_PORTFOLIO_API_URL)
	if (response.error || !response.data) error(503, JOBS_UNAVAILABLE_MESSAGE);

	return { job: response.data };
};
