import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	sessionExpired: {
		en: 'Your session has expired. Please log in again.',
		fr: 'Votre session a expiré. Reconnectez-vous.'
	},
	saveFailed: { en: 'Failed to save settings.', fr: "Impossible d'enregistrer les réglages." },
	saved: { en: 'Settings saved!', fr: 'Réglages enregistrés !' },
	theme: { en: 'Theme', fr: 'Thème' },
	themeIntro: {
		en: 'Select a Skeleton theme for your portfolio. Changes preview instantly.',
		fr: "Choisissez un thème Skeleton pour votre portfolio. L'aperçu est immédiat."
	},
	header: { en: 'Header', fr: 'En-tête' },
	title: { en: 'Title', fr: 'Titre' },
	/**
	 * The title is the name visitors and recruiters read everywhere: the header, the tab's title,
	 * "Propose a role to …" (the page for recruiters and its link preview)
	 */
	titleHint: {
		en: "Your name, as visitors and recruiters read it (“Propose a role to Jane Doe”). Left empty, the name in your portfolio's address is used.",
		fr: "Votre nom, tel que les visiteurs et les recruteurs le lisent (« Proposer un poste à Jane Doe »). Laissé vide, le nom de l'adresse de votre portfolio est utilisé."
	},
	subtitle: { en: 'Subtitle', fr: 'Sous-titre' },
	subtitlePlaceholder: {
		en: 'e.g. Full Stack Developer & Problem Solver',
		fr: 'ex. : Développeuse full stack, curieuse de tout'
	},
	darkMode: { en: 'Default Dark Mode', fr: 'Mode sombre par défaut' },
	darkModeIntro: {
		en: 'Set the default dark mode preference for first-time visitors.',
		fr: 'Choisissez le mode affiché aux visiteurs lors de leur première visite.'
	},
	dark: { en: 'Dark', fr: 'Sombre' },
	light: { en: 'Light', fr: 'Clair' },
	saving: { en: 'Saving...', fr: 'Enregistrement…' },
	save: { en: 'Save Settings', fr: 'Enregistrer les réglages' }
});
