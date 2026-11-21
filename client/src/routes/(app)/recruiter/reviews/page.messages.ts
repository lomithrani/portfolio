import { defineMessages, plural } from 'portfolio-common';

// The reviewers' page of matching (Path 2): the job descriptions recruiters propose to candidates,
// each read here by one of the operator's reviewers (MATCHING_REVIEWERS) before it reaches any
// candidate, approved or rejected with a reason. Anyone else reads that the page is not available,
// and nothing of what it is: the page's title, heading and texts name it only once the API answered
// the list. Read by the operator (the founder reads French). No candidate's data is shown: the API
// gives none.
export const m = defineMessages({
	/** The page's title once the list is read */
	pageTitle: { en: 'Jobs to review | Portfolio', fr: 'Offres à relire | Portfolio' },
	/** The page's title for anyone else (signed out, not a reviewer, matching off) */
	unavailableTitle: { en: 'Not available | Portfolio', fr: 'Indisponible | Portfolio' },
	/** For anyone but a reviewer, and while matching is off: never what the page is */
	unavailable: {
		title: { en: 'Not available', fr: 'Indisponible' },
		text: { en: 'This page is not available.', fr: "Cette page n'est pas disponible." },
		/** Signed out: the header's sign-in button is there */
		signedOut: {
			en: 'This page is not available without signing in.',
			fr: "Cette page n'est pas disponible sans connexion."
		}
	},
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
		en: 'Each job description a recruiter proposes to candidates waits here until you approve it: only an approved one reaches candidates, and an edit sends it back here. Read it as candidates will. Beside it, the recruiter’s other jobs: reject copies of a job that differ in one term, such as the pay or the office, since which candidates each copy reaches would tell its recruiter the pay they ask or the area they live in.',
		fr: "Chaque offre qu'un recruteur propose aux candidats attend ici que vous l'acceptiez : seule une offre acceptée parvient aux candidats, et une modification la renvoie ici. Lisez-la comme les candidats la liront. À côté, les autres offres du recruteur : refusez les copies d'une offre qui ne diffèrent que d'une condition, comme la rémunération ou le bureau, car les candidats que touche chaque copie apprendraient à son recruteur la rémunération qu'ils demandent ou le secteur où ils habitent."
	},
	/** How many wait (the reviewer may count: no candidate is counted) */
	waiting: {
		en: (count: number) =>
			`${count} ${plural(count, 'job description waits', 'job descriptions wait')} for a review, the oldest first.`,
		fr: (count: number) =>
			`${count} ${plural(count, 'offre attend', 'offres attendent')} une relecture, la plus ancienne en premier.`
	},
	/** As many as one read lists (MATCHING_LIMITS.reviewsPerRead) */
	full: {
		en: 'Those that waited longest: the others show once these are decided.',
		fr: 'Celles qui attendent depuis le plus longtemps : les autres apparaissent une fois celles-ci décidées.'
	},
	checkAgain: { en: 'Check again', fr: 'Vérifier de nouveau' },
	checking: { en: 'Checking…', fr: 'Vérification…' },
	/** Read again (Check again), for screen readers */
	checked: {
		en: (count: number) =>
			count === 0
				? 'Checked: no job description waits.'
				: `Checked: ${count} ${plural(count, 'job description waits', 'job descriptions wait')}.`,
		fr: (count: number) =>
			count === 0
				? "Vérifié : aucune offre n'attend."
				: `Vérifié : ${count} ${plural(count, 'offre attend', 'offres attendent')}.`
	},
	/** Read again and it failed: the list shown is the one read before */
	checkFailed: {
		en: 'The list could not be checked again: it is the one read before. Try again.',
		fr: "La liste n'a pas pu être vérifiée de nouveau : c'est celle lue précédemment. Réessayez."
	},
	/** Nothing waits */
	empty: {
		title: { en: 'Nothing to review', fr: 'Rien à relire' },
		/** Backed by: server/services/siteMetrics.ts (matching_job_reviews), no email (decision 10) */
		text: {
			en: 'A job description shows here as soon as its recruiter proposes it to candidates, or edits one proposed already. No email tells you: check again later.',
			fr: "Une offre s'affiche ici dès que son recruteur la propose aux candidats, ou en modifie une déjà proposée. Aucun e-mail ne vous prévient : vérifiez de nouveau plus tard."
		}
	},
	/** Once a decision is saved (`title`: the job's) */
	approved: {
		en: (title: string) =>
			`Approved: ${title}. It is proposed to the candidates whose criteria it meets.`,
		fr: (title: string) =>
			`Acceptée : ${title}. Elle est proposée aux candidats dont elle remplit les critères.`
	},
	rejected: {
		en: (title: string) => `Rejected: ${title}. Its recruiter reads your reason.`,
		fr: (title: string) => `Refusée : ${title}. Son recruteur lit votre raison.`
	},
	/** Approving asks first: it reaches candidates at once */
	approveDialog: {
		title: { en: 'Approve this job description?', fr: 'Accepter cette offre ?' },
		/** `title`: the job's */
		description: {
			en: (title: string) =>
				`${title} is proposed at once to the candidates whose criteria it meets. If its recruiter edits it, it comes back here for a review.`,
			fr: (title: string) =>
				`${title} est proposée tout de suite aux candidats dont elle remplit les critères. Si son recruteur la modifie, elle revient ici pour une relecture.`
		},
		confirm: { en: 'Approve', fr: 'Accepter' },
		busy: { en: 'Approving…', fr: 'Acceptation…' }
	}
});
