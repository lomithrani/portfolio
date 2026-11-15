import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** Under the toast that says the portfolio was claimed */
	claimed: {
		en: (name: string) => `${name} is yours. Add your experience so recruiters see it.`,
		fr: (name: string) =>
			`${name} est à vous. Ajoutez votre expérience pour que les recruteurs la voient.`
	},
	submit: { en: 'Claim this portfolio', fr: 'Réserver ce portfolio' }
});
