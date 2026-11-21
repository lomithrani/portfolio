import { defineMessages } from 'portfolio-common';

// A job description waiting for a reviewer of matching (Path 2), on the reviewers' page: when it
// was sent for review, who is behind it (the domain of the recruiter's email address and a key
// standing for them, never their name or address), and the decision (approve, or reject with the
// reason its recruiter reads in the reviewer's words). Read by the operator's reviewers only.
export const m = defineMessages({
	/** `moment`: formatMoment of the request */
	waitingSince: {
		en: (moment: string) => `Waiting for a review since ${moment}`,
		fr: (moment: string) => `En attente de relecture depuis le ${moment}`
	},
	/**
	 * `day`: when its recruiter put it into matching. What they asked for, not what it is: only an
	 * approved job is proposed to candidates ("Proposed to candidates" is the recruiter's word for
	 * that, docs/I18N.md)
	 */
	askedSince: {
		en: (day: string) => `Its recruiter asked to propose it to candidates on ${day}`,
		fr: (day: string) => `Son recruteur a demandé à la proposer aux candidats le ${day}`
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
		/**
		 * Backed by: server/services/matchingReviews.ts (approved: proposed; rejected: the reason its
		 * recruiter reads), isLiveInMatching of jobMatching.ts (open, approved, its recruiter having
		 * accepted the terms in force), parseReviewReason of portfolio-common (one line)
		 */
		text: {
			en: 'Approved, it is proposed to the candidates whose criteria it meets, while it is open and its recruiter has accepted the terms in force. Rejected, it reaches none, and its recruiter reads your reason.',
			fr: "Acceptée, elle est proposée aux candidats dont elle remplit les critères, tant qu'elle est ouverte et que son recruteur a accepté les conditions d'utilisation en vigueur. Refusée, elle n'en touche aucun, et son recruteur lit votre raison."
		},
		/** A job on hold (it stays in matching): proposed to nobody until it is open again */
		onHold: {
			en: 'This job is on hold: approved, it is proposed to candidates only once its recruiter opens it again.',
			fr: "Cette offre est en pause : acceptée, elle n'est proposée aux candidats qu'une fois que son recruteur la rouvre."
		},
		approve: { en: 'Approve', fr: 'Accepter' },
		/** Approve's name for screen readers: the page lists many jobs (`title`: the job's) */
		approveNamed: {
			en: (title: string) => `Approve: ${title}`,
			fr: (title: string) => `Accepter : ${title}`
		},
		/** The reason's field (required to reject) */
		reason: { en: 'Why you reject it', fr: 'Pourquoi vous la refusez' },
		/** The field's name for screen readers (`title`: the job's) */
		reasonNamed: {
			en: (title: string) => `Why you reject it: ${title}`,
			fr: (title: string) => `Pourquoi vous la refusez : ${title}`
		},
		/** `max`: MATCHING_LIMITS.reviewReason. parseReviewReason keeps it on one line */
		reasonHint: {
			en: (max: number) =>
				`Required to reject. Its recruiter reads it in your words, on one line (line breaks are not kept): ${max} characters at most.`,
			fr: (max: number) =>
				`Obligatoire pour refuser. Son recruteur la lit avec vos mots, sur une ligne (les retours à la ligne ne sont pas gardés) : ${max} caractères au plus.`
		},
		reject: { en: 'Reject', fr: 'Refuser' },
		/** Reject's name for screen readers (`title`: the job's) */
		rejectNamed: {
			en: (title: string) => `Reject: ${title}`,
			fr: (title: string) => `Refuser : ${title}`
		},
		rejecting: { en: 'Rejecting…', fr: 'Refus…' }
	}
});
