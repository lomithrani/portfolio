import { defineMessages, plural } from 'portfolio-common';

// The texts of the editor's smaller components: the logo, the Markdown fields, the month
// pickers, a project's row and the skills. EditorForm's are in `EditorForm.messages.ts`, the
// fields' names and the validation in `#services/experienceForm.messages.ts`.
export const m = defineMessages({
	/** LogoInput.svelte and icon.ts */
	logo: {
		current: { en: 'Current logo', fr: 'Logo actuel' },
		/** Followed by the button that opens the file picker */
		drop: { en: 'Drop an image here, or', fr: 'Déposez une image ici, ou' },
		dropAnother: {
			en: 'Drop another image here to replace it, or',
			fr: 'Déposez une autre image ici pour le remplacer, ou'
		},
		processing: { en: 'Processing…', fr: 'Traitement…' },
		choose: { en: 'Choose a file', fr: 'Choisir un fichier' },
		chooseAnother: { en: 'Choose another file', fr: 'Choisir un autre fichier' },
		/** `size`: the longest side of a resized logo, in pixels */
		hint: {
			en: (size: number) => `PNG, JPEG, WebP, SVG or ICO. Large images are resized to ${size} px.`,
			fr: (size: number) =>
				`PNG, JPEG, WebP, SVG ou ICO. Les grandes images sont réduites à ${size} px.`
		},
		errors: {
			type: {
				en: 'Use a PNG, JPEG, WebP, SVG or ICO image.',
				fr: 'Utilisez une image PNG, JPEG, WebP, SVG ou ICO.'
			},
			fileTooLarge: {
				en: 'Choose an image under 10 MB.',
				fr: 'Choisissez une image de moins de 10 Mo.'
			},
			tooDetailed: {
				en: 'This image is too detailed to fit. Try a simpler one.',
				fr: 'Cette image est trop détaillée pour tenir. Essayez-en une plus simple.'
			},
			unreadable: {
				en: 'This image could not be read. Try another file.',
				fr: "Cette image n'a pas pu être lue. Essayez un autre fichier."
			}
		}
	},
	/** MarkdownField.svelte */
	markdown: {
		write: { en: 'Write', fr: 'Rédiger' },
		preview: { en: 'Preview', fr: 'Aperçu' },
		/** Names the preview; `label`: the field's ('Summary') */
		previewOf: {
			en: (label: string) => `${label} preview`,
			fr: (label: string) => `Aperçu : ${label}`
		},
		empty: { en: 'Nothing to preview yet.', fr: "Rien à prévisualiser pour l'instant." },
		hint: {
			en: 'Markdown: **bold**, _italic_, lists with “-”, [links](https://…).',
			fr: 'Markdown : **gras**, _italique_, listes avec « - », [liens](https://…).'
		}
	},
	/** MonthInput.svelte */
	month: {
		names: {
			en: [
				'January',
				'February',
				'March',
				'April',
				'May',
				'June',
				'July',
				'August',
				'September',
				'October',
				'November',
				'December'
			],
			fr: [
				'Janvier',
				'Février',
				'Mars',
				'Avril',
				'Mai',
				'Juin',
				'Juillet',
				'Août',
				'Septembre',
				'Octobre',
				'Novembre',
				'Décembre'
			]
		},
		month: { en: 'Month', fr: 'Mois' },
		year: { en: 'Year', fr: 'Année' },
		/** Names the month select; `label`: the picker's ('Start', 'End') */
		monthOf: {
			en: (label: string) => `${label} month`,
			fr: (label: string) => `${label} : mois`
		},
		/** Names the year select */
		yearOf: {
			en: (label: string) => `${label} year`,
			fr: (label: string) => `${label} : année`
		}
	},
	/** ProjectItem.svelte (and EditorForm, which names a project the same way) */
	project: {
		untitled: { en: 'Untitled project', fr: 'Projet sans nom' },
		noDates: { en: 'No dates', fr: 'Sans dates' },
		skills: {
			en: (count: number) =>
				count === 0 ? 'No skills' : `${count} ${plural(count, 'skill', 'skills')}`,
			fr: (count: number) =>
				count === 0 ? 'Aucune compétence' : `${count} ${plural(count, 'compétence', 'compétences')}`
		},
		needsAttention: { en: 'Needs attention', fr: 'À corriger' },
		/** `name`: the project's */
		moveUp: {
			en: (name: string) => `Move “${name}” up`,
			fr: (name: string) => `Monter « ${name} »`
		},
		moveDown: {
			en: (name: string) => `Move “${name}” down`,
			fr: (name: string) => `Descendre « ${name} »`
		},
		remove: {
			en: (name: string) => `Remove “${name}”`,
			fr: (name: string) => `Retirer « ${name} »`
		},
		namePlaceholder: {
			en: 'e.g. Internal developer portal',
			fr: 'ex. : Portail interne pour développeurs'
		},
		summaryPlaceholder: {
			en: 'What you did, for whom, and the outcome.',
			fr: 'Ce que vous avez fait, pour qui, et le résultat.'
		}
	},
	/** SkillsInput.svelte */
	skills: {
		placeholder: {
			en: 'Type a skill and press Enter',
			fr: 'Saisissez une compétence et appuyez sur Entrée'
		},
		suggestions: { en: 'Suggestions', fr: 'Suggestions' },
		suggestionsLabel: { en: 'Suggestions:', fr: 'Suggestions :' },
		/** `skill`: a suggested skill */
		add: {
			en: (skill: string) => `Add ${skill}`,
			fr: (skill: string) => `Ajouter ${skill}`
		},
		hint: {
			en: 'Press Enter, or separate skills with a comma.',
			fr: 'Appuyez sur Entrée, ou séparez les compétences par une virgule.'
		},
		/**
		 * What the tags input says to screen readers. The English is the component's own
		 * (@zag-js/tags-input); a skill is a "tag" there.
		 */
		tags: {
			clearTriggerLabel: { en: 'Clear all tags', fr: 'Retirer toutes les compétences' },
			deleteTagTriggerLabel: {
				en: (value: string) => `Delete tag ${value}`,
				fr: (value: string) => `Retirer la compétence ${value}`
			},
			tagAdded: {
				en: (value: string) => `Added tag ${value}`,
				fr: (value: string) => `Compétence ${value} ajoutée`
			},
			tagsPasted: {
				en: (values: string[]) => `Pasted ${values.length} tags`,
				fr: (values: string[]) =>
					`${values.length} ${plural(values.length, 'compétence collée', 'compétences collées')}`
			},
			tagEdited: {
				en: (value: string) => `Editing tag ${value}. Press enter to save or escape to cancel.`,
				fr: (value: string) =>
					`Modification de la compétence ${value}. Appuyez sur Entrée pour enregistrer ou sur Échap pour annuler.`
			},
			tagUpdated: {
				en: (value: string) => `Tag update to ${value}`,
				fr: (value: string) => `Compétence remplacée par ${value}`
			},
			tagDeleted: {
				en: (value: string) => `Tag ${value} deleted`,
				fr: (value: string) => `Compétence ${value} retirée`
			},
			tagSelected: {
				en: (value: string) =>
					`Tag ${value} selected. Press enter to edit, delete or backspace to remove.`,
				fr: (value: string) =>
					`Compétence ${value} sélectionnée. Appuyez sur Entrée pour la modifier, sur Suppr ou Retour arrière pour la retirer.`
			}
		}
	}
});
