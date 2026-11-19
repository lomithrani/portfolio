import { portfolioTextApi } from '#services';
import { anonymousJourney, type Journey } from '#services/workflow.ts';
import type { PageServerLoad } from './$types';

/** How long the server waits for the journey before leaving it to the browser */
const JOURNEY_TIMEOUT_MS = 5_000;

// The page for recruiters rendered on the server: the portfolio's hiring journey as anyone
// signed out stands in it (GET /workflow/domains/:domainName without a session: the web server
// never has the API's cookie, which belongs to the API's host), so the first paint, a page without
// JavaScript and a link preview show the steps and what they ask. Only what the step types make
// public comes back (their `visitorConfig`), and anonymousJourney keeps nothing else. A signed-in
// visitor's own progress is loaded in the browser (+page.svelte), as is the whole journey when this
// fails: an unknown portfolio is the layout's 404, anything else (the API down or slow) is null.
export const load: PageServerLoad = async ({ params }) => {
	let journey: Journey | null = null;
	try {
		// Path params arrive decoded: re-encoded, as the layout does
		const { data } = await portfolioTextApi.workflow
			.domains({ domainName: encodeURIComponent(params.domain) })
			.get({ fetch: { signal: AbortSignal.timeout(JOURNEY_TIMEOUT_MS) } });
		journey = anonymousJourney(data);
	} catch {
		// Loaded in the browser
	}
	return { journey };
};
