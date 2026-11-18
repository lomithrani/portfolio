import { ROBOTS_NOINDEX } from 'portfolio-common';

// Which pages search engines are asked not to list. A portfolio is public to anyone with its
// address, but nobody should find it by searching a name: every page under /[domain] (and the
// 404 of a name nobody claimed), the pages of the recruiter space that hold a job description,
// the private page of a job description shared with a candidate (/opportunities/:id) and the
// account page answer with an `x-robots-tag` header (hooks.server.ts). They also carry a robots
// meta (PortfolioHead.svelte, the (app) layout, the account page), but for the 404 of a name
// nobody claimed, which the root error page renders without the portfolio's layout: the header
// alone says it there. The recruiter space and /opportunities are rendered in the browser only,
// so their meta is written once the page's script ran. They are not refused in robots.txt: a
// crawler must fetch a page to read that it may not list it, and LinkedIn must fetch a shared
// portfolio to build its preview. The landing page and the legal pages stay listed, with their
// canonical links. The API sends the same header, with the same value, on every answer
// (server/app.ts).

/** What those pages ask of search engines: not listed, their links not followed, no cached copy */
export const NOINDEX = ROBOTS_NOINDEX;

/**
 * SvelteKit route ids (`page.route.id`, `event.route.id`) whose pages, and the pages under them,
 * are not listed. A page added under one of them is not listed either; a new route elsewhere is
 * listed unless it is added here (robots.test.ts makes every page choose)
 */
export const NOINDEX_ROUTES = [
	'/[domain]',
	'/(app)/recruiter/jobs',
	'/(app)/opportunities',
	'/(site)/account'
] as const;

/** Whether the page of `routeId` is not listed: it is one of NOINDEX_ROUTES or under one, by whole segments */
export const isNoindexRoute = (routeId: string | null | undefined): boolean =>
	!!routeId &&
	NOINDEX_ROUTES.some((prefix) => routeId === prefix || routeId.startsWith(`${prefix}/`));
