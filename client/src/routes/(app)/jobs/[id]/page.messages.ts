import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** `title`: the posting's, with its company ('Backend engineer at Acme') */
	pageTitle: {
		en: (title: string) => `${title} | Jobs`,
		fr: (title: string) => `${title} | Offres d'emploi`
	},
	allJobs: { en: 'All jobs', fr: 'Toutes les offres' },
	/** The link next to the title on small screens, by what the viewer can do */
	manage: { en: 'Manage it', fr: "Gérer l'offre" },
	yourApplication: { en: 'Your application', fr: 'Votre candidature' },
	/** Also the name of the panel the link leads to */
	apply: { en: 'Apply', fr: 'Postuler' }
});
