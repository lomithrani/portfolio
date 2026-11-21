import { defineMessages } from 'portfolio-common';

// The texts built by matchingReviews.ts: why a reviewer's decision on a job put into matching did
// not go through, and where another job of the same recruiter stands with the reviewers. Read by
// the operator's reviewers only (MATCHING_REVIEWERS): the reason of a rejection is their own words,
// as they write it, never translated.
export const m = defineMessages({
	/** Why PUT /matching/reviews/:id did not go through (the reason's own refusals are the API's) */
	failure: {
		/** 409: the posting is no longer the version read; the page reads the list again */
		changed: {
			en: 'This job description changed since you read it. Here it is as it is now: read it again before you decide.',
			fr: "Cette offre a changé depuis que vous l'avez lue. La voici telle qu'elle est maintenant : relisez-la avant de décider."
		},
		/** 404 of the job: taken out of matching by its recruiter, or deleted */
		gone: {
			en: 'This job description no longer waits for a review: its recruiter stopped proposing it to candidates, or deleted it.',
			fr: "Cette offre n'attend plus de relecture : son recruteur a cessé de la proposer aux candidats, ou l'a supprimée."
		},
		signedOut: {
			en: 'Your session has ended. Sign in again to go on.',
			fr: 'Votre session a expiré. Reconnectez-vous pour continuer.'
		},
		unavailable: {
			en: 'This page is not available.',
			fr: "Cette page n'est pas disponible."
		},
		retry: {
			en: 'Your decision could not be saved. Try again.',
			fr: "Votre décision n'a pas pu être enregistrée. Réessayez."
		}
	},
	/** Where another job of the recruiter stands with the reviewers */
	review: {
		pending: { en: 'Waiting for a review', fr: 'En attente de relecture' },
		approved: { en: 'Approved', fr: 'Acceptée' },
		rejected: { en: 'Rejected', fr: 'Refusée' },
		never: { en: 'Never reviewed', fr: 'Jamais relue' }
	}
});
