import { defineMessages } from 'portfolio-common';

// How a job does on each criterion of a candidate's perfect job (CriterionOutcomes.svelte): on a
// page for recruiters (the job match step), beside an anonymous card (the recruiter's matching),
// and for the candidate themselves (the jobs proposed to them, a mutual interest).
export const m = defineMessages({
	/** A deal-breaker of the candidate's that the job does not match (the job match step only) */
	dealBreaker: { en: 'Deal-breaker', fr: 'Éliminatoire' },
	commute: {
		/** To the recruiter, on the candidate's page for recruiters */
		recruiter: {
			en: (ownerName: string) =>
				`The commute is ${ownerName}'s travel time to your job's address, there and back, over a week.`,
			fr: (ownerName: string) =>
				`Le trajet est le temps que met ${ownerName} pour aller à l'adresse de votre offre et en revenir, sur une semaine.`
		},
		/** To the candidate, of a job proposed to them */
		candidate: {
			en: "The commute counts your travel time to the job's address, there and back, over a week.",
			fr: "Le trajet compte le temps qu'il vous faut pour aller à l'adresse de l'offre et en revenir, sur une semaine."
		}
	},
	/** Who the travel times come from: on a site without public transport, then with each service it can ask */
	commuteSources: {
		none: {
			en: 'Travel times: <ign>Géoplateforme (IGN)</ign>.',
			fr: 'Temps de trajet : <ign>Géoplateforme (IGN)</ign>.'
		},
		here: {
			en: 'Travel times: <ign>Géoplateforme (IGN)</ign> and, by public transport, <here>HERE</here>.',
			fr: 'Temps de trajet : <ign>Géoplateforme (IGN)</ign> et, en transports en commun, <here>HERE</here>.'
		},
		transitous: {
			en: 'Travel times: <ign>Géoplateforme (IGN)</ign>, <transitous>Transitous</transitous> and <osm>OpenStreetMap contributors</osm>.',
			fr: "Temps de trajet : <ign>Géoplateforme (IGN)</ign>, <transitous>Transitous</transitous> et <osm>les contributeurs d'OpenStreetMap</osm>."
		}
	}
});
