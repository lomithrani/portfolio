import { describe, expect, test } from 'vitest';
import { LOCALES, withLocale } from 'portfolio-common';
import { plainText } from '#lib/i18n/rich.ts';
import { m } from './page.messages.ts';
import { landingImageSide, landingImageSteps } from './shareImage.ts';

/**
 * A text as the alternative text says it: without its last full stop, whatever its case, its
 * no-break spaces (which only keep a title's words together on its line) read as spaces
 */
const words = (text: string) =>
	text
		.replace(/\u00a0/g, ' ')
		.replace(/\.$/, '')
		.toLowerCase();

describe("the landing page's share image", () => {
	test('its alternative text says what the picture says, in each language', () => {
		// render.mjs draws the headline, its accent, landingImageSteps' steps and landingImageSide's
		// lines
		for (const locale of LOCALES)
			withLocale(locale, () => {
				const alt = m.meta.imageAlt.toLowerCase();
				expect(alt).toContain(words(plainText(m.hero.headline)));
				expect(alt).toContain(words(plainText(m.hero.headlineAccent)));
				const steps = landingImageSteps();
				expect(steps).toHaveLength(4);
				for (const step of steps) expect(alt).toContain(words(step));
				const side = landingImageSide();
				expect(side).toHaveLength(3);
				for (const line of side) expect(alt).toContain(words(line));
			});
	});

	test('its steps name the job match step as recruiters read it', () => {
		// "Get the job scored", « Faire noter l'offre »: never « Note » for the score in French,
		// the note step's word
		expect(withLocale('en', landingImageSteps)[2]).toBe('Scored');
		expect(withLocale('fr', landingImageSteps)[2]).toBe('Notée');
		expect(withLocale('en', () => m.meta.imageAlt)).toContain('scored 86 out of 100');
		expect(withLocale('fr', () => m.meta.imageAlt)).toContain('notée 86 sur 100');
	});

	test('its lines are the promises of the page, in the language in use', () => {
		// "The job first": under "You never pay", "the pay first" could read as "you pay first"
		expect(withLocale('en', landingImageSide)).toEqual([
			'You never pay',
			'The job first, if you ask',
			'Your steps, your order'
		]);
		expect(withLocale('fr', landingImageSide)[1]).toBe(
			"L'offre d'abord, si\u00a0vous\u00a0le\u00a0demandez"
		);
	});
});
