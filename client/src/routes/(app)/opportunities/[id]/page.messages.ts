import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/**
	 * Under the company (`day`: '3 Nov 2026', shown as a <time>): job offers are dated, by the day
	 * the job first left the draft status (`publishedAt`: nothing is published)
	 */
	opened: {
		en: (day: string) => `Opened <time>${day}</time>`,
		fr: (day: string) => `Ouverte le <time>${day}</time>`
	},
	updated: {
		en: (day: string) => `Updated <time>${day}</time>`,
		fr: (day: string) => `Mise à jour le <time>${day}</time>`
	},
	/**
	 * In place of "Updated" for the version a recruiter shared on the owner's journey (`day`: when
	 * they shared it): a later edit of the job description reaches the owner once shared again
	 */
	shared: {
		en: (day: string) => `Shared with you <time>${day}</time>`,
		fr: (day: string) => `Partagée avec vous le <time>${day}</time>`
	},
	/** After the description: who else can open the page (matching off) */
	private: {
		en: "This page is private: only this job description's recruiter and the portfolio owners on whose hiring journey it was picked can open it.",
		fr: "Cette page est privée : seuls le recruteur de cette offre d'emploi et les propriétaires de portfolio dans le parcours de recrutement desquels elle a été choisie peuvent l'ouvrir."
	},
	/**
	 * The same while matching is available (GET /me/notifications answered): the candidates it is
	 * proposed to (`access: 'feed'`) and those both interested with its recruiter (`access:
	 * 'match'`) open it too. Backed by: server/services/jobAccess.ts
	 */
	privateWithMatching: {
		en: "This page is private: only this job description's recruiter can open it, with the portfolio owners on whose hiring journey it was picked, the candidates it is proposed to and those who are both interested with its recruiter.",
		fr: "Cette page est privée : seul le recruteur de cette offre d'emploi peut l'ouvrir, avec les propriétaires de portfolio dans le parcours de recrutement desquels elle a été choisie, les candidats à qui elle est proposée et ceux qui ont un intérêt réciproque avec son recruteur."
	},

	/** What the page says instead of the posting */
	signedOut: {
		title: {
			en: 'Sign in to read this job description',
			fr: "Connectez-vous pour lire cette offre d'emploi"
		},
		text: {
			en: 'A recruiter shared it in a hiring journey. It is private: only its recruiter and the portfolio owners on whose hiring journey it was picked can read it, signed in.',
			fr: "Un recruteur l'a partagée dans un parcours de recrutement. Elle est privée : seuls son recruteur et les propriétaires de portfolio dans le parcours de recrutement desquels elle a été choisie peuvent la lire, une fois connectés."
		},
		/** The same while matching is available (it may also have been proposed to the visitor) */
		textWithMatching: {
			en: 'It is private: only its recruiter can read it, signed in, with the portfolio owners on whose hiring journey it was picked, the candidates it is proposed to and those who are both interested with its recruiter.',
			fr: 'Elle est privée : seul son recruteur peut la lire, une fois connecté, avec les propriétaires de portfolio dans le parcours de recrutement desquels elle a été choisie, les candidats à qui elle est proposée et ceux qui ont un intérêt réciproque avec son recruteur.'
		}
	},
	notShared: {
		title: {
			en: 'This job description is not shared with you',
			fr: "Cette offre d'emploi n'est pas partagée avec vous"
		},
		text: {
			en: 'Only its recruiter and the portfolio owners on whose hiring journey it was picked can read it. It may also have been deleted, or replaced since by another job description.',
			fr: "Seuls son recruteur et les propriétaires de portfolio dans le parcours de recrutement desquels elle a été choisie peuvent la lire. Elle a aussi pu être supprimée, ou remplacée depuis par une autre offre d'emploi."
		},
		/** The same while matching is available */
		textWithMatching: {
			en: 'Only its recruiter can read it, with the portfolio owners on whose hiring journey it was picked, the candidates it is proposed to and those who are both interested with its recruiter. It may also have been deleted, replaced since by another job description, or no longer be proposed to you.',
			fr: "Seul son recruteur peut la lire, avec les propriétaires de portfolio dans le parcours de recrutement desquels elle a été choisie, les candidats à qui elle est proposée et ceux qui ont un intérêt réciproque avec son recruteur. Elle a aussi pu être supprimée, remplacée depuis par une autre offre d'emploi, ou ne plus vous être proposée."
		},
		/** `email`: the signed-in account's, shown as <strong> */
		signedInAs: {
			en: (email: string) =>
				`You are signed in as <strong>${email}</strong>: the invitation may be meant for another of your accounts.`,
			fr: (email: string) =>
				`Vous êtes connecté avec <strong>${email}</strong> : l'invitation est peut-être destinée à un autre de vos comptes.`
		},
		home: { en: 'Go to the home page', fr: "Aller à la page d'accueil" }
	},
	loadFailed: {
		title: {
			en: 'Could not load this job description',
			fr: "Impossible de charger cette offre d'emploi"
		}
	}
});
