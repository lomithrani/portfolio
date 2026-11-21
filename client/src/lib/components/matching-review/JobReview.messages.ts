import { defineMessages } from 'portfolio-common';

// A job description waiting for a reviewer of matching (Path 2), on the reviewers' page: when it
// was sent for review, who is behind it (the domain of the recruiter's email address and a key
// standing for them, never their name or address), and the decision (approve, or reject with the
// reason its recruiter reads as the reviewer writes it). Read by the operator's reviewers only.
export const m = defineMessages({
	/** `moment`: formatMoment of the request */
	waitingSince: {
		en: (moment: string) => `Waiting for a review since ${moment}`,
		fr: (moment: string) => `En attente de relecture depuis le ${moment}`
	},
	/** `day`: when its recruiter put it into matching */
	proposedSince: {
		en: (day: string) => `Proposed to candidates by its recruiter on ${day}`,
		fr: (day: string) => `Proposée aux candidats par son recruteur le ${day}`
	},
	/** A decision taken on an earlier version (it was edited since): `day` */
	reviewedBefore: {
		en: (day: string) => `An earlier version was reviewed on ${day}: it was edited since.`,
		fr: (day: string) =>
			`Une version précédente a été relue le ${day} : elle a été modifiée depuis.`
	},
	/** Who is behind it */
	recruiter: {
		heading: { en: 'Recruiter', fr: 'Recruteur' },
		emailDomain: { en: 'Email domain', fr: "Domaine de l'adresse e-mail" },
		noEmail: { en: 'No email address', fr: "Pas d'adresse e-mail" },
		key: { en: 'Recruiter key', fr: 'Clé du recruteur' },
		/** Backed by: reviewerRecruiterKey of server/services/matchingReviews.ts */
		keyHint: {
			en: 'The same on each of their jobs: it tells them from other recruiters at the same domain.',
			fr: 'La même sur chacune de ses offres : elle le distingue des autres recruteurs du même domaine.'
		}
	},
	decision: {
		heading: { en: 'Your decision', fr: 'Votre décision' },
		/** Backed by: server/services/matchingReviews.ts (approved: proposed; rejected: the reason its recruiter reads) */
		text: {
			en: 'Approved, it is proposed at once to the candidates whose criteria it meets. Rejected, it reaches none, and its recruiter reads your reason as you write it.',
			fr: "Acceptée, elle est proposée tout de suite aux candidats dont elle remplit les critères. Refusée, elle n'en touche aucun, et son recruteur lit votre raison telle que vous l'écrivez."
		},
		approve: { en: 'Approve', fr: 'Accepter' },
		/** The reason's field (required to reject) */
		reason: { en: 'Why you reject it', fr: 'Pourquoi vous la refusez' },
		/** `max`: MATCHING_LIMITS.reviewReason */
		reasonHint: {
			en: (max: number) =>
				`Its recruiter reads it as you write it, in your words: ${max} characters at most.`,
			fr: (max: number) =>
				`Son recruteur la lit telle que vous l'écrivez, avec vos mots : ${max} caractères au plus.`
		},
		reject: { en: 'Reject', fr: 'Refuser' },
		rejecting: { en: 'Rejecting…', fr: 'Refus…' }
	}
});
