import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
	defineMessages,
	getLocale,
	intlLocale,
	messageProblems,
	messageSource,
	parseLocale,
	plural,
	preferredLocale,
	requestLocale,
	withLocale
} from 'portfolio-common';
import { plainText, richParts } from './rich.ts';
import { localeAlternate, localeHref } from './urls.ts';

describe('the language of a request', () => {
	test('a language is read from its code, whatever its case or region', () => {
		expect(parseLocale('fr')).toBe('fr');
		expect(parseLocale(' FR ')).toBe('fr');
		expect(parseLocale('fr-CA')).toBe('fr');
		expect(parseLocale('en_GB')).toBe('en');
		expect(parseLocale('de')).toBeUndefined();
		expect(parseLocale('')).toBeUndefined();
		expect(parseLocale(null)).toBeUndefined();
	});

	test('Accept-Language gives the preferred language we have', () => {
		expect(preferredLocale('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
		expect(preferredLocale('en-US,en;q=0.9,fr;q=0.8')).toBe('en');
		expect(preferredLocale('de,en;q=0.5,fr;q=0.7')).toBe('fr');
		expect(preferredLocale('de-DE,de;q=0.9')).toBeUndefined();
		expect(preferredLocale('fr;q=0,en;q=0.1')).toBe('en');
		expect(preferredLocale('*')).toBeUndefined();
		expect(preferredLocale(null)).toBeUndefined();
	});

	test('the URL wins over the saved choice, which wins over the browser', () => {
		const browser = 'fr-FR,fr;q=0.9';
		expect(requestLocale({ param: 'en', cookie: 'fr', acceptLanguage: browser })).toBe('en');
		expect(requestLocale({ cookie: 'en', acceptLanguage: browser })).toBe('en');
		expect(requestLocale({ acceptLanguage: browser })).toBe('fr');
		expect(requestLocale({ param: 'xx', cookie: 'yy', acceptLanguage: 'de' })).toBe('en');
		expect(requestLocale({})).toBe('en');
	});
});

describe('messages', () => {
	const m = defineMessages({
		save: { en: 'Save', fr: 'Enregistrer' },
		group: {
			items: {
				en: (count: number) => `${count} ${plural(count, 'item', 'items')}`,
				fr: (count: number) => `${count} ${plural(count, 'élément', 'éléments')}`
			}
		}
	});

	test('a message gives the text of the language in use when it is read', () => {
		expect(getLocale()).toBe('en');
		expect(m.save).toBe('Save');
		expect(withLocale('fr', () => m.save)).toBe('Enregistrer');
		expect(m.save).toBe('Save');
	});

	test('plurals follow each language: zero is plural in English, singular in French', () => {
		expect([0, 1, 2].map((count) => m.group.items(count))).toEqual([
			'0 items',
			'1 item',
			'2 items'
		]);
		expect(withLocale('fr', () => [0, 1, 2].map((count) => m.group.items(count)))).toEqual([
			'0 élément',
			'1 élément',
			'2 éléments'
		]);
	});

	test('French gets unbreakable spaces before its punctuation, typed as plain spaces', () => {
		const french = defineMessages({
			question: { en: 'Is it free?', fr: 'Est-ce gratuit ?' },
			quoted: {
				en: (status: string) => `Status: "${status}"`,
				fr: (status: string) => `Statut : « ${status} »`
			},
			list: { en: ['One: two'], fr: ['Un : deux'] }
		});
		expect(french.question).toBe('Is it free?');
		expect(french.quoted('Open')).toBe('Status: "Open"');
		expect(withLocale('fr', () => french.question)).toBe('Est-ce gratuit\u00a0?');
		expect(withLocale('fr', () => french.quoted('Ouverte'))).toBe(
			'Statut\u00a0: «\u00a0Ouverte\u00a0»'
		);
		expect(withLocale('fr', () => french.list)).toEqual(['Un\u00a0: deux']);
	});

	test('messages list like the object they were declared as', () => {
		expect(Object.keys(m)).toEqual(['save', 'group']);
		expect(withLocale('fr', () => ({ ...m }).save)).toBe('Enregistrer');
	});

	test('Intl gets fr-FR in French and the tag English used before', () => {
		expect(intlLocale()).toBe('en-GB');
		expect(intlLocale('en-US')).toBe('en-US');
		expect(intlLocale(undefined)).toBeUndefined();
		expect(withLocale('fr', () => intlLocale('en-US'))).toBe('fr-FR');
	});

	test('a declaration with a missing, empty or mismatched language is reported', () => {
		const problems = messageProblems({
			fine: { en: 'Read the <terms>terms</terms>.', fr: 'Lisez les <terms>conditions</terms>.' },
			empty: { en: 'Text', fr: ' ' },
			tags: { en: 'Read the <terms>terms</terms>.', fr: 'Lisez les conditions.' },
			kind: { en: 'Text', fr: () => 'Texte' },
			nested: { missing: { en: 'Text' } }
		} as never);
		expect(problems.map(({ path }) => path)).toEqual(['empty', 'tags', 'kind', 'nested.missing']);
	});
});

describe('rich messages', () => {
	test('a message is cut into plain text and tagged passages', () => {
		expect(richParts('Details in the <privacy>privacy policy</privacy>.')).toEqual([
			{ text: 'Details in the ' },
			{ tag: 'privacy', text: 'privacy policy' },
			{ text: '.' }
		]);
		expect(richParts('<a>One</a> and <b>two</b>')).toEqual([
			{ tag: 'a', text: 'One' },
			{ text: ' and ' },
			{ tag: 'b', text: 'two' }
		]);
		expect(richParts('No tags, 2 < 3 > 1')).toEqual([{ text: 'No tags, 2 < 3 > 1' }]);
		expect(plainText('Read the <terms>terms of use</terms>.')).toBe('Read the terms of use.');
	});
});

describe('language links', () => {
	test('the switch links to the same page, its other parameters kept', () => {
		const url = new URL('https://example.test/louis.gentil/experiences?view=timeline&lang=en#top');
		expect(localeHref(url, 'fr')).toBe('/louis.gentil/experiences?view=timeline&lang=fr#top');
		expect(localeHref(new URL('https://example.test/'), 'fr')).toBe('/?lang=fr');
	});

	test('the alternate of a page is its bare address in English, ?lang=fr in French', () => {
		const url = new URL('https://example.test/legal/privacy?lang=fr&x=1');
		expect(localeAlternate(url, 'en')).toBe('https://example.test/legal/privacy');
		expect(localeAlternate(url, 'fr')).toBe('https://example.test/legal/privacy?lang=fr');
	});
});

describe('every *.messages.ts file', () => {
	// Listed from the disk when the tests run, not with import.meta.glob: a glob is expanded when
	// the test file is transformed, and a cached transform would miss the files added since
	const roots = [
		fileURLToPath(new URL('../..', import.meta.url)),
		fileURLToPath(new URL('../../../../common', import.meta.url))
	];
	const files = roots.flatMap((root) =>
		readdirSync(root, { recursive: true, encoding: 'utf8' })
			.filter((file) => file.endsWith('.messages.ts') && !file.includes('node_modules'))
			.map((file) => join(root, file))
	);

	test('there are message files to check', () => {
		expect(files.length).toBeGreaterThan(50);
	});

	test.each(files)('%s is complete in both languages', async (file) => {
		const module = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
		const declarations = Object.values(module)
			.map(messageSource)
			.filter((source) => source !== undefined);
		expect(declarations.length).toBeGreaterThan(0);
		expect(declarations.flatMap((source) => messageProblems(source))).toEqual([]);
	});
});
