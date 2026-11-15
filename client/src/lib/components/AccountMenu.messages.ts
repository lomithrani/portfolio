import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The trigger's accessible name: who is signed in, and the space in use once one was chosen */
	trigger: {
		none: {
			en: (name: string) => `Account menu: ${name}`,
			fr: (name: string) => `Menu du compte : ${name}`
		},
		candidate: {
			en: (name: string) => `Account menu: ${name}, Candidate space`,
			fr: (name: string) => `Menu du compte : ${name}, espace candidat`
		},
		recruiter: {
			en: (name: string) => `Account menu: ${name}, Recruiter space`,
			fr: (name: string) => `Menu du compte : ${name}, espace recruteur`
		}
	},
	spaces: { en: 'Spaces', fr: 'Espaces' },
	candidateSpace: { en: 'Candidate space', fr: 'Espace candidat' },
	yourPortfolio: {
		en: (domain: string) => `Your portfolio: ${domain}`,
		fr: (domain: string) => `Votre portfolio : ${domain}`
	},
	claimPortfolio: { en: 'Claim your portfolio', fr: 'Réserver mon portfolio' },
	recruiterSpace: { en: 'Recruiter space', fr: 'Espace recruteur' },
	yourJobs: { en: 'Your job descriptions', fr: "Vos offres d'emploi" },
	postJobs: { en: 'Post job descriptions', fr: "Publier des offres d'emploi" },
	browseJobs: { en: 'Browse jobs', fr: "Offres d'emploi" },
	logOut: { en: 'Log out', fr: 'Se déconnecter' }
});
