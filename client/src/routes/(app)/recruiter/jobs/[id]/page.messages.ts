import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** `title`: the posting's */
	pageTitle: {
		en: (title: string) => `${title} | Recruiter`,
		fr: (title: string) => `${title} | Recruteur`
	},
	/** In the page title until the posting is loaded */
	jobDescription: { en: 'Job description', fr: "Offre d'emploi" },
	/** The link back to the dashboard */
	yourJobs: { en: 'Your job descriptions', fr: "Vos offres d'emploi" },

	/** Under the company (`day`: '3 Nov 2026', shown as a <time>) */
	updated: {
		en: (day: string) => `Updated <time>${day}</time>`,
		fr: (day: string) => `Mise à jour le <time>${day}</time>`
	},
	created: {
		en: (day: string) => `Created <time>${day}</time>`,
		fr: (day: string) => `Créée le <time>${day}</time>`
	},
	/** The day it first left the draft status (`publishedAt`): nothing is published */
	opened: {
		en: (day: string) => `Opened <time>${day}</time>`,
		fr: (day: string) => `Ouverte le <time>${day}</time>`
	},
	/** Next to Edit: a new job description copied from this one (a draft) */
	duplicate: { en: 'Duplicate', fr: 'Dupliquer' },
	/** Under the dates of a job description opened before: its terms cannot change */
	termsLocked: {
		en: "Its pay and conditions have been locked since it was opened: candidates' matches are computed on them. Duplicate it to change them.",
		fr: 'Sa rémunération et ses conditions sont verrouillées depuis son ouverture : les correspondances des candidats sont calculées sur elles. Dupliquez-la pour les modifier.'
	},
	/** Small screens: the link to the management panel, after the description */
	manageLink: { en: 'Go to its status', fr: 'Aller à son statut' },
	/** Name of the management panel */
	manage: { en: 'Manage this job description', fr: "Gérer cette offre d'emploi" },

	/**
	 * Opening a job description whose pay range was saved wider than JOB_LIMITS.pay.maxRangeRatio
	 * times its bottom, before that cap (422 on pay.max). `most`: the highest maximum its minimum
	 * allows, formatted ('€63,000'); `ratio`: the cap
	 */
	narrowPayToOpen: {
		title: {
			en: 'Narrow its pay range before opening it',
			fr: "Resserrez sa fourchette de rémunération avant de l'ouvrir"
		},
		text: {
			en: (most: string, ratio: number) =>
				`Its maximum pay can be at most ${most} (${ratio.toLocaleString('en-GB')} times its minimum). Edit the job description to narrow it, then open it.`,
			fr: (most: string, ratio: number) =>
				`Sa rémunération maximale peut aller jusqu'à ${most} (${ratio.toLocaleString('fr-FR')} fois sa minimale). Modifiez l'offre pour la resserrer, puis ouvrez-la.`
		}
	},
	statusFailed: {
		en: 'Could not change the status. Try again in a moment.',
		fr: 'Impossible de changer le statut. Réessayez dans un instant.'
	},

	/** What the page says instead of the posting */
	signedOut: {
		title: { en: 'Sign in as a recruiter', fr: 'Connectez-vous en tant que recruteur' },
		text: {
			en: 'Sign in to see this job description.',
			fr: "Connectez-vous pour voir cette offre d'emploi."
		},
		action: { en: 'Sign in as a recruiter', fr: 'Se connecter en tant que recruteur' }
	},
	noSpace: {
		title: { en: 'Create your recruiter space first', fr: "Créez d'abord votre espace recruteur" },
		text: {
			en: 'Your account has no recruiter space yet. Create it to write job descriptions.',
			fr: "Votre compte n'a pas encore d'espace recruteur. Créez-le pour rédiger des offres d'emploi."
		},
		action: { en: 'Open the recruiter space', fr: "Ouvrir l'espace recruteur" }
	},
	notFound: {
		title: { en: 'Job description not found', fr: "Offre d'emploi introuvable" },
		text: {
			en: 'It may have been deleted, or it belongs to another recruiter account. Your job descriptions are listed in your recruiter space.',
			fr: "Elle a peut-être été supprimée, ou elle appartient à un autre compte recruteur. Vos offres d'emploi sont listées dans votre espace recruteur."
		}
	},
	loadFailed: {
		en: 'Could not load this job description',
		fr: "Impossible de charger cette offre d'emploi"
	},
	backToJobs: { en: 'Back to your job descriptions', fr: "Retour à vos offres d'emploi" }
});
