import { describe, expect, test } from 'vitest';
import { NOINDEX, NOINDEX_ROUTES, isNoindexRoute } from './robots.ts';

// Every page and layout file of the site ('/src/routes/[domain]/hire/+page.svelte'): only the
// file names are read, no page is loaded
const routeFiles = Object.keys(import.meta.glob('/src/routes/**/+{page,layout}*.svelte'));

/** The route id SvelteKit gives the page of `file` ('/[domain]/experiences', '/(site)') */
const routeId = (file: string) =>
	file.replace(/^\/src\/routes/, '').replace(/\/\+page(@[^/]*)?\.svelte$/, '') || '/';

const pageRoutes = routeFiles
	.filter((file) => /\/\+page(@[^/]*)?\.svelte$/.test(file))
	.map(routeId);

// The source of the layouts under the root ('/src/routes/[domain]/+layout.svelte') and of the
// portfolio's head, as text
const layoutSources = import.meta.glob<string>('/src/routes/*/+layout.svelte', {
	query: '?raw',
	import: 'default',
	eager: true
});
// The account page's source ('/src/routes/(site)/account/+page.svelte'; a group's parentheses
// would be a pattern of their own)
const accountPageSource = Object.values(
	import.meta.glob<string>('/src/routes/*/account/+page.svelte', {
		query: '?raw',
		import: 'default',
		eager: true
	})
)[0];
const portfolioHeadSource = Object.values(
	import.meta.glob<string>('/src/lib/components/PortfolioHead.svelte', {
		query: '?raw',
		import: 'default',
		eager: true
	})
)[0];

// The pages search engines may list, with their canonical links: the landing page, the legal
// pages and the recruiter landing. A new page is either added here or under one of
// NOINDEX_ROUTES (#lib/robots.ts)
const LISTED_PAGES = [
	'/(site)',
	'/(site)/legal',
	'/(site)/legal/cookies',
	'/(site)/legal/privacy',
	'/(site)/legal/terms',
	'/(app)/recruiter'
];

describe('pages search engines are asked not to list', () => {
	test('the robots directive says not to list', () => {
		expect(NOINDEX.split(', ')).toContain('noindex');
	});

	test('every page of a portfolio is not listed, a page added under /[domain] too', () => {
		const portfolioPages = pageRoutes.filter((route) => route.startsWith('/[domain]/'));
		expect(portfolioPages).toEqual(
			expect.arrayContaining(['/[domain]/experiences', '/[domain]/hire', '/[domain]/admin'])
		);
		for (const route of portfolioPages)
			expect({ route, noindex: isNoindexRoute(route) }).toEqual({ route, noindex: true });
		// The 404 of a name nobody claimed has the route id of the page asked for
		expect(isNoindexRoute('/[domain]')).toBe(true);
	});

	test("the portfolio's layout writes the robots meta on each of its pages", () => {
		// The header alone (hooks.server.ts) would do for search engines; the meta stays with the
		// page when it is saved or read without its headers
		expect(layoutSources['/src/routes/[domain]/+layout.svelte']).toMatch(/^<PortfolioHead \/>$/m);
		expect(portfolioHeadSource).toMatch(/^\t<meta name="robots" content=\{NOINDEX\} \/>$/m);
	});

	test('the other pages not listed write the robots meta too', () => {
		// The (app) layout on its routes of NOINDEX_ROUTES (/recruiter/jobs/*, /opportunities/*,
		// rendered in the browser), and the account page. client/tests/robots.test.ts checks the
		// rendered pages
		const appLayout = layoutSources['/src/routes/(app)/+layout.svelte'];
		expect(appLayout).toMatch(
			/\{#if noindex\}\s*<meta name="robots" content=\{NOINDEX\} \/>\s*\{\/if\}/
		);
		expect(appLayout).toMatch(/let noindex = \$derived\(isNoindexRoute\(page\.route\.id\)\);/);
		expect(accountPageSource).toMatch(/^\t<meta name="robots" content=\{NOINDEX\} \/>$/m);
	});

	test("every page of a portfolio keeps the portfolio's layout and its robots meta", () => {
		// A page or layout named +page@.svelte, +layout@(site).svelte... would be rendered without
		// the [domain] layout, so without PortfolioHead: only the header would remain
		const resets = routeFiles.filter(
			(file) =>
				file.startsWith('/src/routes/[domain]/') && /\/\+(page|layout)@(?!\[domain\])/.test(file)
		);
		expect(resets).toEqual([]);
	});

	test('every page of the site chose: listed, or not listed', () => {
		const unchosen = pageRoutes.filter(
			(route) => !isNoindexRoute(route) && !LISTED_PAGES.includes(route)
		);
		expect(unchosen).toEqual([]);
		// The listed pages are pages of the site
		expect(pageRoutes).toEqual(expect.arrayContaining(LISTED_PAGES));
	});

	test('the landing page and the legal pages stay listed', () => {
		for (const route of LISTED_PAGES)
			expect({ route, noindex: isNoindexRoute(route) }).toEqual({ route, noindex: false });
	});

	test('the account page and the job descriptions of the recruiter space and of a candidate are not listed', () => {
		for (const route of [
			'/(site)/account',
			'/(app)/recruiter/jobs/new',
			'/(app)/recruiter/jobs/[id]',
			'/(app)/recruiter/jobs/[id]/edit',
			'/(app)/opportunities/[id]'
		]) {
			expect({ route, noindex: isNoindexRoute(route) }).toEqual({ route, noindex: true });
		}
	});

	test('a route is matched on whole segments', () => {
		expect(NOINDEX_ROUTES.every((route) => isNoindexRoute(route))).toBe(true);
		expect(isNoindexRoute('/[domain]x')).toBe(false);
		expect(isNoindexRoute('/(app)/recruiter/jobsboard')).toBe(false);
		expect(isNoindexRoute('/(site)/accounts')).toBe(false);
		expect(isNoindexRoute('/(app)/opportunitiesboard')).toBe(false);
		expect(isNoindexRoute('/')).toBe(false);
		// An address that matches no route (SvelteKit's own 404)
		expect(isNoindexRoute(null)).toBe(false);
		expect(isNoindexRoute(undefined)).toBe(false);
	});
});
