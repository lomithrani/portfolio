import { defineMessages } from 'portfolio-common';
import type { JobListField } from '#services/jobDrafts.ts';

// The lists of the job editor (skills, languages, benefits): what one item is called depends on
// the list, so the texts take it (`list`).

const EN: Record<JobListField, string> = {
	skills: 'skill',
	languages: 'language',
	benefits: 'benefit'
};

/** French needs each noun with its article, and its plural */
const FR: Record<
	JobListField,
	{ one: string; many: string; a: string; the: string; added: string }
> = {
	skills: {
		one: 'compétence',
		many: 'compétences',
		a: 'une compétence',
		the: 'la compétence',
		added: 'Compétences ajoutées'
	},
	languages: {
		one: 'langue',
		many: 'langues',
		a: 'une langue',
		the: 'la langue',
		added: 'Langues ajoutées'
	},
	benefits: {
		one: 'avantage',
		many: 'avantages',
		a: 'un avantage',
		the: "l'avantage",
		added: 'Avantages ajoutés'
	}
};

export const m = defineMessages({
	/** After the button's "Add", for screen readers: 'Add skill' */
	addWhat: {
		en: (list: JobListField) => EN[list],
		fr: (list: JobListField) => FR[list].a
	},
	/** Name of a chip's remove button */
	removeItem: {
		en: (list: JobListField, item: string) => `Remove ${EN[list]} ${item}`,
		fr: (list: JobListField, item: string) => `Retirer ${FR[list].the} ${item}`
	},
	/** Name of the list of chips (`label`: the field's) */
	addedItems: {
		en: (_list: JobListField, label: string) => `${label} added`,
		fr: (list: JobListField) => FR[list].added
	},
	/** The field's hint: how to add, and how many items the list holds */
	pressEnter: {
		en: (count: number, max: number) => `Press Enter to add. ${count} of ${max}.`,
		fr: (count: number, max: number) => `Appuyez sur Entrée pour ajouter. ${count} sur ${max}.`
	},
	/** The field's placeholder once the list is full */
	atMost: {
		en: (list: JobListField, max: number) => `${max} ${EN[list]}s at most`,
		fr: (list: JobListField, max: number) => `${max} ${FR[list].many} au maximum`
	},

	// --- Announced to screen readers ----------------------------------------------------------

	added: {
		en: (items: string[]) => `Added ${items.map((item) => `“${item}”`).join(', ')}.`,
		fr: (items: string[]) => `Ajouté : ${items.map((item) => `« ${item} »`).join(', ')}.`
	},
	removed: {
		en: (item: string) => `Removed “${item}”.`,
		fr: (item: string) => `« ${item} » retiré.`
	},

	// --- Why what was typed was not added -----------------------------------------------------

	duplicate: { en: 'Already in the list.', fr: 'Déjà dans la liste.' },
	full: {
		en: (list: JobListField, max: number) => `The list is full: ${max} ${EN[list]}s at most.`,
		fr: (list: JobListField, max: number) =>
			`La liste est pleine : ${max} ${FR[list].many} au maximum.`
	},
	tooLong: {
		en: (list: JobListField, maxLength: number) =>
			`Each ${EN[list]} must be at most ${maxLength} characters.`,
		fr: (list: JobListField, maxLength: number) =>
			`Chaque ${FR[list].one} doit faire ${maxLength} caractères au maximum.`
	},
	/** The same reasons when a save could not add the text: the field's error */
	notAddedFull: {
		en: (list: JobListField, max: number) =>
			`Not added: the list is full (${max} ${EN[list]}s at most). Remove one, or clear the text.`,
		fr: (list: JobListField, max: number) =>
			`Non ajouté : la liste est pleine (${max} ${FR[list].many} au maximum). Retirez un élément, ou effacez le texte.`
	},
	notAddedTooLong: {
		en: (list: JobListField, maxLength: number) =>
			`Not added: each ${EN[list]} must be at most ${maxLength} characters. Shorten it, or clear it.`,
		fr: (list: JobListField, maxLength: number) =>
			`Non ajouté : chaque ${FR[list].one} doit faire ${maxLength} caractères au maximum. Raccourcissez le texte, ou effacez-le.`
	}
});
