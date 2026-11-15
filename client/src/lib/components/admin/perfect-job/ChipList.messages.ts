import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** What a list holds, named as each sentence needs it */
	kinds: {
		jobTitle: {
			/** After the Add button's word, for screen readers */
			add: { en: 'job title', fr: 'un intitulé de poste' },
			remove: {
				en: (item: string) => `Remove job title ${item}`,
				fr: (item: string) => `Retirer l'intitulé de poste ${item}`
			},
			atMost: {
				en: (max: number) => `${max} job titles at most`,
				fr: (max: number) => `${max} intitulés de poste au plus`
			},
			full: {
				en: (max: number) => `The list is full: ${max} job titles at most.`,
				fr: (max: number) => `La liste est pleine : ${max} intitulés de poste au plus.`
			},
			tooLong: {
				en: (maxLength: number) => `Each job title must be at most ${maxLength} characters.`,
				fr: (maxLength: number) =>
					`Chaque intitulé de poste doit faire au plus ${maxLength} caractères.`
			}
		},
		place: {
			add: { en: 'place', fr: 'un lieu' },
			remove: {
				en: (item: string) => `Remove place ${item}`,
				fr: (item: string) => `Retirer le lieu ${item}`
			},
			atMost: {
				en: (max: number) => `${max} places at most`,
				fr: (max: number) => `${max} lieux au plus`
			},
			full: {
				en: (max: number) => `The list is full: ${max} places at most.`,
				fr: (max: number) => `La liste est pleine : ${max} lieux au plus.`
			},
			tooLong: {
				en: (maxLength: number) => `Each place must be at most ${maxLength} characters.`,
				fr: (maxLength: number) => `Chaque lieu doit faire au plus ${maxLength} caractères.`
			}
		},
		skill: {
			add: { en: 'skill', fr: 'une compétence' },
			remove: {
				en: (item: string) => `Remove skill ${item}`,
				fr: (item: string) => `Retirer la compétence ${item}`
			},
			atMost: {
				en: (max: number) => `${max} skills at most`,
				fr: (max: number) => `${max} compétences au plus`
			},
			full: {
				en: (max: number) => `The list is full: ${max} skills at most.`,
				fr: (max: number) => `La liste est pleine : ${max} compétences au plus.`
			},
			tooLong: {
				en: (maxLength: number) => `Each skill must be at most ${maxLength} characters.`,
				fr: (maxLength: number) => `Chaque compétence doit faire au plus ${maxLength} caractères.`
			}
		}
	},
	added: {
		en: (items: readonly string[]) => `Added ${items.map((item) => `“${item}”`).join(', ')}.`,
		fr: (items: readonly string[]) => `Ajouté : ${items.map((item) => `« ${item} »`).join(', ')}.`
	},
	removed: {
		en: (item: string) => `Removed “${item}”.`,
		fr: (item: string) => `Retiré : « ${item} ».`
	},
	duplicate: { en: 'Already in the list.', fr: 'Déjà dans la liste.' },
	/** Under the field: how to add, and how many of the `max` items the list has */
	pressEnter: {
		en: (count: number, max: number) => `Press Enter to add. ${count} of ${max}.`,
		fr: (count: number, max: number) => `Appuyez sur Entrée pour ajouter. ${count} sur ${max}.`
	},
	/** Name of the list of chips; `label` is the field's label */
	addedList: {
		en: (label: string) => `${label} added`,
		fr: (label: string) => `${label} : éléments ajoutés`
	}
});

/** What a list holds: a group of `m.kinds` */
export type ChipListKind = keyof typeof m.kinds;
