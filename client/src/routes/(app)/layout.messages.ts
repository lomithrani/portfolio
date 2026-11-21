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
	/**
	 * The inbox (matching), while matching answers: neutral (while it is off, or before it answers,
	 * the header is the site's name alone and the page says only that it is not available)
	 */
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
