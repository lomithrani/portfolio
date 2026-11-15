import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The page's `<title>` */
	pageTitle: {
		notFound: { en: 'Not found', fr: 'Introuvable' },
		error: { en: 'Error', fr: 'Erreur' }
	},
	/** Shown when the error has no message of its own */
	fallback: { en: 'Something went wrong', fr: 'Une erreur est survenue' },
	/**
	 * SvelteKit's own messages, which it only has in English: a URL that matches no route, and an
	 * error nobody expected. The English is what SvelteKit says
	 */
	kit: {
		notFound: { en: 'Not Found', fr: 'Page introuvable' },
		internal: { en: 'Internal Error', fr: 'Une erreur est survenue' }
	}
});
