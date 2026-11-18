// The header of the (app) pages: the recruiter space, and the private page of a job description
// shared with a candidate (/opportunities/:id)
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	opportunity: {
		title: { en: 'Job description', fr: "Offre d'emploi" },
		subtitle: {
			en: 'Shared in a hiring journey',
			fr: 'Partagée dans un parcours de recrutement'
		}
	},
	recruiter: {
		title: { en: 'Recruiter space', fr: 'Espace recruteur' },
		subtitle: {
			en: 'Your job descriptions and your meetings',
			fr: "Vos offres d'emploi et vos rendez-vous"
		}
	}
});
