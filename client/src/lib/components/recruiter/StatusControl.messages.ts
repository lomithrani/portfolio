import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The section's heading, and the menu's */
	title: { en: 'Status', fr: 'Statut' },
	change: { en: 'Change status', fr: 'Changer le statut' },
	note: {
		en: 'Only Open job descriptions take applications. Drafts are hidden from the public.',
		fr: 'Seules les offres au statut « Ouverte » acceptent les candidatures. Les brouillons ne sont pas visibles du public.'
	}
});
