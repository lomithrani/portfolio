import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** A posting that is not published (or no longer) */
	notFound: {
		pageTitle: { en: 'Not found | Jobs', fr: "Introuvable | Offres d'emploi" },
		title: { en: 'Job description not found', fr: "Offre d'emploi introuvable" },
		text: {
			en: 'This job description may have been removed by its recruiter, or the link is wrong.',
			fr: "Cette offre d'emploi a peut-être été retirée par son recruteur, ou le lien est incorrect."
		}
	},
	/** The API out of reach */
	unavailable: {
		pageTitle: { en: 'Unavailable | Jobs', fr: "Indisponible | Offres d'emploi" },
		title: {
			en: 'The job board is temporarily unavailable',
			fr: "Les offres d'emploi sont momentanément indisponibles"
		},
		text: {
			en: 'The server could not be reached, or it failed. Try again in a moment.',
			fr: 'Le serveur est injoignable, ou il a rencontré une erreur. Réessayez dans un instant.'
		}
	},
	allJobs: { en: 'All jobs', fr: 'Toutes les offres' },
	seeOpenPositions: { en: 'See the open positions', fr: 'Voir les offres ouvertes' }
});
