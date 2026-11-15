import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The page's `<title>`, before the site's name */
	pageTitle: {
		notFound: { en: 'Not found', fr: 'Introuvable' },
		error: { en: 'Error', fr: 'Erreur' }
	},
	heading: {
		notFound: { en: 'Page not found', fr: 'Page introuvable' },
		error: { en: 'Something went wrong', fr: 'Une erreur est survenue' }
	},
	text: {
		notFound: {
			en: 'This page does not exist, or the link is wrong.',
			fr: "Cette page n'existe pas, ou le lien est incorrect."
		},
		error: {
			en: 'The page could not be shown. Try again in a moment.',
			fr: "La page n'a pas pu être affichée. Réessayez dans un instant."
		}
	},
	home: { en: 'Go to the home page', fr: "Aller à la page d'accueil" }
});
