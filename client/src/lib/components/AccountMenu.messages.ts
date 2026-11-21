import { defineMessages, plural } from 'portfolio-common';

/** ', 1 new mutual interest' after the trigger's name, while some are not seen yet */
const unseenEn = (unseen: number) =>
	unseen > 0 ? `, ${unseen} new ${plural(unseen, 'mutual interest', 'mutual interests')}` : '';
const unseenFr = (unseen: number) =>
	unseen > 0
		? `, ${plural(unseen, `${unseen} nouvel intérêt réciproque`, `${unseen} nouveaux intérêts réciproques`)}`
		: '';

export const m = defineMessages({
	/**
	 * The trigger's accessible name: who is signed in, the space in use once one was chosen, and the
	 * mutual interests not seen yet (`unseen`, matching: the menu's Opportunities shows them)
	 */
	trigger: {
		none: {
			en: (name: string, unseen = 0) => `Account menu: ${name}${unseenEn(unseen)}`,
			fr: (name: string, unseen = 0) => `Menu du compte : ${name}${unseenFr(unseen)}`
		},
		candidate: {
			en: (name: string, unseen = 0) => `Account menu: ${name}, Candidate space${unseenEn(unseen)}`,
			fr: (name: string, unseen = 0) =>
				`Menu du compte : ${name}, espace candidat${unseenFr(unseen)}`
		},
		recruiter: {
			en: (name: string, unseen = 0) => `Account menu: ${name}, Recruiter space${unseenEn(unseen)}`,
			fr: (name: string, unseen = 0) =>
				`Menu du compte : ${name}, espace recruteur${unseenFr(unseen)}`
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
	postJobs: { en: 'Write job descriptions', fr: "Rédiger des offres d'emploi" },
	/**
	 * For a portfolio owner while matching is available: the jobs proposed to them and their mutual
	 * interests (/opportunities)
	 */
	opportunities: { en: 'Opportunities', fr: 'Opportunités' },
	/** For a portfolio owner: the admin's Share tab */
	shareLink: { en: 'Share your link', fr: 'Partager votre lien' },
	sendFeedback: { en: 'Send feedback', fr: 'Donner votre avis' },
	logOut: { en: 'Log out', fr: 'Se déconnecter' }
});
