import { defineMessages, plural } from 'portfolio-common';

/** ', 1 new mutual interest' after the trigger's name, while some are not seen yet */
const unseenEn = (unseen: number) =>
	unseen > 0 ? `, ${unseen} new ${plural(unseen, 'mutual interest', 'mutual interests')}` : '';
const unseenFr = (unseen: number) =>
	unseen > 0
		? `, ${plural(unseen, `${unseen} nouvel intérêt réciproque`, `${unseen} nouveaux intérêts réciproques`)}`
		: '';
/**
 * The recruiter's mutual interests not seen yet, said without a number (what a recruiter reads
 * never counts candidates)
 */
const recruiterEn = (recruiterNew: boolean) =>
	recruiterNew ? ', new mutual interests in your recruiter space' : '';
const recruiterFr = (recruiterNew: boolean) =>
	recruiterNew ? ', nouveaux intérêts réciproques dans votre espace recruteur' : '';

export const m = defineMessages({
	/**
	 * The trigger's accessible name: who is signed in, the space in use once one was chosen, and the
	 * mutual interests not seen yet (`unseen`, matching: the menu's Opportunities shows them)
	 */
	trigger: {
		none: {
			en: (name: string, unseen = 0, recruiterNew = false) =>
				`Account menu: ${name}${unseenEn(unseen)}${recruiterEn(recruiterNew)}`,
			fr: (name: string, unseen = 0, recruiterNew = false) =>
				`Menu du compte : ${name}${unseenFr(unseen)}${recruiterFr(recruiterNew)}`
		},
		candidate: {
			en: (name: string, unseen = 0, recruiterNew = false) =>
				`Account menu: ${name}, Candidate space${unseenEn(unseen)}${recruiterEn(recruiterNew)}`,
			fr: (name: string, unseen = 0, recruiterNew = false) =>
				`Menu du compte : ${name}, espace candidat${unseenFr(unseen)}${recruiterFr(recruiterNew)}`
		},
		recruiter: {
			en: (name: string, unseen = 0, recruiterNew = false) =>
				`Account menu: ${name}, Recruiter space${unseenEn(unseen)}${recruiterEn(recruiterNew)}`,
			fr: (name: string, unseen = 0, recruiterNew = false) =>
				`Menu du compte : ${name}, espace recruteur${unseenFr(unseen)}${recruiterFr(recruiterNew)}`
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
	/**
	 * Beside the recruiter space, while mutual interests of matching are not seen yet there: no
	 * number (what a recruiter reads never counts candidates), and its words for screen readers
	 */
	recruiterNew: { en: 'New', fr: 'Nouveau' },
	recruiterNewLabel: {
		en: 'New mutual interests',
		fr: 'Nouveaux intérêts réciproques'
	},
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
