import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The page's title, also its heading for a journey that leads nowhere */
	title: {
		en: (ownerName: string) => `Hire ${ownerName}`,
		fr: (ownerName: string) => `Recruter ${ownerName}`
	},
	description: {
		en: (ownerName: string) => `Book a meeting with ${ownerName}.`,
		fr: (ownerName: string) => `Réservez un rendez-vous avec ${ownerName}.`
	},
	journeyFailed: {
		en: 'Could not load this hiring journey. Try again in a moment.',
		fr: 'Impossible de charger ce parcours de recrutement. Réessayez dans un instant.'
	},
	/** Toasts of a step the journey stopped: the session ended, or an earlier step does not hold */
	locked: {
		signIn: { en: 'Sign in to continue', fr: 'Connectez-vous pour continuer' },
		stepsFirst: { en: 'Complete the steps first', fr: "Terminez d'abord les étapes" },
		why: {
			en: (ownerName: string) =>
				`${ownerName} asks recruiters to complete the earlier steps first.`,
			fr: (ownerName: string) =>
				`${ownerName} demande aux recruteurs de terminer d'abord les étapes précédentes.`
		}
	},
	/** The owner's preview */
	own: {
		en: 'This is your hiring journey, as recruiters see it. Its steps never stop you. <admin>Change the steps</admin>',
		fr: 'Voici votre parcours de recrutement, tel que les recruteurs le voient. Ses étapes ne vous arrêtent jamais. <admin>Modifier les étapes</admin>'
	},
	journey: { en: 'Hiring journey', fr: 'Parcours de recrutement' },
	/** Before a step's name, for screen readers: "Step 2: Pick a job (done)" */
	step: {
		en: (number: number) => `Step ${number}:`,
		fr: (number: number) => `Étape ${number} :`
	},
	state: {
		done: { en: '(done)', fr: '(terminée)' },
		locked: { en: '(locked)', fr: '(verrouillée)' },
		failed: { en: '(not passed)', fr: '(non validée)' }
	},
	open: { en: 'Open', fr: 'Ouvrir' }
});
