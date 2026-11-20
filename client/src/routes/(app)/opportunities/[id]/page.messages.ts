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
	/** After the description: who else can open the page */
	private: {
		en: "This page is private: only this job description's recruiter and the portfolio owners on whose hiring journey it was picked can open it.",
		fr: "Cette page est privée : seuls le recruteur de cette offre d'emploi et les propriétaires de portfolio dans le parcours de recrutement desquels elle a été choisie peuvent l'ouvrir."
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
