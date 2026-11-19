import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The rail's links: 12 px labels under an icon, short (on two lines at most) */
	links: {
		experiences: { en: 'Experiences', fr: 'Expériences' },
		/** The Hire page, for visitors */
		hire: { en: 'Propose a role', fr: 'Proposer un poste' },
		/** The same page, for its owner: their page for recruiters */
		hireOwner: { en: 'Page for recruiters', fr: 'Page recruteurs' },
		admin: { en: 'Admin', fr: 'Admin' }
	},
	/** Name of the handle on the left edge, by what pressing it does */
	openSidebar: { en: 'Open sidebar', fr: 'Ouvrir la barre latérale' },
	closeSidebar: { en: 'Close sidebar', fr: 'Fermer la barre latérale' }
});
