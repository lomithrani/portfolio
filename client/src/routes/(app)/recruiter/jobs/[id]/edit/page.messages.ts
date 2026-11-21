import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The page's title once the posting is loaded (`title`: the posting's) */
	pageTitleOf: {
		en: (title: string) => `Edit ${title} | Recruiter`,
		fr: (title: string) => `Modifier ${title} | Recruteur`
	},
	pageTitle: {
		en: 'Edit job description | Recruiter',
		fr: "Modifier l'offre d'emploi | Recruteur"
	},
	heading: { en: 'Edit job description', fr: "Modifier l'offre d'emploi" },
	/**
	 * Backed by: server/services/workflowSteps/job.ts (the version shared is kept: an edit reaches no
	 * journey until it is shared again, `outdated` and "Share the new version")
	 */
	intro: {
		en: "Your changes are saved at once. Where you shared this job description on a candidate's page for recruiters, the candidate keeps the version you shared until you share it again.",
		fr: "Vos modifications sont enregistrées aussitôt. Là où vous avez partagé cette offre sur la page recruteurs d'un candidat, il garde la version partagée jusqu'à ce que vous la partagiez de nouveau."
	},
	signInText: {
		en: 'Sign in to edit your job descriptions.',
		fr: "Connectez-vous pour modifier vos offres d'emploi."
	},
	notFoundTitle: { en: 'Job description not found', fr: "Offre d'emploi introuvable" },
	notFound: {
		en: 'It may have been deleted, or it belongs to another recruiter account. Your job descriptions are listed in your recruiter space.',
		fr: "Elle a peut-être été supprimée, ou elle appartient à un autre compte recruteur. Vos offres d'emploi sont listées dans votre espace recruteur."
	},
	backToJobs: { en: 'Back to your job descriptions', fr: "Retour à vos offres d'emploi" },
	loadFailedTitle: {
		en: 'Could not load this job description',
		fr: "Impossible de charger cette offre d'emploi"
	},
	loadFailed: {
		en: 'The server could not be reached, or it failed. Check your connection and try again.',
		fr: 'Le serveur est injoignable, ou il a rencontré une erreur. Vérifiez votre connexion et réessayez.'
	},

	// --- Toast --------------------------------------------------------------------------------

	saved: { en: 'Changes saved', fr: 'Modifications enregistrées' },
	openJob: { en: 'Open the job description', fr: "Ouvrir l'offre d'emploi" }
});
