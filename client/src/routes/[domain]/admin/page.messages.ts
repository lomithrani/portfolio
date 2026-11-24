import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	title: { en: 'Admin Settings', fr: 'Réglages du portfolio' },
	description: { en: 'Admin settings', fr: 'Réglages du portfolio' },
	tabs: {
		start: { en: 'Get started', fr: 'Pour commencer' },
		appearance: { en: 'Appearance', fr: 'Apparence' },
		workflows: { en: 'Hiring journey', fr: 'Parcours de recrutement' },
		perfectJob: { en: 'Perfect job', fr: 'Poste idéal' },
		appointments: { en: 'Appointments', fr: 'Rendez-vous' },
		share: { en: 'Share', fr: 'Partager' }
	},
	/** On the "Get started" tab while its checklist is not complete: "2/4" */
	progressBadge: {
		en: (done: number, total: number) => `${done}/${total}`,
		fr: (done: number, total: number) => `${done}/${total}`
	},
	/** The badge, for screen readers */
	progressLabel: {
		en: (done: number, total: number) => `${done} of ${total} done`,
		fr: (done: number, total: number) => `${done} sur ${total} ${plural(done, 'réglé', 'réglés')}`
	},
	loading: { en: 'Loading your settings…', fr: 'Chargement de vos réglages…' },
	readinessFailed: {
		en: 'Could not load your checklist.',
		fr: 'Impossible de charger votre liste.'
	},
	/**
	 * The checklist could not be read again (the tab shown again, the steps saved): the one read
	 * before stays, and the page is not signed out (what the other tabs hold would be lost)
	 */
	readinessStale: {
		'session-expired': {
			en: 'Your session expired, so this checklist could not be updated. Sign in again in another tab, then try again.',
			fr: "Votre session a expiré : cette liste n'a pas pu être mise à jour. Reconnectez-vous dans un autre onglet, puis réessayez."
		},
		network: {
			en: 'Could not reach the server, so this checklist could not be updated. Check your connection and try again.',
			fr: "Impossible de joindre le serveur : cette liste n'a pas pu être mise à jour. Vérifiez votre connexion et réessayez."
		},
		error: {
			en: 'This checklist could not be updated. Try again.',
			fr: "Cette liste n'a pas pu être mise à jour. Réessayez."
		}
	},
	adminOnly: {
		en: 'Only the admin of this domain can change its settings. Please log in.',
		fr: "Seul l'administrateur de ce portfolio peut modifier ses réglages. Connectez-vous."
	},
	backToExperiences: { en: 'Back to experiences', fr: 'Retour aux expériences' }
});
