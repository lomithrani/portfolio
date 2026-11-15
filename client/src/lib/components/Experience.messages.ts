import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** Name of the owner's Edit button of a card (its visible text is the shared "Edit") */
	edit: {
		en: (title: string) => `Edit ${title}`,
		fr: (title: string) => `Modifier ${title}`
	},
	/** The button under a summary longer than its four lines */
	showMore: { en: 'Show more', fr: 'Voir plus' },
	showLess: { en: 'Show less', fr: 'Voir moins' }
});
