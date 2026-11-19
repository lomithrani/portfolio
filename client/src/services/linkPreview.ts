// What a shared link to a portfolio's page shows (LinkedIn, Slack, messaging apps): the Open Graph
// tags OpenGraph.svelte writes. Only what the page shows anyone: the portfolio's title (or the
// address name that heads a portfolio without one), its tagline, and a generic picture of
// Portfolio in the page's language, the same for every portfolio (client/static/og-*.png, drawn by
// client/scripts/og-image/render.mjs from linkPreview.messages.ts). No picture is made per
// portfolio: the title and the description carry the portfolio's own words.
import { getLocale, type Locale } from 'portfolio-common';
import { m } from './linkPreview.messages.ts';

/** The picture of each kind of page, per language, under client/static/ */
export const PREVIEW_IMAGES = {
	/** A portfolio's experiences page */
	portfolio: { en: 'og-portfolio.png', fr: 'og-portfolio-fr.png' },
	/** Its page for recruiters (/hire) */
	hire: { en: 'og-hire.png', fr: 'og-hire-fr.png' }
} as const satisfies Record<string, Record<Locale, string>>;

export type PreviewImageKind = keyof typeof PREVIEW_IMAGES;

/** The size of every picture, in pixels (og:image:width and og:image:height) */
export const PREVIEW_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export type PreviewImage = { url: string; alt: string; width: number; height: number };

/**
 * The picture of `kind` in the language in use: an absolute URL on `origin` (a crawler does not
 * resolve a relative one), and its alternative text
 */
export const previewImage = (kind: PreviewImageKind, origin: string): PreviewImage => ({
	url: new URL(`/${PREVIEW_IMAGES[kind][getLocale()]}`, origin).href,
	alt: m[kind].alt,
	...PREVIEW_IMAGE_SIZE
});

/** og:locale of a language */
export const ogLocale = (locale: Locale): string => (locale === 'fr' ? 'fr_FR' : 'en_GB');

type PortfolioHeading = {
	name: string;
	headerTitle?: string | null;
	headerSubtitle?: string | null;
};

/**
 * The name a portfolio is headed with ([domain]/+layout.svelte): its title, or its address name
 * when its owner set none
 */
export const portfolioName = (domain: PortfolioHeading): string =>
	domain.headerTitle?.trim() || domain.name;

/**
 * The preview of a portfolio's experiences page: the name it is headed with, and its tagline,
 * or `description` (the page's own) when its owner wrote none
 */
export const portfolioPreview = (
	domain: PortfolioHeading,
	description: string
): { title: string; description: string } => ({
	title: portfolioName(domain),
	description: domain.headerSubtitle?.trim() || description
});
