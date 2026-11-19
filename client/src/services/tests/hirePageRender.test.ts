import { describe, it, expect, vi } from 'vitest';
import { render } from 'svelte/server';
import { stepManifest, stepManifests, withLocale } from 'portfolio-common';

// The page for recruiters as the server serves it (what a page without JavaScript and a link
// preview get), from the data its load returns (+page.server.ts, tested in hirePageLoad.test.ts):
// here with a meeting type to book, which the e2e API cannot have (it connects no Google
// Calendar, so its pages for recruiters are always closed). Nothing is asked of the API: the
// browser's loads run on mount, which a server render never reaches.

vi.mock('#services', () => ({ portfolioTextApi: {} }));
vi.mock('$app/navigation', () => ({
	afterNavigate: () => {},
	beforeNavigate: () => {},
	goto: async () => {},
	replaceState: () => {}
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://portfolio.example/jane.doe/hire') }
}));

const { default: HirePage } = await import('../../routes/[domain]/hire/+page.svelte');

const step = (type: string, config?: object) => ({
	id: type,
	type,
	status: 'pending' as const,
	...(config ? { config } : {})
});

/** The gate journey, as anyone signed out gets it */
const GATE = {
	steps: [
		step('note', { title: 'Before we talk', text: 'Remote only.' }),
		step('job'),
		step('job-match', { minScore: 70 }),
		step('meeting')
	]
};

const served = (bookable: boolean | null, locale: 'en' | 'fr' = 'en', journey = GATE) =>
	withLocale(locale, () => {
		const data = {
			domain: { name: 'jane.doe', headerTitle: 'Jane Doe' },
			domainName: 'jane.doe',
			journey,
			bookable
		};
		const { head, body } = render(HirePage, { props: { data } as never });
		return { head, body };
	});

/** What a reader gets of some HTML: tags dropped, entities and spaces as text */
const text = (html: string) =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * Some HTML without the elements a page without scripts hides (`noscript:hidden`), their content
 * included
 */
const withoutHiddenNoScript = (html: string): string => {
	const open = /<([a-z]+)\b[^>]*\bclass="[^"]*\bnoscript:hidden\b[^"]*"[^>]*>/.exec(html);
	if (!open) return html;
	// The element's end: its own closing tag, past those of the same name it holds
	const name = open[1];
	const tags = new RegExp(`<(/?)${name}\\b[^>]*>`, 'g');
	tags.lastIndex = open.index + open[0].length;
	let depth = 1;
	let end = html.length;
	for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
		depth += tag[1] ? -1 : 1;
		if (depth === 0) {
			end = tag.index + tag[0].length;
			break;
		}
	}
	return withoutHiddenNoScript(html.slice(0, open.index) + html.slice(end));
};

/** The content of a meta tag of the head, by its name or property */
const meta = (head: string, key: string) =>
	text(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`).exec(head)?.[1] ?? '');

describe('the page for recruiters, served with a meeting type to book', () => {
	it('says before the steps what they ask, what to have at hand and how long they take', () => {
		const page = text(served(true).body);
		expect(page).toContain('Propose a role to Jane Doe');
		expect(page).toContain(
			'Jane Doe asks recruiters to complete 3 steps first. Then pick a time slot'
		);
		expect(page).toContain('Before you start');
		expect(page).toContain('About 8 minutes');
		expect(page).toContain('A Google account, to sign in');
		expect(page).toContain('The job description and its pay range');
		expect(page.indexOf('Before you start')).toBeLessThan(page.indexOf('Step 1:'));
		// Without JavaScript, the steps are said, not gone through; the first one is unfolded
		expect(page).toContain('Turn on JavaScript in your browser to go through the steps.');
		expect(page).toContain('Step 1: Before we talk Read the note, then confirm it. Remote only.');
	});

	it('describes the steps in its meta and link preview, in English and French', () => {
		const { head } = served(true);
		const description =
			"On Jane Doe's page for recruiters: read a note, select or create a job, get the job scored, then book a meeting, in about 8 minutes.";
		expect(meta(head, 'description')).toBe(description);
		expect(meta(head, 'og:description')).toBe(description);
		expect(meta(head, 'og:title')).toBe('Propose a role to Jane Doe');

		const french = served(true, 'fr');
		expect(meta(french.head, 'og:description')).toBe(
			"Sur la page recruteurs de Jane Doe : lire une note, choisir ou créer une offre, faire noter l'offre, puis réserver un rendez-vous, en 8 minutes environ."
		);
		const page = text(french.body);
		expect(page).toContain('Proposer un poste à Jane Doe');
		expect(page).toContain('Avant de commencer');
		expect(page).toContain('8 minutes environ');
	});

	it('promises nothing when nobody can book, and says the steps wait', () => {
		const { head, body } = served(false);
		const page = text(body);
		expect(page).toContain(
			'Jane Doe does not take meeting requests online right now: the steps open once they do.'
		);
		expect(page).not.toContain('Before you start');
		expect(page).not.toMatch(/About \d+ minutes|calendar invitation/);
		expect(meta(head, 'og:description')).toBe(
			"Jane Doe's page for recruiters. They do not take meeting requests online right now."
		);
		// Read-only: no step unfolds, nor offers to open
		expect(page).toContain('Step 1: Before we talk');
		expect(page).not.toContain('Remote only.');
		expect(body).not.toMatch(/<button[^>]*>\s*Open\b/);
	});

	it('unfolds every step type that can come first, its loading states without words', () => {
		// The e2e API cannot serve these unfolded: its pages for recruiters are always closed
		const firsts = stepManifests()
			.filter((manifest) => manifest.kind === 'requirement' && !manifest.needs?.length)
			.map((manifest) => manifest.type);
		expect(firsts).toEqual(expect.arrayContaining(['note', 'job']));
		for (const type of firsts) {
			const config =
				type === 'note' ? { title: 'Before we talk', text: 'Remote only.' } : undefined;
			const page = text(served(true, 'en', { steps: [step(type, config), step('meeting')] }).body);
			const name = config?.title ?? stepManifest(type)?.label;
			expect(page, type).toContain(`Step 1: ${name}`);
			expect(page, type).toContain('Step 2: Book a meeting (locked)');
			expect(page, type).not.toMatch(/Loading|Checking/);
		}
	});

	it('hides its loading placeholders where scripts do not run, which never replace them', () => {
		// The steps that can come first unfolded (the note and job steps wait for the session), the
		// booking alone (its meeting types load in the browser), the journey the server could not read
		const pages = [
			served(true, 'en', {
				steps: [step('note', { title: 'Hi', text: 'Read me' }), step('meeting')]
			}),
			served(true, 'en', { steps: [step('job'), step('meeting')] }),
			served(null, 'en', { steps: [step('meeting')] }),
			served(null, 'en', null as never)
		];
		const placeholder = /<[^>]*\bclass="[^"]*\b(?:placeholder|animate-pulse)\b[^"]*"[^>]*>/;
		for (const { body } of pages) {
			expect(body).toMatch(placeholder);
			// Without what a page without scripts hides (`noscript:hidden`, a media query on
			// `scripting: none`), no placeholder is left
			expect(withoutHiddenNoScript(body)).not.toMatch(placeholder);
		}
	});
});
