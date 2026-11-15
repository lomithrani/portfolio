import { defineMessages, plural } from 'portfolio-common';

// What the résumé import says outside its dialog's own texts: sizes, the allowance, why an
// import or a draft failed. The API's messages come in the page's language too, and are shown
// as they are.
/** "de" before a month as fr-FR abbreviates it: 'de mars 2022', "d'avr. 2022", "d'oct. 2022" */
const de = (month: string) => (/^[aeiouyàâéèêîôûh]/i.test(month) ? `d'${month}` : `de ${month}`);

export const m = defineMessages({
	/** '820 KB' */
	kilobytes: {
		en: (size: number) => `${size} KB`,
		fr: (size: number) => `${size} Ko`
	},
	/** '3.4 MB'; `size` as English writes it ('3.4') */
	megabytes: {
		en: (size: string) => `${size} MB`,
		fr: (size: string) => `${size.replace('.', ',')} Mo`
	},
	file: {
		notPdf: {
			en: 'Choose a PDF file: the import only reads PDF résumés.',
			fr: "Choisissez un fichier PDF : l'import ne lit que les CV au format PDF."
		},
		empty: {
			en: 'This file is empty. Choose another PDF.',
			fr: 'Ce fichier est vide. Choisissez un autre PDF.'
		},
		/** `size`: the file's ('6.2 MB') */
		tooLarge: {
			en: (size: string) =>
				`This PDF is ${size}: the import takes files of up to 4 MB. Export a lighter version (fewer images) and try again.`,
			fr: (size: string) =>
				`Ce PDF fait ${size} : l'import accepte les fichiers de 4 Mo au maximum. Exportez une version plus légère (moins d'images) et réessayez.`
		}
	},
	/** '2 of 3 imports left this month' */
	quota: {
		en: (remaining: number, limit: number) =>
			`${remaining} of ${limit} ${plural(limit, 'import', 'imports')} left this month`,
		fr: (remaining: number, limit: number) =>
			`${remaining} ${plural(remaining, 'import restant', 'imports restants')} sur ${limit} ce mois-ci`
	},
	/** POST /experiences/import failed, and the API gave no message of its own */
	importErrors: {
		sessionExpired: {
			en: 'Your session expired. Sign in again, then import your résumé.',
			fr: 'Votre session a expiré. Reconnectez-vous, puis importez votre CV.'
		},
		unavailable: {
			en: 'Résumé import is not available on this portfolio.',
			fr: "L'import de CV n'est pas disponible sur ce portfolio."
		},
		tooLarge: {
			en: 'This PDF is too large: the import takes files of up to 4 MB.',
			fr: "Ce PDF est trop volumineux : l'import accepte les fichiers de 4 Mo au maximum."
		},
		unreadable: {
			en: 'This file could not be read as a résumé. Choose another PDF.',
			fr: "Ce fichier n'a pas pu être lu comme un CV. Choisissez un autre PDF."
		},
		noImportsLeft: {
			en: 'You have used all your imports for now. Try again later.',
			fr: 'Vous avez utilisé tous vos imports pour le moment. Réessayez plus tard.'
		},
		temporarilyUnavailable: {
			en: 'Résumé import is temporarily unavailable, try again later.',
			fr: "L'import de CV est temporairement indisponible, réessayez plus tard."
		},
		failed: {
			en: 'The import failed. Try again in a moment.',
			fr: "L'import a échoué. Réessayez dans un instant."
		}
	},
	/** POST /experiences refused a draft ("it" is the draft's experience) */
	saveErrors: {
		tooLarge: {
			en: 'This experience is too large: shorten its texts.',
			fr: 'Cette expérience est trop volumineuse : raccourcissez ses textes.'
		},
		invalid: {
			en: 'Some fields are invalid: edit it to fix them.',
			fr: 'Certains champs sont invalides : modifiez-la pour les corriger.'
		},
		failed: {
			en: 'Could not add it. Try again in a moment.',
			fr: "Impossible de l'ajouter. Réessayez dans un instant."
		}
	},
	/**
	 * The drafts "Add" could not add (`failed` of them, at least one): to edit when each was
	 * refused for its content (`toEdit` of them), to add again later otherwise
	 */
	failedDrafts: {
		en: (failed: number, toEdit: number) => {
			const one = failed === 1;
			const count = one
				? '1 experience could not be added.'
				: `${failed} experiences could not be added.`;
			if (toEdit >= failed) {
				return `${count} Edit ${one ? 'it' : 'them'} to fix the problem, then add ${one ? 'it' : 'them'} again.`;
			}
			if (toEdit === 0) return `${count} Try adding ${one ? 'it' : 'them'} again in a moment.`;
			return `${count} Edit the ones marked with a problem, then add them again.`;
		},
		fr: (failed: number, toEdit: number) => {
			const one = failed === 1;
			const count = one
				? "1 expérience n'a pas pu être ajoutée."
				: `${failed} expériences n'ont pas pu être ajoutées.`;
			if (toEdit >= failed) {
				return one
					? `${count} Modifiez-la pour corriger le problème, puis ajoutez-la de nouveau.`
					: `${count} Modifiez-les pour corriger le problème, puis ajoutez-les de nouveau.`;
			}
			if (toEdit === 0) {
				return one
					? `${count} Réessayez de l'ajouter dans un instant.`
					: `${count} Réessayez de les ajouter dans un instant.`;
			}
			return `${count} Modifiez celles qui signalent un problème, puis ajoutez-les de nouveau.`;
		}
	},
	/** After the first problem of a draft, when it has others: 'End: Choose … (and 2 more)' */
	moreProblems: {
		en: (first: string, others: number) => `${first} (and ${others} more)`,
		fr: (first: string, others: number) =>
			`${first} (et ${others} ${plural(others, 'autre', 'autres')})`
	},
	/** A draft's period when only its start is known, and is not said to be going on */
	from: {
		en: (month: string) => `From ${month}`,
		fr: (month: string) => `À partir ${de(month)}`
	},
	/** A draft's period when only its end is known */
	until: {
		en: (month: string) => `Until ${month}`,
		fr: (month: string) => `Jusqu'à ${month}`
	}
});
