import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	sendFailed: {
		en: 'Could not send your suggestion. Try again.',
		fr: "Impossible d'envoyer votre suggestion. Réessayez."
	},
	sessionExpired: {
		en: 'Your session expired. Copy what you wrote, then reload the page and sign in again.',
		fr: 'Votre session a expiré. Copiez ce que vous avez écrit, puis rechargez la page et reconnectez-vous.'
	},
	ownerOnly: {
		en: 'Claim your portfolio to suggest a step.',
		fr: 'Réservez votre portfolio pour suggérer une étape.'
	},
	unavailable: {
		en: 'Suggestions are not available right now.',
		fr: 'Les suggestions ne sont pas disponibles pour le moment.'
	},
	checkSuggestion: {
		en: 'Check your suggestion and try again.',
		fr: 'Vérifiez votre suggestion et réessayez.'
	},
	tooMany: {
		en: 'Too many suggestions for today. Try again tomorrow.',
		fr: "Trop de suggestions pour aujourd'hui. Réessayez demain."
	}
});
