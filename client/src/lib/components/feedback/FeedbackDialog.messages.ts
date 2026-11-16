import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	title: { en: 'Send feedback', fr: 'Donner votre avis' },
	intro: {
		en: 'Found a bug, or have an idea to make Portfolio better? Tell us, we read everything.',
		fr: 'Un bug, ou une idée pour améliorer Portfolio ? Dites-le-nous, nous lisons tout.'
	},
	label: { en: 'Your message', fr: 'Votre message' },
	placeholder: {
		en: 'For example: the Save button does nothing on my phone. Or: I would like to show a photo on my portfolio.',
		fr: "Par exemple : le bouton Enregistrer ne fait rien sur mon téléphone. Ou : j'aimerais afficher une photo sur mon portfolio."
	},
	help: {
		en: 'For a bug, say what you did just before.',
		fr: 'Pour un bug, dites ce que vous faisiez juste avant.'
	},
	context: {
		en: 'Sent with your message: the kind of page you are on (not its address), your browser, screen size, theme and language.',
		fr: "Envoyés avec votre message : le type de page où vous êtes (pas son adresse), votre navigateur, la taille de l'écran, le thème et la langue."
	},
	public: {
		en: 'It is published as a public issue on GitHub, without your name: do not include personal information.',
		fr: "Il est publié sous forme de ticket public sur GitHub, sans votre nom : n'y mettez pas d'informations personnelles."
	},
	classifies: {
		en: 'Claude, an AI by Anthropic (US), reads it to sort it and give it a title.',
		fr: "Claude, une IA d'Anthropic (États-Unis), le lit pour le classer et lui donner un titre."
	},
	privacy: {
		en: 'More in the <privacy>privacy policy</privacy>.',
		fr: 'Plus de détails dans la <privacy>politique de confidentialité</privacy>.'
	},
	newTab: { en: '(opens in a new tab)', fr: '(nouvel onglet)' },
	send: { en: 'Send', fr: 'Envoyer' },
	sending: { en: 'Sending…', fr: 'Envoi…' },
	sendingStatus: { en: 'Sending your feedback…', fr: 'Envoi de votre message…' },
	sent: {
		title: { en: 'Thanks for your feedback!', fr: 'Merci pour votre avis !' },
		bug: { en: 'We filed it as a bug report.', fr: "Nous l'avons enregistré comme bug." },
		feature: {
			en: 'We filed it as a feature request.',
			fr: "Nous l'avons enregistré comme demande de fonctionnalité."
		},
		task: { en: 'We filed it as a task.', fr: "Nous l'avons enregistré comme tâche." },
		issue: { en: 'See it on GitHub', fr: 'Le voir sur GitHub' }
	}
});
