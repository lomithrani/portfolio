import { LOCALE_PARAM, type Locale } from 'portfolio-common';

/** A page's address: a URL, or SvelteKit's read-only `page.url` */
type PageUrl = { readonly href: string };

/** `url` asking for `locale` (`?lang=`), as a path: what the language switch links to */
export const localeHref = (url: PageUrl, locale: Locale): string => {
	const target = new URL(url.href);
	target.searchParams.set(LOCALE_PARAM, locale);
	return `${target.pathname}${target.search}${target.hash}`;
};

/**
 * Absolute URL of `url`'s page in `locale`, for canonical and hreflang links: English is the
 * page without the parameter (what a visitor with no preference gets), French adds `?lang=fr`.
 * Other query parameters are dropped: they are states of the page, not pages.
 */
export const localeAlternate = (url: PageUrl, locale: Locale): string => {
	const page = new URL(url.href);
	const target = new URL(page.pathname, page.origin);
	if (locale !== 'en') target.searchParams.set(LOCALE_PARAM, locale);
	return target.href;
};

/**
 * `og:locale` of a language, for the share tags of every page that writes one (the landing page,
 * the legal pages, LocaleLinks.svelte, a portfolio's OpenGraph.svelte)
 */
export const ogLocale = (locale: Locale): string => (locale === 'fr' ? 'fr_FR' : 'en_GB');
