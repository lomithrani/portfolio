import { defineMessages, plural } from 'portfolio-common';

// The reviewers' page of matching (Path 2): the job descriptions recruiters ask to propose to
// candidates, each read here by one of the operator's reviewers (MATCHING_REVIEWERS) before it
// reaches any candidate, approved or rejected with a reason. Anyone else reads that the page is not
// available, and nothing of what it is (signed out too: nothing says signing in would open it): the
// page's title, heading and texts name it only once the API answered the list. Read by the operator
// (the founder reads French). No candidate's data is shown: the API gives none.
export const m = defineMessages({
	/** The page's title once the list is read */
	pageTitle: { en: 'Jobs to review | Portfolio', fr: 'Offres à relire | Portfolio' },
	// For anyone else (signed out, not a reviewer, matching off), its title, heading and text are
	// those of every page of matching not available (`unavailable` of matching.messages.ts): never
	// what the page is
	/** Before the list is read, so it says nothing of what the page is */
	loadFailed: {
		title: { en: 'This page could not be loaded', fr: "Cette page n'a pas pu être chargée" },
		text: {
			en: 'Check your connection, then try again.',
			fr: 'Vérifiez votre connexion, puis réessayez.'
		}
	},
	heading: { en: 'Jobs to review', fr: 'Offres à relire' },
	/**
	 * Backed by: server/services/matchingReviews.ts (only an approved job is proposed, the
	 * recruiter's other jobs and their copies), jobMatching.ts (an edit sends it back for review)
	 */
	intro: {
		en: 'Each job description a recruiter asks to propose to candidates waits here until you approve it: only an approved one reaches candidates, and an edit sends it back here. Read it as candidates will. Beside it, the recruiter’s other jobs: reject copies of a job that differ in one term, such as the pay or the office, since which candidates each copy reaches would tell its recruiter the pay they ask or the area they live in.',
		fr: "Chaque offre qu'un recruteur demande à proposer aux candidats attend ici que vous l'acceptiez : seule une offre acceptée parvient aux candidats, et une modification la renvoie ici. Lisez-la comme les candidats la liront. À côté, les autres offres du recruteur : refusez les copies d'une offre qui ne diffèrent que d'une condition, comme la rémunération ou le bureau, car les candidats que touche chaque copie apprendraient à son recruteur la rémunération qu'ils demandent ou le secteur où ils habitent."
	},
	/** How many wait (the reviewer may count: no candidate is counted) */
	waiting: {
		en: (count: number) =>
			`${count} ${plural(count, 'job description waits', 'job descriptions wait')} for a review, the oldest first.`,
		fr: (count: number) =>
			`${count} ${plural(count, 'offre attend', 'offres attendent')} une relecture, la plus ancienne en premier.`
	},
	/**
	 * A read listed MATCHING_LIMITS.reviewsPerRead: more wait after those shown (`count`: how many
	 * are shown, fewer once some are decided). Backed by: pendingReviews of
	 * server/services/matchingReviews.ts (the oldest first, reviewsPerRead at most)
	 */
	waitingMore: {
		en: (count: number) =>
			`${plural(count, 'This job description has', `These ${count} job descriptions have`)} waited longest, the oldest first, and more wait after them: they show here when the list is read again, once you decide these or when you check again.`,
		fr: (count: number) =>
			`${plural(count, 'Cette offre attend', `Ces ${count} offres attendent`)} depuis le plus longtemps, la plus ancienne en premier, et d'autres attendent après : elles apparaissent ici quand la liste est lue de nouveau, une fois celles-ci décidées ou quand vous vérifiez de nouveau.`
	},
	checkAgain: { en: 'Check again', fr: 'Vérifier de nouveau' },
	checking: { en: 'Checking…', fr: 'Vérification…' },
	/** Read again (Check again), for screen readers; `more`: the read listed reviewsPerRead */
	checked: {
		en: (count: number, more: boolean) =>
			count === 0
				? 'Checked: no job description waits.'
				: more
					? `Checked: ${count} ${plural(count, 'job description waits', 'job descriptions wait')} on this page, and more after them.`
					: `Checked: ${count} ${plural(count, 'job description waits', 'job descriptions wait')}.`,
		fr: (count: number, more: boolean) =>
			count === 0
				? "Vérifié : aucune offre n'attend."
				: more
					? `Vérifié : ${count} ${plural(count, 'offre attend', 'offres attendent')} sur cette page, et d'autres après.`
					: `Vérifié : ${count} ${plural(count, 'offre attend', 'offres attendent')}.`
	},
	/** Read again and it failed: the list shown is the one read before */
	checkFailed: {
		en: 'The list could not be checked again: it is the one read before. Try again.',
		fr: "La liste n'a pas pu être vérifiée de nouveau : c'est celle lue précédemment. Réessayez."
	},
	/** Read again with the session expired: the list (and what was typed) stays */
	checkSignedOut: {
		en: 'Your session expired: the list could not be checked again. What you wrote is still here: sign in again in another tab, then check again.',
		fr: "Votre session a expiré : la liste n'a pas pu être vérifiée de nouveau. Ce que vous avez écrit est toujours là : reconnectez-vous dans un autre onglet, puis vérifiez de nouveau."
	},
	/**
	 * After a decision refused (changed since it was read, or no longer waiting), the list read
	 * again: what it found. Each follows the refusal's own sentence ("Your decision was not saved:
	 * this job description changed since you read it.")
	 */
	refused: {
		/** Still waiting: shown as it is now, the notice under its title */
		shownNow: {
			en: 'Here it is as it is now: read it again before you decide.',
			fr: "La voici telle qu'elle est maintenant : relisez-la avant de décider."
		},
		/** Changed, and no longer on the list */
		left: {
			en: 'It no longer waits for a review.',
			fr: "Elle n'attend plus de relecture."
		},
		/** The list could not be read again: the job shown is the version read before */
		notRead: {
			en: 'The list could not be read again: check again, then read the job as it is now before you decide.',
			fr: "La liste n'a pas pu être lue de nouveau : vérifiez de nouveau, puis relisez l'offre telle qu'elle est maintenant avant de décider."
		}
	},
	/** Nothing waits */
	empty: {
		title: { en: 'Nothing to review', fr: 'Rien à relire' },
		/** Backed by: server/services/siteMetrics.ts (matching_job_reviews), no email (decision 10) */
		text: {
			en: 'A job description shows here as soon as its recruiter asks to propose it to candidates, or edits one they asked to propose. No email tells you: check again later.',
			fr: "Une offre s'affiche ici dès que son recruteur demande à la proposer aux candidats, ou modifie une offre qu'il a demandé à proposer. Aucun e-mail ne vous prévient : vérifiez de nouveau plus tard."
		}
	},
	/** Every job of a read that listed reviewsPerRead is decided, and the list was not read again */
	decidedAll: {
		title: { en: 'These are decided', fr: 'Celles-ci sont décidées' },
		text: {
			en: 'More job descriptions wait after them: check again to read them.',
			fr: "D'autres offres attendent après elles : vérifiez de nouveau pour les lire."
		}
	},
	/**
	 * Once a decision is saved (`title`: the job's). Backed by: isLiveInMatching of
	 * server/services/jobMatching.ts (open, approved, its recruiter having accepted the terms in
	 * force: the page cannot tell the last, so an approved open job "can" be proposed)
	 */
	approved: {
		en: (title: string) =>
			`Approved: ${title}. It can now be proposed to the candidates whose criteria it meets.`,
		fr: (title: string) =>
			`Acceptée : ${title}. Elle peut maintenant être proposée aux candidats dont elle remplit les critères.`
	},
	/** A job on hold, approved: proposed to nobody until it is open again */
	approvedOnHold: {
		en: (title: string) =>
			`Approved: ${title}. It is on hold: it can be proposed to candidates once its recruiter opens it again.`,
		fr: (title: string) =>
			`Acceptée : ${title}. Elle est en pause : elle pourra être proposée aux candidats une fois que son recruteur la rouvrira.`
	},
	rejected: {
		en: (title: string) => `Rejected: ${title}. Its recruiter reads your reason.`,
		fr: (title: string) => `Refusée : ${title}. Son recruteur lit votre raison.`
	},
	/** Approving asks first */
	approveDialog: {
		title: { en: 'Approve this job description?', fr: 'Accepter cette offre ?' },
		/** `title`: the job's, open. Backed by: isLiveInMatching of server/services/jobMatching.ts */
		description: {
			en: (title: string) =>
				`Once approved, ${title} is proposed to the candidates whose criteria it meets, while it stays open and its recruiter has accepted the terms in force.`,
			fr: (title: string) =>
				`Une fois acceptée, ${title} est proposée aux candidats dont elle remplit les critères, tant qu'elle reste ouverte et que son recruteur a accepté les conditions d'utilisation en vigueur.`
		},
		/** A job on hold (it stays in matching) */
		descriptionOnHold: {
			en: (title: string) =>
				`${title} is on hold: once approved, it is proposed to the candidates whose criteria it meets only when its recruiter opens it again, and while they have accepted the terms in force.`,
			fr: (title: string) =>
				`${title} est en pause : une fois acceptée, elle n'est proposée aux candidats dont elle remplit les critères qu'une fois que son recruteur la rouvre, et tant qu'il a accepté les conditions d'utilisation en vigueur.`
		},
		/**
		 * Backed by: pendingReviews (pending jobs only) and afterJobEdited of jobMatching.ts (an edit
		 * sends it back for review); GET /matching/reviews gives no version of the other jobs
		 */
		details: {
			en: 'You cannot take this back on this page: the job comes back here only if its recruiter edits it.',
			fr: "Vous ne pourrez pas revenir sur cette décision depuis cette page : l'offre n'y revient que si son recruteur la modifie."
		},
		confirm: { en: 'Approve', fr: 'Accepter' },
		busy: { en: 'Approving…', fr: 'Acceptation…' }
	}
});
