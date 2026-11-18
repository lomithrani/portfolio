import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	pageTitle: {
		en: 'New job description | Recruiter',
		fr: "Nouvelle offre d'emploi | Recruteur"
	},
	heading: { en: 'New job description', fr: "Nouvelle offre d'emploi" },
	/** Under the heading, when the form starts from an import */
	introImported: {
		en: 'Read from your PDF. Complete it, then create the posting.',
		fr: "Lue depuis votre PDF. Complétez-la, puis créez l'offre."
	},
	/** Under the heading (`open`: the status "Open" as portfolio-common names it) */
	intro: {
		en: (open: string) =>
			`Describe the job: once its status is ${open}, you can pick it on a candidate's Hire page.`,
		fr: (open: string) =>
			`Décrivez le poste : dès que le statut de l'offre est « ${open} », vous pouvez la choisir sur la page Recruter d'un candidat.`
	},
	backToJourney: {
		en: 'Back to the hiring journey',
		fr: 'Retour au parcours de recrutement'
	},
	/**
	 * Opened from a portfolio's hiring journey. `<portfolio>` shows the portfolio's name and `<status>`
	 * the status "Open" as portfolio-common names it, in place of the words written here
	 */
	journeyNote: {
		en: 'Once it is created, you go back to the hiring journey of <portfolio>the portfolio</portfolio> to pick it. Set its status to <status>Open</status>: only an open job description can be picked.',
		fr: "Une fois l'offre créée, vous revenez au parcours de recrutement de <portfolio>ce portfolio</portfolio> pour la choisir. Passez son statut à <status>Ouverte</status> : seule une offre d'emploi ouverte peut être choisie."
	},
	/** ?import=1 without an import kept in this browser */
	importMissing: {
		en: 'The imported job description is no longer in this browser: it was saved or discarded. Start from this blank form, or import the PDF again from <jobs>your job descriptions</jobs>.',
		fr: "L'offre d'emploi importée n'est plus dans ce navigateur : elle a été enregistrée ou abandonnée. Partez de ce formulaire vide, ou importez de nouveau le PDF depuis <jobs>vos offres d'emploi</jobs>."
	},
	signInText: {
		en: 'Sign in to write job descriptions.',
		fr: "Connectez-vous pour rédiger des offres d'emploi."
	},

	// --- Toasts -------------------------------------------------------------------------------

	created: { en: 'Job description created', fr: "Offre d'emploi créée" },
	/** `open`: the status "Open" as portfolio-common names it */
	createdDraft: {
		en: (open: string) =>
			`It is a draft: set its status to ${open} to pick it on a candidate's Hire page.`,
		fr: (open: string) =>
			`Elle est enregistrée comme brouillon : passez son statut à « ${open} » pour la choisir sur la page Recruter d'un candidat.`
	},
	/** Created with another status than draft */
	createdNotDraft: {
		en: "Pick it on a candidate's Hire page to show it to them: only an open job description can be picked.",
		fr: "Choisissez-la sur la page Recruter d'un candidat pour la lui présenter : seule une offre d'emploi ouverte peut être choisie."
	},
	openIt: { en: 'Open it', fr: "Ouvrir l'offre" },
	/** Created from a hiring journey, with the status Open */
	pickIt: {
		en: 'Pick it to continue the hiring journey.',
		fr: 'Choisissez-la pour continuer le parcours de recrutement.'
	},
	/** Created from a hiring journey, with another status (`open`: the status "Open") */
	notOpenYet: {
		en: (open: string) =>
			`It is not open yet: set its status to ${open} to pick it in the hiring journey.`,
		fr: (open: string) =>
			`Elle n'est pas encore ouverte : passez son statut à « ${open} » pour la choisir dans le parcours de recrutement.`
	},
	backToTheJourney: { en: 'Back to the journey', fr: 'Retour au parcours' },
	importDiscarded: { en: 'Import discarded', fr: 'Import abandonné' },
	blankForm: {
		en: 'You are starting from a blank form.',
		fr: "Vous repartez d'un formulaire vide."
	}
});
