// The languages of the site (English and French) and the texts written in both.
//
// Every text a person reads is a message: an object with one entry per language, declared with
// defineMessages() in a `*.messages.ts` file next to the code that shows it. A message is read
// like a plain property (`m.save`) and gives the text of the language in use at that moment
// (getLocale()), so it must be read when it is shown, never kept in a module-level constant.
//
// The language in use is ambient: each runtime says how to find it with setLocaleResolver().
// The web server and the API keep it per request (AsyncLocalStorage), the browser for the page.
// Without a resolver (unit tests, scripts) it is English. See docs/I18N.md.

export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

/** The language of a visitor who asked for none we have */
export const DEFAULT_LOCALE: Locale = 'en';

/** Each language in its own words, for the language switch */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français' };

/** Query parameter that asks for a language (`?lang=fr`) and makes it the visitor's choice */
export const LOCALE_PARAM = 'lang';

/** Cookie that keeps the language a visitor chose, for a year */
export const LOCALE_COOKIE = 'lang';
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** A value with one entry per language */
export type Localized<T> = { readonly [L in Locale]: T };

/** The language `value` names (`fr`, `FR`, `fr-CA`), undefined when it is not one of ours */
export const parseLocale = (value: string | null | undefined): Locale | undefined => {
	const language = value?.trim().toLowerCase().split(/[-_]/)[0];
	return LOCALES.find((locale) => locale === language);
};

/**
 * The language an `Accept-Language` header prefers among ours, by its q-values (the first of
 * equal ones); undefined when it lists none of ours
 */
export const preferredLocale = (acceptLanguage: string | null | undefined): Locale | undefined => {
	if (!acceptLanguage) return undefined;
	let best: { locale: Locale; quality: number } | undefined;
	// A header is a short list; one sent to make us work is cut
	for (const entry of acceptLanguage.slice(0, 1000).split(',')) {
		const [tag, ...parameters] = entry.split(';');
		const locale = parseLocale(tag);
		if (!locale) continue;
		const q = parameters.map((parameter) => parameter.trim()).find((p) => p.startsWith('q='));
		const quality = q === undefined ? 1 : Number(q.slice(2));
		if (!(quality > 0) || (best && best.quality >= quality)) continue;
		best = { locale, quality };
	}
	return best?.locale;
};

/**
 * The language of a request: what its URL asks for (`?lang=`), else the visitor's saved choice
 * (the cookie), else what their browser prefers, else English
 */
export const requestLocale = (request: {
	param?: string | null;
	cookie?: string | null;
	acceptLanguage?: string | null;
}): Locale =>
	parseLocale(request.param) ??
	parseLocale(request.cookie) ??
	preferredLocale(request.acceptLanguage) ??
	DEFAULT_LOCALE;

let resolver: () => Locale = () => DEFAULT_LOCALE;

/** How this runtime finds the language in use (per request on a server, per page in a browser) */
export const setLocaleResolver = (resolve: () => Locale): void => {
	resolver = resolve;
};

/** The language in use right now */
export const getLocale = (): Locale => resolver();

/**
 * Runs `run` with `locale` as the language in use, then puts the resolver back. Synchronous
 * only (what `run` awaits runs after): for unit tests and for a text needed in a given language.
 */
export const withLocale = <T>(locale: Locale, run: () => T): T => {
	const previous = resolver;
	resolver = () => locale;
	try {
		return run();
	} finally {
		resolver = previous;
	}
};

/** The entry of `text` for the language in use */
export const localized = <T>(text: Localized<T>): T => text[getLocale()] ?? text[DEFAULT_LOCALE];

/**
 * The tag to give `Intl` and `toLocale*String`: `fr-FR` in French, `english` otherwise (the
 * tag the call used before the site had two languages, so English output does not change:
 * `intlLocale('en-US')`, or `intlLocale(undefined)` for the browser's own). `en-GB` when the
 * call gives none.
 */
export function intlLocale(): 'en-GB' | 'fr-FR';
export function intlLocale<T extends string | undefined>(english: T): T | 'fr-FR';
export function intlLocale(...english: [string | undefined] | []): string | undefined {
	if (getLocale() === 'fr') return 'fr-FR';
	return english.length ? english[0] : 'en-GB';
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

/**
 * `one` or `other` for `count`, by the rules of the language in use: English says "0 projects",
 * French "0 projet"
 */
export const plural = <T>(count: number, one: T, other: T): T => {
	const locale = getLocale();
	let rules = pluralRules.get(locale);
	if (!rules) {
		rules = new Intl.PluralRules(locale);
		pluralRules.set(locale, rules);
	}
	return rules.select(count) === 'one' ? one : other;
};

/** Messages as they are declared: groups of messages, each with one entry per language */
export type MessageTree = { readonly [key: string]: Localized<unknown> | MessageTree };

/** Messages as they are read: each one gives the entry of the language in use */
export type Messages<T> = {
	readonly [K in keyof T]: T[K] extends Localized<infer V> ? V : Messages<T[K]>;
};

const SOURCE = Symbol('messages');

const isMessage = (node: object): node is Localized<unknown> => DEFAULT_LOCALE in node;

const resolveTree = (tree: MessageTree): object => {
	const messages = {};
	for (const [key, node] of Object.entries(tree)) {
		if (isMessage(node)) {
			Object.defineProperty(messages, key, { enumerable: true, get: () => localized(node) });
		} else {
			Object.defineProperty(messages, key, { enumerable: true, value: resolveTree(node) });
		}
	}
	return messages;
};

/**
 * Declares messages. Each one is `{ en, fr }`: two strings, or two functions for a text with
 * values in it (`(count: number) => ...`), or two arrays. Groups nest; a group cannot be named
 * `en` or `fr`. What comes back has the same shape, where reading a message gives the entry of
 * the language in use.
 *
 *     const m = defineMessages({
 *       save: { en: 'Save', fr: 'Enregistrer' },
 *       saved: { en: (name: string) => `${name} saved`, fr: (name: string) => `${name} enregistré` }
 *     });
 *     m.save; m.saved('Draft');
 */
export const defineMessages = <T extends MessageTree>(tree: T): Messages<T> => {
	const messages = resolveTree(tree);
	Object.defineProperty(messages, SOURCE, { value: tree });
	return messages as Messages<T>;
};

/** The declaration behind messages made by defineMessages(), for the tests that check them */
export const messageSource = (messages: unknown): MessageTree | undefined =>
	typeof messages === 'object' && messages !== null
		? (messages as { [SOURCE]?: MessageTree })[SOURCE]
		: undefined;

export interface MessageProblem {
	/** Dotted path of the message in its declaration */
	path: string;
	problem: string;
}

const richTags = (text: string) =>
	[...text.matchAll(/<([a-z][a-zA-Z0-9]*)>/g)].map((match) => match[1]).sort();

/**
 * What is wrong in a declaration: a missing or empty language, entries of different kinds, a
 * rich text whose tags (`<a>...</a>`) are not the same in both languages
 */
export const messageProblems = (tree: MessageTree, prefix = ''): MessageProblem[] => {
	const problems: MessageProblem[] = [];
	for (const [key, node] of Object.entries(tree)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (typeof node !== 'object' || node === null) {
			problems.push({ path, problem: 'not a message ({ en, fr }) nor a group' });
			continue;
		}
		if (!isMessage(node)) {
			problems.push(...messageProblems(node, path));
			continue;
		}
		const english = node[DEFAULT_LOCALE];
		for (const locale of LOCALES) {
			const entry = node[locale];
			if (entry === undefined || entry === null) {
				problems.push({ path, problem: `no ${locale}` });
			} else if (typeof entry !== typeof english || Array.isArray(entry) !== Array.isArray(english)) {
				problems.push({ path, problem: `${locale} is not of the same kind as en` });
			} else if (typeof entry === 'string' && typeof english === 'string') {
				if (!entry.trim() && english.trim()) problems.push({ path, problem: `${locale} is empty` });
				if (richTags(entry).join() !== richTags(english).join()) {
					problems.push({ path, problem: `${locale} does not have the tags of en` });
				}
			} else if (Array.isArray(entry) && Array.isArray(english) && entry.length !== english.length) {
				problems.push({ path, problem: `${locale} does not have as many items as en` });
			}
		}
		const extra = Object.keys(node).filter((name) => !LOCALES.some((locale) => locale === name));
		if (extra.length) problems.push({ path, problem: `unknown entries: ${extra.join(', ')}` });
	}
	return problems;
};
