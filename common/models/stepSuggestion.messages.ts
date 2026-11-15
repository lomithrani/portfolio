import { defineMessages } from '../i18n';

// What the "Suggest a step" form says of a suggestion it refuses (parseStepSuggestion), under
// the field it is about
export const stepSuggestionMessages = defineMessages({
	nameRequired: { en: 'Give the step a name.', fr: "Donnez un nom à l'étape." },
	nameTooLong: {
		en: (max: number) => `The name is at most ${max} characters.`,
		fr: (max: number) => `Utilisez ${max} caractères au maximum pour le nom.`
	},
	descriptionRequired: {
		en: 'Say what a recruiter would do on this step.',
		fr: 'Décrivez ce que ferait un recruteur à cette étape.'
	},
	/** The description or the reason: shown under the field, which it does not need to name */
	textTooLong: {
		en: (max: number) => `This is at most ${max} characters.`,
		fr: (max: number) => `Utilisez ${max} caractères au maximum.`
	}
});
