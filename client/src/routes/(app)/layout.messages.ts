// The header of the (app) pages: the recruiter space, the private page of a job description
// shared with a candidate (/opportunities/:id) and the candidate's opportunities (/opportunities)
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/**
	 * Shared on a journey, proposed through matching or both interested: neutral, true of each (and
	 * saying nothing of matching while it is off)
	 */
	opportunity: {
		title: { en: 'Job description', fr: "Offre d'emploi" },
		subtitle: {
			en: 'Private, for the people it concerns',
			fr: 'Privée, pour les personnes concernées'
		}
	},
	/** The inbox (matching): neutral, said the same while matching is off (the page says nothing more) */
	opportunities: {
		title: { en: 'Opportunities', fr: 'Opportunités' },
		subtitle: {
			en: 'A private page: only you see it',
			fr: 'Une page privée : vous seul la voyez'
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
