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
	intro: {
		en: "Your changes apply as soon as you save them, also where you picked this job description on a candidate's Hire page.",
		fr: "Vos modifications s'appliquent dès que vous les enregistrez, y compris là où vous avez choisi cette offre sur la page Recruter d'un candidat."
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
