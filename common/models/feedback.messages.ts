import { defineMessages } from '../i18n';

// What the "Send feedback" dialog says of a message it refuses (parseFeedback), under the field
export const feedbackMessages = defineMessages({
	messageRequired: {
		en: 'Tell us what happened or what you would like.',
		fr: "Dites-nous ce qui s'est passé ou ce que vous aimeriez."
	},
	messageTooShort: {
		en: (min: number) => `Write at least ${min} characters, so we can understand.`,
		fr: (min: number) => `Écrivez au moins ${min} caractères, pour que nous puissions comprendre.`
	},
	messageTooLong: {
		en: (max: number) => `This is at most ${max} characters.`,
		fr: (max: number) => `Utilisez ${max} caractères au maximum.`
	}
});
