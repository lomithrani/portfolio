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
	adminOnly: {
		en: 'Only the admin of this domain can change its settings. Please log in.',
		fr: "Seul l'administrateur de ce portfolio peut modifier ses réglages. Connectez-vous."
	},
	backToExperiences: { en: 'Back to experiences', fr: 'Retour aux expériences' }
});
