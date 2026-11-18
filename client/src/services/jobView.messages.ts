// Texts built by `jobView.ts`: the private page of a job description (/opportunities/:id)
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The browser tab's title (`title`: the posting's, or jobDescription until it is loaded) */
	pageTitle: {
		en: (title: string) => `${title} | Portfolio`,
		fr: (title: string) => `${title} | Portfolio`
	},
	/** In the tab's title until the posting is loaded, and for a posting without a title */
	jobDescription: { en: 'Job description', fr: "Offre d'emploi" }
});
