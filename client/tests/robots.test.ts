import {
	expect,
	test,
	type APIRequestContext,
	type Page,
	type PlaywrightWorkerArgs
} from '@playwright/test';
import { API_URL } from './support/owner.ts';

// Search engines (client/src/lib/robots.ts): a portfolio's pages, the 404 of a name nobody
// claimed and the private pages answer with `x-robots-tag: noindex` and carry a robots meta (that
// 404 has the header alone); the landing page and the legal pages stay listed, with their
// canonical links; robots.txt refuses nothing, so crawlers and link previews can still fetch a
// portfolio, whose experiences page and page for recruiters carry their preview tags
// (OpenGraph.svelte) in the server's HTML; the API asks the same of every answer. Runs against the
// CI seed: the portfolio 'louis.gentil' exists, and 'e2e-preview' (seed:e2e) with a title and a
// tagline; the visitor is anonymous.

const DOMAIN = 'louis.gentil';
// A portfolio with a title and a tagline (server/tests/seedE2e.ts), only read here: what its
// owner wrote, with what an HTML attribute must escape
const PREVIEW = 'e2e-preview';
const PREVIEW_HEADING = { name: 'Jane "JD" Doe & Co', tagline: 'Staff engineer <Lyon> & more' };
// A valid name nobody claimed: the root error page offers to claim it
const UNCLAIMED = 'e2e-robots-nobody-claimed-this';

// A page's answer (page.goto) or a request's (request.get)
const robotsHeader = (response: { headers(): Record<string, string> } | null) =>
	response?.headers()['x-robots-tag'];

/**
 * What the portfolio is headed with ([domain]/+layout.svelte), as the API gives it: its title, or
 * its address name, and its tagline
 */
const portfolioHeading = async (request: APIRequestContext, name = DOMAIN) => {
	const domain = (await (await request.get(`${API_URL}/domain/${name}`)).json()) as {
		name: string;
		headerTitle?: string;
		headerSubtitle?: string;
	};
	return {
		name: domain.headerTitle?.trim() || domain.name,
		tagline: domain.headerSubtitle?.trim() || undefined
	};
};

/**
 * An absolute address of this site: the server writes the origin adapter-bun derives (https, from
 * the Host header, which is what Railway's TLS proxy serves), the browser its own once the page
 * hydrated (http here)
 */
const atSite = (baseURL: string | undefined, path: string) =>
	expect.stringMatching(
		new RegExp(`^https?://${`${new URL(baseURL ?? '').host}${path}`.replace(/[.?]/g, '\\$&')}$`)
	);

/** The page's Open Graph and twitter:* tags, each written once */
const previewTags = async (page: Page): Promise<Record<string, string>> => {
	const tags = await page
		.locator('meta[property^="og:"], meta[name^="twitter:"]')
		.evaluateAll((metas) =>
			metas.map((meta) => [
				meta.getAttribute('property') ?? meta.getAttribute('name') ?? '',
				meta.getAttribute('content') ?? ''
			])
		);
	const names = tags.map(([name]) => name);
	expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
	return Object.fromEntries(tags);
};

/** Text of the server's HTML, its entities decoded */
const decode = (text: string) =>
	text.replace(
		/&(quot|#34|lt|gt|#39|amp);/g,
		(entity, name: string) =>
			({ quot: '"', '#34': '"', lt: '<', gt: '>', '#39': "'", amp: '&' })[name] ?? entity
	);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * What a link preview's crawler (LinkedIn's) reads of a page: the server's answer, no script run,
 * and the values of its tags as they are written there. A fresh context: a crawler keeps no
 * cookie, so no `?lang=` fetched before changes the language of the next page
 */
const crawl = async (
	playwright: PlaywrightWorkerArgs['playwright'],
	baseURL: string | undefined,
	path: string
) => {
	const context = await playwright.request.newContext({
		baseURL,
		extraHTTPHeaders: {
			'user-agent': 'LinkedInBot/1.0 (compatible; Mozilla/5.0; +http://www.linkedin.com)'
		}
	});
	try {
		// Redirects followed, as a crawler does: the bare address sends on to the experiences
		const response = await context.get(path);
		expect({ path, status: response.status() }).toEqual({ path, status: 200 });
		const html = await response.text();
		const values = (attribute: 'property' | 'name', key: string) =>
			[...html.matchAll(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`, 'g'))].map(
				(match) => decode(match[1])
			);
		return {
			html,
			title: [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((match) => decode(match[1])),
			og: (key: string) => values('property', key),
			meta: (key: string) => values('name', key)
		};
	} finally {
		await context.dispose();
	}
};

test.describe('a portfolio', () => {
	for (const path of [
		`/${DOMAIN}/experiences`,
		`/${DOMAIN}/experiences?view=timeline`,
		`/${DOMAIN}/hire`,
		`/${DOMAIN}/admin`
	]) {
		test(`${path} is not listed`, async ({ page }) => {
			const response = await page.goto(path);

			expect(response?.status()).toBe(200);
			expect(robotsHeader(response)).toMatch(/\bnoindex\b/);
			await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
			await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/);
			// It names no address for search engines to list instead
			await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
			await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
		});
	}

	// The pages a visitor is sent to keep the preview a shared link gets (OpenGraph.svelte): what
	// the page shows anyone, and the generic picture of its kind in its language
	for (const { path, image } of [
		{ path: `/${DOMAIN}/experiences`, image: 'og-portfolio' },
		{ path: `/${DOMAIN}/experiences?view=timeline`, image: 'og-portfolio' },
		{ path: `/${DOMAIN}/hire`, image: 'og-hire' }
	]) {
		test(`${path} keeps its preview tags`, async ({ page, request, baseURL }) => {
			const { name, tagline } = await portfolioHeading(request);
			await page.goto(path);
			const tags = await previewTags(page);
			const description = await page.locator('meta[name="description"]').getAttribute('content');

			expect(tags).toEqual({
				'og:type': 'website',
				'og:site_name': 'Portfolio',
				// The experiences page: the name the portfolio is headed with and its tagline (or the
				// page's description); the page for recruiters: its title and description
				'og:title': image === 'og-hire' ? `Propose a role to ${name}` : name,
				'og:description': image === 'og-hire' ? description : (tagline ?? description),
				// The page's address, without its states
				'og:url': atSite(baseURL, new URL(path, baseURL).pathname),
				'og:locale': 'en_GB',
				'og:image': atSite(baseURL, `/${image}.png`),
				'og:image:width': '1200',
				'og:image:height': '630',
				'og:image:alt': expect.stringMatching(/\w/),
				'twitter:card': 'summary_large_image',
				'twitter:image:alt': tags['og:image:alt']
			});
			if (image === 'og-hire') await expect(page).toHaveTitle(tags['og:title']);
			// Without a tagline, the page's description names the portfolio as its title does
			else if (!tagline) expect(description).toMatch(new RegExp(`^${escapeRegExp(name)}:`));
			const picture = await request.get(new URL(tags['og:image']).pathname);
			expect(picture.status()).toBe(200);
			expect(picture.headers()['content-type']).toBe('image/png');
		});
	}

	test('the admin page is no page to preview', async ({ page }) => {
		await page.goto(`/${DOMAIN}/admin`);
		await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
		await expect(page.locator('meta[property^="og:"]')).toHaveCount(0);
		await expect(page.locator('meta[name^="twitter:"]')).toHaveCount(0);
	});

	test('in French too, and its data requests', async ({ page, request, baseURL }) => {
		const { name } = await portfolioHeading(request);
		const response = await page.goto(`/${DOMAIN}/experiences?lang=fr`);
		expect(robotsHeader(response)).toMatch(/\bnoindex\b/);
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/);
		expect(await previewTags(page)).toMatchObject({
			'og:url': atSite(baseURL, `/${DOMAIN}/experiences?lang=fr`),
			'og:locale': 'fr_FR',
			'og:image': atSite(baseURL, '/og-portfolio-fr.png'),
			'og:image:alt': expect.stringMatching(/^Des compétences à vérifier/)
		});

		await page.goto(`/${DOMAIN}/hire?lang=fr`);
		const hire = await previewTags(page);
		expect(hire).toMatchObject({
			'og:title': `Proposer un poste à ${name}`,
			'og:url': atSite(baseURL, `/${DOMAIN}/hire?lang=fr`),
			'og:locale': 'fr_FR',
			'og:image': atSite(baseURL, '/og-hire-fr.png'),
			'og:image:alt': expect.stringMatching(/^Une page recruteurs/)
		});
		expect((await request.get(new URL(hire['og:image']).pathname)).ok()).toBe(true);

		// The whole portfolio, as the page loads it on a client-side navigation
		const data = await request.get(`/${DOMAIN}/experiences/__data.json`);
		expect(data.ok()).toBe(true);
		expect(robotsHeader(data)).toMatch(/\bnoindex\b/);
	});

	test('a link preview reads its tags in the HTML the server sends', async ({
		request,
		playwright,
		baseURL
	}) => {
		const { name, tagline } = await portfolioHeading(request);
		for (const { path, url, image, french } of [
			// The link people copy (CopyLink, the share kit): the bare address, sent on to the
			// experiences page, in the language it asks for
			{ path: `/${DOMAIN}`, url: `/${DOMAIN}/experiences`, image: 'og-portfolio.png' },
			{
				path: `/${DOMAIN}?lang=fr`,
				url: `/${DOMAIN}/experiences?lang=fr`,
				image: 'og-portfolio-fr.png',
				french: true
			},
			{
				path: `/${DOMAIN}/experiences?view=timeline`,
				url: `/${DOMAIN}/experiences`,
				image: 'og-portfolio.png'
			},
			{ path: `/${DOMAIN}/hire`, url: `/${DOMAIN}/hire`, image: 'og-hire.png' },
			{
				path: `/${DOMAIN}/hire?lang=fr`,
				url: `/${DOMAIN}/hire?lang=fr`,
				image: 'og-hire-fr.png',
				french: true
			}
		]) {
			const { og, meta, html } = await crawl(playwright, baseURL, path);
			const hire = path.includes('/hire');
			const description = meta('description');
			expect({ path, descriptions: description.length }).toEqual({ path, descriptions: 1 });
			const title = hire ? `${french ? 'Proposer un poste à' : 'Propose a role to'} ${name}` : name;
			const alt = hire
				? french
					? /^Une page recruteurs/
					: /^A page for recruiters/
				: french
					? /^Des compétences à vérifier/
					: /^Skills you can check/;
			expect({
				path,
				title: og('og:title'),
				description: og('og:description'),
				url: og('og:url'),
				locale: og('og:locale'),
				image: og('og:image'),
				alt: og('og:image:alt'),
				card: meta('twitter:card'),
				twitterAlt: meta('twitter:image:alt')
			}).toEqual({
				path,
				title: [title],
				// The page for recruiters: its own description (the journey's steps); the experiences
				// page: the tagline, or its own description
				description: hire || !tagline ? description : [tagline],
				url: [atSite(baseURL, url)],
				locale: [french ? 'fr_FR' : 'en_GB'],
				image: [atSite(baseURL, `/${image}`)],
				alt: [expect.stringMatching(alt)],
				card: ['summary_large_image'],
				twitterAlt: og('og:image:alt')
			});
			expect(html).toMatch(/<meta name="robots" content="[^"]*\bnoindex\b/);
		}
	});

	test("its title and tagline are its preview, escaped in the server's HTML", async ({
		request,
		playwright,
		baseURL
	}) => {
		// As seed:e2e sets them on every run
		expect(await portfolioHeading(request, PREVIEW)).toEqual(PREVIEW_HEADING);
		const { name, tagline } = PREVIEW_HEADING;

		const experiences = await crawl(playwright, baseURL, `/${PREVIEW}/experiences`);
		expect(experiences.og('og:title')).toEqual([name]);
		expect(experiences.og('og:description')).toEqual([tagline]);
		// The page's own title and description name it the same way
		expect(experiences.title).toEqual([`${name} | Experiences`]);
		expect(experiences.meta('description')).toEqual([
			`${name}: professional experiences, personal and educational projects and courses.`
		]);

		const hire = await crawl(playwright, baseURL, `/${PREVIEW}/hire?lang=fr`);
		expect(hire.og('og:title')).toEqual([`Proposer un poste à ${name}`]);
		expect(hire.title).toEqual([`Proposer un poste à ${name}`]);
		expect(hire.og('og:description')).toEqual(hire.meta('description'));
		expect(hire.og('og:description')[0]).toContain(name);
		// A preview shows the description under the title: it does not say the title again
		expect(hire.og('og:description')[0]).not.toContain('Proposer un poste');

		// What the owner wrote never reaches the HTML as markup
		for (const { html } of [experiences, hire]) expect(html).not.toContain('<Lyon>');
	});

	test('its bare address redirects to its experiences, not listed either', async ({ request }) => {
		const redirect = await request.get(`/${DOMAIN}`, { maxRedirects: 0 });
		expect(redirect.status()).toBe(302);
		expect(redirect.headers()['location']).toBe(`/${DOMAIN}/experiences`);
		expect(robotsHeader(redirect)).toMatch(/\bnoindex\b/);
	});

	test('the address of a name nobody claimed is not listed either', async ({ page, request }) => {
		// Rendered by the root error page, without the portfolio's layout (and its robots meta):
		// the header says it
		const response = await page.goto(`/${UNCLAIMED}/experiences`);
		expect(response?.status()).toBe(404);
		expect(robotsHeader(response)).toMatch(/\bnoindex\b/);
		await expect(page.getByRole('heading', { name: UNCLAIMED })).toBeVisible();

		// The bare name too (its layout answers before the page could redirect)
		const bare = await request.get(`/${UNCLAIMED}`, { maxRedirects: 0 });
		expect(bare.status()).toBe(404);
		expect(robotsHeader(bare)).toMatch(/\bnoindex\b/);
	});
});

test('the private pages are not listed', async ({ page }) => {
	for (const path of [
		'/account',
		'/recruiter/jobs/new',
		'/recruiter/jobs/65e2e00000000000000000aa',
		// The candidates of a job, proposed by matching (an anonymous card at a time)
		'/recruiter/jobs/65e2e00000000000000000aa/candidates',
		// The reviewers' page of matching (not available to anyone else)
		'/recruiter/reviews',
		// The candidate's inbox of matching, and the private page of a job description
		'/opportunities',
		'/opportunities/65e2e00000000000000000aa'
	]) {
		const response = await page.goto(path);
		expect({ path, status: response?.status() }).toEqual({ path, status: 200 });
		expect({ path, robots: robotsHeader(response) }).toEqual({
			path,
			robots: expect.stringMatching(/\bnoindex\b/)
		});
		// The meta: in the server's HTML for /account, written once the page's script ran in the
		// recruiter space and on /opportunities, which are rendered in the browser only. Their
		// layout writes it with the rest of its head, so the links below are checked on the page
		// as it shows
		await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/);
		// It names no address for search engines to list instead
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
		await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
	}
});

test('the landing page and the legal pages stay listed, with their canonical links', async ({
	page
}) => {
	for (const path of ['/', '/?lang=fr', '/legal', '/legal/privacy', '/legal/terms', '/recruiter']) {
		const response = await page.goto(path);
		expect({ path, status: response?.status() }).toEqual({ path, status: 200 });
		expect({ path, robots: robotsHeader(response) }).toEqual({ path, robots: undefined });
		// The recruiter landing is rendered in the browser only: its canonical link, written with
		// its layout's head, says the page has shown before the meta is looked for
		await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
		await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
	}
});

test('the job board is gone: /jobs answers 410, and says why in the visitor’s language', async ({
	request
}) => {
	const english = await request.get('/jobs');
	expect(english.status()).toBe(410);
	expect(await english.text()).toBe(
		"Portfolio no longer publishes job descriptions: a recruiter shares theirs with a candidate on the candidate's page for recruiters."
	);
	const french = await request.get('/jobs?lang=fr');
	expect(french.status()).toBe(410);
	expect(french.headers()['content-language']).toBe('fr');
	expect(await french.text()).toMatch(/^Portfolio ne publie plus d'offres d'emploi/);
});

test('robots.txt refuses nothing, so crawlers can read that a portfolio is not listed', async ({
	request
}) => {
	const response = await request.get('/robots.txt');
	expect(response.ok()).toBe(true);
	const rules = (await response.text())
		.split('\n')
		.map((line) => line.replace(/#.*/, '').trim())
		.filter(Boolean);
	expect(rules).toContain('User-agent: *');
	expect(rules.filter((rule) => /^disallow:/i.test(rule))).toEqual(['Disallow:']);
});

test('the API asks search engines not to list its answers', async ({ request }) => {
	for (const path of ['/health', `/domain/${DOMAIN}`, `/domain/${UNCLAIMED}`]) {
		const response = await request.get(`${API_URL}${path}`);
		expect({ path, robots: robotsHeader(response) }).toEqual({
			path,
			robots: expect.stringMatching(/\bnoindex\b/)
		});
	}
});
