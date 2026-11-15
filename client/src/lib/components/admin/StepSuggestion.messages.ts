import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	sent: { en: 'Suggestion sent', fr: 'Suggestion envoyée' },
	sentDetails: {
		en: 'Thank you! It was filed as a feature request for the project.',
		fr: 'Merci ! Elle a été enregistrée comme demande de fonctionnalité pour le projet.'
	},
	title: { en: 'Missing a step?', fr: 'Il vous manque une étape ?' },
	intro: {
		en: 'Tell us which step you would like in your hiring journey: it is sent to the project as a feature request.',
		fr: 'Dites-nous quelle étape vous aimeriez dans votre parcours de recrutement : elle est envoyée au projet comme demande de fonctionnalité.'
	},
	suggest: { en: 'Suggest a step', fr: 'Suggérer une étape' },
	name: { en: 'Name of the step', fr: "Nom de l'étape" },
	namePlaceholder: {
		en: 'e.g. Share the salary range',
		fr: 'ex. : Indiquer la fourchette de rémunération'
	},
	description: { en: 'What would a recruiter do on it?', fr: "Qu'y ferait un recruteur ?" },
	descriptionPlaceholder: {
		en: 'e.g. They give the salary range of the job before they can book a meeting.',
		fr: "ex. : Il indique la fourchette de rémunération de l'offre avant de pouvoir réserver un rendez-vous."
	},
	descriptionHelp: {
		en: 'What they see, what they answer or do.',
		fr: "Ce qu'il voit, ce qu'il répond ou fait."
	},
	reason: {
		en: 'Why would it help you? <note>(optional)</note>',
		fr: 'En quoi vous aiderait-elle ? <note>(facultatif)</note>'
	},
	reasonHelp: {
		en: 'It helps decide what to build first.',
		fr: 'Cela aide à décider quoi développer en premier.'
	},
	publicNotice: {
		en: "Your suggestion is posted without your name on the project's issue tracker on GitHub, which others can read: leave out anything private.",
		fr: "Votre suggestion est publiée sans votre nom dans le suivi des tickets du projet sur GitHub, que d'autres peuvent lire : n'y mettez rien de privé."
	},
	sending: { en: 'Sending...', fr: 'Envoi…' },
	send: { en: 'Send suggestion', fr: 'Envoyer la suggestion' }
});
