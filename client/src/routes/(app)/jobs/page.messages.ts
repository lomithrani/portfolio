import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	pageTitle: { en: 'Open positions | Jobs', fr: "Offres ouvertes | Offres d'emploi" },
	/** For search results and link previews */
	description: {
		en: 'Open job descriptions in France, with pay, contract and working time up front. Apply with your portfolio.',
		fr: "Des offres d'emploi ouvertes en France, avec la rémunération, le contrat et le temps de travail affichés d'emblée. Postulez avec votre portfolio."
	},
	title: { en: 'Open positions', fr: 'Offres ouvertes' },
	/** Under the title (`count`: '12 open positions') */
	listed: {
		en: (count: string) => `${count}, most recently published first.`,
		fr: (count: string) => `${count}, les plus récentes en premier.`
	},
	/** After it, when the list is cut at the API's limit */
	limited: {
		en: (limit: number) => `Showing the ${limit} most recent.`,
		fr: (limit: number) => `Seules les ${limit} plus récentes sont affichées.`
	},
	empty: {
		title: { en: 'No open positions right now', fr: 'Aucune offre ouverte pour le moment' },
		text: {
			en: 'Check back soon: new job descriptions show here as soon as they are published.',
			fr: "Revenez bientôt : les nouvelles offres d'emploi apparaissent ici dès leur publication."
		},
		hiring: {
			en: 'Hiring? <publish>Publish a job description</publish> from the recruiter space.',
			fr: "Vous recrutez ? <publish>Publiez une offre d'emploi</publish> depuis l'espace recruteur."
		}
	}
});
