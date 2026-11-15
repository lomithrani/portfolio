import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	title: { en: 'Admin Settings', fr: 'Réglages du portfolio' },
	description: { en: 'Admin settings', fr: 'Réglages du portfolio' },
	tabs: {
		appearance: { en: 'Appearance', fr: 'Apparence' },
		workflows: { en: 'Hiring journey', fr: 'Parcours de recrutement' },
		perfectJob: { en: 'Perfect job', fr: 'Poste idéal' },
		appointments: { en: 'Appointments', fr: 'Rendez-vous' }
	},
	adminOnly: {
		en: 'Only the admin of this domain can change its settings. Please log in.',
		fr: "Seul l'administrateur de ce portfolio peut modifier ses réglages. Connectez-vous."
	},
	backToExperiences: { en: 'Back to experiences', fr: 'Retour aux expériences' }
});
