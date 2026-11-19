import { portfolioTextApi } from '#services';
import { anonymousJourney, type Journey } from '#services/workflow.ts';
import type { PageServerLoad } from './$types';

/** How long the server waits for the journey before leaving it to the browser */
const JOURNEY_TIMEOUT_MS = 5_000;

/**
 * Sent with this render's requests, so the API's traces tell them from a browser's: the
 * OpenTelemetry plugin of the API records every request header as a span attribute
 * (`http.request.header.x-portfolio-render`), and the dashboards that count the page's visits leave
 * these out (docs/grafana/README.md): crawlers and link previews are rendered here, browsers load
 * the journey again themselves. Server to server: no CORS preflight
 */
const RENDER_HEADERS = { 'x-portfolio-render': 'server' } as const;

// The page for recruiters rendered on the server: the portfolio's hiring journey as anyone
// signed out stands in it (GET /workflow/domains/:domainName without a session: the web server
// never has the API's cookie, which belongs to the API's host), so the first paint, a page without
// JavaScript and a link preview show the steps and what they ask. Only what the step types make
// public comes back (their `visitorConfig`), and anonymousJourney keeps nothing else. A signed-in
// visitor's own progress is loaded in the browser (+page.svelte), as is the whole journey when this
// fails: an unknown portfolio is the layout's 404, anything else (the API down or slow) is null.
// `bookable`: whether the owner's calendar offers a meeting type to book (the public
// GET /appointments/domains/:domainName/schedules, which reads the database alone and answers
// nothing while the calendar is not connected or the journey has no meeting, and only the meeting
// types with hours, as the readiness checklist counts them: bookableScheduleFilter of
// server/services/appointmentSchedules.ts): only that boolean
// is kept, never the meeting types (a phone call's carries the owner's number); null when not known.
// A navigation in the browser (a link, a preload on hover, the way back from the job editor) asks
// neither: the page loads them there, at once, as it does after this render.
export const load: PageServerLoad = async ({ params, isDataRequest }) => {
	if (isDataRequest) return { journey: null, bookable: null };
	// Path params arrive decoded: re-encoded, as the layout does
	const domainName = encodeURIComponent(params.domain);
	const fetch = { signal: AbortSignal.timeout(JOURNEY_TIMEOUT_MS) };
	const options = { fetch, headers: RENDER_HEADERS };
	const [journey, bookable] = await Promise.all([
		portfolioTextApi.workflow
			.domains({ domainName })
			.get(options)
			.then(
				({ data }): Journey | null => anonymousJourney(data),
				() => null
			),
		portfolioTextApi.appointments
			.domains({ domainName })
			.schedules.get(options)
			.then(
				({ data, error }) => (error || !Array.isArray(data) ? null : data.length > 0),
				() => null
			)
	]);
	return { journey, bookable };
};
