import { defineMessages } from 'portfolio-common';

// "Before you start", on the Hire page: what the steps of the journey take from a recruiter.
export const m = defineMessages({
	title: { en: 'Before you start', fr: 'Avant de commencer' },
	/** The list of the steps, each with what it asks */
	steps: { en: 'What each step asks', fr: 'Ce que demande chaque étape' },
	howLong: { en: 'How long', fr: 'Durée' },
	/** About how long the steps take in all, one minute at least (through plural()) */
	minutes: {
		one: { en: 'About a minute', fr: 'Une minute environ' },
		other: {
			en: (minutes: number) => `About ${minutes} minutes`,
			fr: (minutes: number) => `${minutes} minutes environ`
		}
	},
	needs: { en: 'What you need', fr: "Ce qu'il vous faut" },
	/** No step needs anything at hand, nor a sign-in (a meeting alone is booked signed out) */
	nothingNeeded: {
		en: 'Nothing to prepare, and no account needed.',
		fr: 'Rien à préparer, et aucun compte nécessaire.'
	},
	next: { en: 'What happens next', fr: 'Ensuite' }
});
