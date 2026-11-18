import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The dialog's title before a job description is opened */
	openTitle: { en: 'Open this job description?', fr: "Ouvrir cette offre d'emploi ?" },
	/**
	 * Before a job description never opened leaves the drafts with another status than Open
	 * (`status`: its label, as portfolio-common names it)
	 */
	setTitle: {
		en: (status: string) => `Set this job description to ${status}?`,
		fr: (status: string) => `Passer cette offre d'emploi au statut « ${status} » ?`
	},
	/** Why it is asked: its terms are locked once it is open */
	openLocks: {
		en: "Once open, the pay and the conditions of this job are locked, because candidates' matches are computed on them. To change them later, duplicate it as a new job.",
		fr: "Une fois l'offre ouverte, sa rémunération et ses conditions sont verrouillées, car les correspondances des candidats sont calculées sur elles. Pour les modifier ensuite, dupliquez-la en une nouvelle offre."
	},
	/** The same, for another status than Open: leaving the drafts locks them too */
	leavingDraftLocks: {
		en: "Once it leaves the drafts, the pay and the conditions of this job are locked, because candidates' matches are computed on them. To change them later, duplicate it as a new job.",
		fr: "Une fois l'offre sortie des brouillons, sa rémunération et ses conditions sont verrouillées, car les correspondances des candidats sont calculées sur elles. Pour les modifier ensuite, dupliquez-la en une nouvelle offre."
	},
	/** The confirm button */
	open: { en: 'Open', fr: 'Ouvrir' },
	/** The confirm button for another status (`status`: its label) */
	set: {
		en: (status: string) => `Set to ${status}`,
		fr: (status: string) => `Passer à « ${status} »`
	}
});
