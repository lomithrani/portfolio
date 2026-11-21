import { defineMessages } from 'portfolio-common';

// The texts built by matchingReviews.ts: why a reviewer's decision on a job put into matching did
// not go through, and where another job of the same recruiter stands with the reviewers. Read by
// the operator's reviewers only (MATCHING_REVIEWERS): the reason of a rejection is their own words,
// as they write it, never translated.
export const m = defineMessages({
	/** Why PUT /matching/reviews/:id did not go through (the reason's own refusals are the API's) */
	failure: {
		/**
		 * 409: the posting is no longer the version read; the page reads the list again and says
		 * what it found (the job as it is now, or no longer waiting)
		 */
		changed: {
			en: 'Your decision was not saved: this job description changed since you read it.',
			fr: "Votre décision n'a pas été enregistrée : cette offre a changé depuis que vous l'avez lue."
		},
		/** 404 of the job: taken out of matching by its recruiter (a status too), or deleted */
		gone: {
			en: 'Your decision was not saved: this job description no longer waits for a review. Its recruiter no longer asks to propose it to candidates, or deleted it.',
			fr: "Votre décision n'a pas été enregistrée : cette offre n'attend plus de relecture. Son recruteur ne demande plus à la proposer aux candidats, ou l'a supprimée."
		},
		/** 401: said next to the button, the session and what was typed kept */
		signedOut: {
			en: 'Your session expired: your decision was not saved. What you wrote is still here: sign in again in another tab, then try again.',
			fr: "Votre session a expiré : votre décision n'a pas été enregistrée. Ce que vous avez écrit est toujours là : reconnectez-vous dans un autre onglet, puis réessayez."
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
