// Texts built by `jobView.ts`: the private page of a job description (/opportunities/:id)
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The browser tab's title (`title`: the posting's, or jobDescription until it is loaded) */
	pageTitle: {
		en: (title: string) => `${title} | Portfolio`,
		fr: (title: string) => `${title} | Portfolio`
	},
	/** In the tab's title until the posting is loaded, and for a posting without a title */
	jobDescription: { en: 'Job description', fr: "Offre d'emploi" },
	/**
	 * A read refused for now (429: the reads of matching's feeds in an hour, which this page's reads
	 * count against while matching is on; `moment`: '28 Nov 2026, 14:05', from its Retry-After)
	 */
	limitedUntil: {
		en: (moment: string) =>
			`You have read jobs as often as an hour allows. Try again from ${moment}.`,
		fr: (moment: string) =>
			`Vous avez consulté des offres aussi souvent qu'une heure le permet. Réessayez à partir du ${moment}.`
	},
	limited: {
		en: 'You have read jobs as often as an hour allows. Try again later.',
		fr: "Vous avez consulté des offres aussi souvent qu'une heure le permet. Réessayez plus tard."
	}
});
