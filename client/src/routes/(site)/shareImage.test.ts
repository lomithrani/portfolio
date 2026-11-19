import { describe, expect, test } from 'vitest';
import { LOCALES, withLocale } from 'portfolio-common';
import { plainText } from '#lib/i18n/rich.ts';
import { m } from './page.messages.ts';
import { landingImageSide } from './shareImage.ts';

/** A text as the alternative text says it: without its last full stop, whatever its case */
const words = (text: string) => text.replace(/\.$/, '').toLowerCase();

describe("the landing page's share image", () => {
	test('its alternative text says what the picture says, in each language', () => {
		// render.mjs draws the headline, its accent and landingImageSide's lines
		for (const locale of LOCALES)
			withLocale(locale, () => {
				const alt = m.meta.imageAlt.toLowerCase();
				expect(alt).toContain(words(m.hero.headline));
				expect(alt).toContain(words(plainText(m.hero.headlineAccent)));
				const side = landingImageSide();
				expect(side).toHaveLength(3);
				for (const line of side) expect(alt).toContain(words(line));
			});
	});

	test('its lines are the promises of the page, in the language in use', () => {
		expect(withLocale('en', landingImageSide)).toEqual([
			'You never pay',
			'The pay first, if you ask',
			'Your steps, your order'
		]);
		expect(withLocale('fr', landingImageSide)[1]).toBe(
			"La rémunération d'abord, si vous le demandez"
		);
	});
});
