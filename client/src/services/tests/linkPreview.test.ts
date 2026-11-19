import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { LOCALES, withLocale } from 'portfolio-common';
import {
	PREVIEW_IMAGES,
	PREVIEW_IMAGE_SIZE,
	portfolioName,
	portfolioPreview,
	previewImage,
	type PreviewImageKind
} from '../linkPreview.ts';
import { m } from '../linkPreview.messages.ts';

const KINDS = Object.keys(PREVIEW_IMAGES) as PreviewImageKind[];

/** The width and height a PNG file declares (its IHDR chunk), or undefined for another file */
const pngSize = (file: string) => {
	const bytes = readFileSync(fileURLToPath(new URL(`../../../static/${file}`, import.meta.url)));
	if (bytes.subarray(1, 4).toString('ascii') !== 'PNG') return undefined;
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

describe('the picture of a preview', () => {
	test('is an absolute address, in the language of the page', () => {
		const origin = 'https://portfolio.example';
		expect(withLocale('en', () => previewImage('portfolio', origin).url)).toBe(
			'https://portfolio.example/og-portfolio.png'
		);
		expect(withLocale('fr', () => previewImage('portfolio', origin).url)).toBe(
			'https://portfolio.example/og-portfolio-fr.png'
		);
		expect(withLocale('en', () => previewImage('hire', origin).url)).toBe(
			'https://portfolio.example/og-hire.png'
		);
		expect(withLocale('fr', () => previewImage('hire', `${origin}/`).url)).toBe(
			'https://portfolio.example/og-hire-fr.png'
		);
	});

	test('each one is in client/static, a PNG of the size the preview says', () => {
		for (const kind of KINDS)
			for (const locale of LOCALES) {
				const file = PREVIEW_IMAGES[kind][locale];
				expect({ file, size: pngSize(file) }).toEqual({ file, size: PREVIEW_IMAGE_SIZE });
			}
		expect(withLocale('fr', () => previewImage('hire', 'https://a.example'))).toMatchObject(
			PREVIEW_IMAGE_SIZE
		);
	});

	test('its alternative text says what the picture says, in the language of the page', () => {
		// render.mjs draws the headline and its accent: the alternative text has both
		const words = (text: string) => text.replace(/\.$/, '').toLowerCase();
		for (const kind of KINDS)
			for (const locale of LOCALES)
				withLocale(locale, () => {
					const { alt } = previewImage(kind, 'https://a.example');
					expect(alt).toBe(m[kind].alt);
					expect(alt.toLowerCase()).toContain(words(m[kind].headline));
					expect(alt.toLowerCase()).toContain(words(m[kind].accent));
				});
		expect(withLocale('fr', () => previewImage('hire', 'https://a.example').alt)).toMatch(
			/^Une page recruteurs/
		);
	});

	test('the page for recruiters promises nothing a journey may not ask, and stays neutral', () => {
		// The default journey is a meeting alone, open to anyone signed out: no sign-in, no job, no
		// score is asked of every recruiter. And anyone sees the picture where the link is posted:
		// it never calls the owner a candidate (having a portfolio says nothing about looking)
		for (const locale of LOCALES)
			withLocale(locale, () => {
				const { headline, accent, side, alt } = m.hire;
				const texts = [headline, accent, ...side, alt].join(' ').toLowerCase();
				expect(texts).not.toMatch(/sign|connexion|connect|google|login/);
				expect(texts).not.toMatch(/\bjob\b|\boffre|score|pay\b|rémunération|meeting|rendez-vous/);
				expect(texts).not.toMatch(/candidat/);
			});
	});
});

describe("a portfolio's preview", () => {
	test('is headed like the portfolio: its title, or its address name without one', () => {
		expect(portfolioName({ name: 'jane.doe', headerTitle: ' Jane Doe ' })).toBe('Jane Doe');
		expect(portfolioName({ name: 'jane.doe' })).toBe('jane.doe');
		expect(portfolioName({ name: 'jane.doe', headerTitle: '   ' })).toBe('jane.doe');
		expect(portfolioName({ name: 'jane.doe', headerTitle: null })).toBe('jane.doe');
	});

	test("says the portfolio's tagline, or the page's description without one", () => {
		expect(
			portfolioPreview(
				{ name: 'jane.doe', headerTitle: 'Jane Doe', headerSubtitle: ' Staff engineer, Lyon ' },
				'The page'
			)
		).toEqual({ title: 'Jane Doe', description: 'Staff engineer, Lyon' });
		expect(portfolioPreview({ name: 'jane.doe', headerSubtitle: ' ' }, 'The page')).toEqual({
			title: 'jane.doe',
			description: 'The page'
		});
		// A title that looks like a date stays the owner's text
		expect(portfolioPreview({ name: 'jane.doe', headerTitle: '2027-01-01' }, 'x').title).toBe(
			'2027-01-01'
		);
	});
});
