import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	loadFailed: {
		en: 'Could not load your hiring journey.',
		fr: 'Impossible de charger votre parcours de recrutement.'
	},
	saveFailed: {
		en: 'Could not save your hiring journey. Try again.',
		fr: "Impossible d'enregistrer votre parcours de recrutement. Réessayez."
	},
	/** A save refused for an expired session: the page stays as it is, with the steps edited */
	sessionExpired: {
		en: 'Your session expired. Your steps are still here: sign in again in another tab, then save.',
		fr: 'Votre session a expiré. Vos étapes sont toujours là : reconnectez-vous dans un autre onglet, puis enregistrez.'
	},
	leaveUnsaved: {
		en: 'Leave without saving your hiring journey? Your changes will be lost.',
		fr: 'Quitter sans enregistrer votre parcours de recrutement ? Vos modifications seront perdues.'
	},
	saved: { en: 'Hiring journey saved', fr: 'Parcours de recrutement enregistré' },
	title: { en: 'Hiring journey', fr: 'Parcours de recrutement' },
	intro: {
		en: 'Choose the steps recruiters go through on your page for recruiters, in order. Each step opens once the ones before it are done.',
		fr: "Choisissez les étapes que les recruteurs suivent sur votre page recruteurs, dans l'ordre. Chaque étape s'ouvre une fois les précédentes terminées."
	},
	loading: {
		en: 'Loading your hiring journey...',
		fr: 'Chargement de votre parcours de recrutement…'
	},
	noStep: {
		en: 'Your journey has no step. Add one below.',
		fr: "Votre parcours n'a aucune étape. Ajoutez-en une ci-dessous."
	},
	steps: { en: 'Steps', fr: 'Étapes' },
	/** A step as the buttons name it: its type's label, then the name of its own */
	named: {
		en: (type: string, title: string) => `${type}: ${title}`,
		fr: (type: string, title: string) => `${type} : ${title}`
	},
	/** Before a step's name, for screen readers */
	stepNumber: {
		en: (position: number) => `Step ${position}:`,
		fr: (position: number) => `Étape ${position} :`
	},
	leadsTo: { en: 'What the journey leads to.', fr: 'Ce à quoi mène le parcours.' },
	askedBefore: {
		en: 'Asked before the steps it opens.',
		fr: "Demandée avant les étapes qu'elle ouvre."
	},
	moveUp: { en: 'Move up', fr: 'Monter' },
	moveDown: { en: 'Move down', fr: 'Descendre' },
	addStep: { en: 'Add a step', fr: 'Ajouter une étape' },
	/** Before a step type's label on its Add button, for screen readers */
	addStepNamed: { en: 'Add step:', fr: "Ajouter l'étape :" },

	// --- Announced to screen readers ---
	added: {
		en: (name: string, position: number, total: number) =>
			`${name} added as step ${position} of ${total}.`,
		fr: (name: string, position: number, total: number) =>
			`Étape ${position} sur ${total} ajoutée : ${name}.`
	},
	moved: {
		en: (name: string, position: number, total: number) =>
			`${name} moved to step ${position} of ${total}.`,
		fr: (name: string, position: number, total: number) =>
			`Étape déplacée en position ${position} sur ${total} : ${name}.`
	},
	removed: {
		en: (name: string) => `${name} removed.`,
		fr: (name: string) => `Étape retirée : ${name}.`
	},

	// --- Saving ---
	/** Before what is wrong with a step */
	problemAt: {
		en: (position: number, name: string) => `Step ${position} (${name}):`,
		fr: (position: number, name: string) => `Étape ${position} (${name}) :`
	},
	saving: { en: 'Saving...', fr: 'Enregistrement…' },
	save: { en: 'Save journey', fr: 'Enregistrer le parcours' },
	undo: { en: 'Undo changes', fr: 'Annuler les modifications' },
	seeHirePage: { en: 'See your page for recruiters', fr: 'Voir votre page recruteurs' }
});
