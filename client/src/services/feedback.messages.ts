import { defineMessages } from 'portfolio-common';

// What the "Send feedback" dialog says when the API did not take a feedback (feedbackFailure)
export const m = defineMessages({
	sendFailed: {
		en: 'Could not send your feedback. Try again.',
		fr: "Impossible d'envoyer votre message. Réessayez."
	},
	sessionExpired: {
		en: 'Your session expired. Copy what you wrote, then reload the page and sign in again.',
		fr: 'Votre session a expiré. Copiez ce que vous avez écrit, puis rechargez la page et reconnectez-vous.'
	},
	unavailable: {
		en: 'Feedback cannot be sent right now.',
		fr: "L'envoi de messages n'est pas disponible pour le moment."
	},
	checkMessage: {
		en: 'Check your message and try again.',
		fr: 'Vérifiez votre message et réessayez.'
	},
	tooMany: {
		en: 'Too much feedback sent today. Try again tomorrow.',
		fr: "Trop de messages envoyés aujourd'hui. Réessayez demain."
	}
});
