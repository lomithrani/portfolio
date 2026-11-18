import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/**
	 * The page's title and heading, whatever the journey leads to. Neutral (the page is the
	 * owner's page for recruiters): having a portfolio says nothing about looking for a job
	 */
	title: {
		en: (ownerName: string) => `Propose a role to ${ownerName}`,
		fr: (ownerName: string) => `Proposer un poste à ${ownerName}`
	},
	description: {
		en: (ownerName: string) =>
			`Propose a role to ${ownerName}: their page for recruiters, with the steps they ask you to follow.`,
		fr: (ownerName: string) =>
			`Proposez un poste à ${ownerName} : sa page recruteurs, avec les étapes à suivre.`
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
		en: 'This is your page for recruiters, as they see it. Its steps never stop you. <admin>Change the steps</admin>',
		fr: 'Voici votre page recruteurs, telle que les recruteurs la voient. Ses étapes ne vous arrêtent jamais. <admin>Modifier les étapes</admin>'
	},
	/** The owner's preview: their Share tab (reply and LinkedIn texts), under "Copy your link" */
	moreWays: { en: 'More ways to share', fr: 'Plus de façons de partager' },
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
