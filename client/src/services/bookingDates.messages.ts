import { defineMessages } from 'portfolio-common';

// What the booking page says when the dates or the free times of a schedule cannot be loaded.
export const m = defineMessages({
	/** No online booking (also what the Hire page says of a journey without a step) */
	bookingUnavailable: {
		en: 'Online booking is not available right now. Please reach out directly.',
		fr: "La réservation en ligne n'est pas disponible pour le moment. Prenez contact directement."
	},
	scheduleGone: {
		en: 'This meeting type is not available anymore.',
		fr: "Ce type de rendez-vous n'est plus disponible."
	},
	signIn: {
		en: 'Sign in to continue the hiring journey.',
		fr: 'Connectez-vous pour continuer le parcours de recrutement.'
	},
	completeStepsAbove: {
		en: 'Complete the steps above first.',
		fr: "Terminez d'abord les étapes ci-dessus."
	},
	datesFailed: {
		en: "We couldn't load the available dates. Please try again.",
		fr: 'Impossible de charger les dates disponibles. Réessayez.'
	},
	slotsFailed: {
		en: "We couldn't load the free times of this date. Please try again.",
		fr: 'Impossible de charger les horaires libres de cette date. Réessayez.'
	}
});
