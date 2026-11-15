import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The page's `<title>` */
	pageTitle: {
		notFound: { en: 'Not found', fr: 'Introuvable' },
		error: { en: 'Error', fr: 'Erreur' }
	},
	/** Shown when the error has no message of its own */
	fallback: { en: 'Something went wrong', fr: 'Une erreur est survenue' }
});
