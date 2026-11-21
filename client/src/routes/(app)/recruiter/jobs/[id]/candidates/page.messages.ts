import { defineMessages } from 'portfolio-common';

// The candidates proposed for a recruiter's job (matching, Path 2): their anonymous cards, one at a
// time, answered Interested or Pass. Never a count (whether more come, never how many), never a
// name, a place, a commute or a score; never a bare "match" (decision 11 of the founder); no email
// promised (decision 10: the account menu's badge is all there is).
export const m = defineMessages({
	/** `title`: the job's */
	pageTitle: {
		en: (title: string) => `Candidates: ${title} | Recruiter`,
		fr: (title: string) => `Candidats : ${title} | Recruteur`
	},
	/** In the page title until the posting is loaded */
	jobDescription: { en: 'Job description', fr: "Offre d'emploi" },
	/** The link back to the job */
	backToJob: { en: 'Back to the job description', fr: "Retour à l'offre" },
	heading: { en: 'Candidates to review', fr: 'Candidats à examiner' },
	/**
	 * Backed by: server/services/matchFeeds.ts (one card at a time, the candidates whose criteria
	 * the job meets), candidateCard.ts (the anonymous card), matches.ts (revealed once both are
	 * interested)
	 */
	intro: {
		en: 'The anonymous cards of the candidates whose own criteria this job meets, one at a time. Their portfolio is shown to you once you are both interested.',
		fr: "Les fiches anonymes des candidats dont cette offre remplit les critères, une à la fois. Leur portfolio vous est ouvert en cas d'intérêt réciproque."
	},
	/** The deck's accessible name */
	deck: { en: 'Candidates to review', fr: 'Candidats à examiner' },
	/** Nothing to answer now (the feed gave no card) */
	empty: {
		title: {
			en: 'No candidate to review right now',
			fr: 'Aucun candidat à examiner pour le moment'
		},
		/** Backed by: server/services/matchFeeds.ts (proposed when read), notifications (in-app badge only) */
		text: {
			en: 'Candidates are proposed here when they make themselves visible to recruiters, or when their criteria change and this job comes to meet them. When a candidate you are interested in says your job interests them too, your account menu shows it.',
			fr: "Les candidats sont proposés ici quand ils se rendent visibles des recruteurs, ou quand leurs critères changent et que cette offre vient à les remplir. Quand un candidat qui vous intéresse dit que votre offre l'intéresse aussi, le menu de votre compte l'indique."
		}
	},
	/** The job is not proposed to candidates now: why, from its `matching` */
	notProposed: {
		title: {
			en: 'This job is not proposed to candidates right now',
			fr: "Cette offre n'est pas proposée aux candidats en ce moment"
		},
		off: {
			en: 'Propose it to candidates from its page: a reviewer reads it first.',
			fr: "Proposez-la aux candidats depuis sa page : elle est d'abord relue."
		},
		notOpen: {
			en: 'Only an open job description can be proposed to candidates. Open it from its page first.',
			fr: "Seule une offre ouverte peut être proposée aux candidats. Ouvrez-la d'abord depuis sa page."
		},
		pending: {
			en: 'A reviewer reads every job description before any candidate sees it. Its candidates show here once it is accepted.',
			fr: "Chaque offre est relue avant qu'un candidat ne la voie. Ses candidats s'affichent ici une fois qu'elle est acceptée."
		},
		/** The reviewer's reason follows, as they wrote it (not translated) */
		rejected: {
			en: 'A reviewer did not accept it for candidates. Their reason:',
			fr: "Elle n'a pas été acceptée à la relecture. La raison donnée :"
		},
		paused: {
			en: 'It is on hold: open it again to propose it to candidates.',
			fr: 'Elle est en pause : rouvrez-la pour la proposer aux candidats.'
		},
		/**
		 * Open, on and accepted, yet the API proposes it to nobody (409 JOB_NOT_PROPOSED, the posting
		 * read again still reading as proposed). Backed by: server/services/jobMatching.ts
		 * versionReadsBack (saved under rules made tighter since)
		 */
		stale: {
			en: 'It was saved under rules that have changed since: save it again in the editor to propose it. It then goes back for review.',
			fr: "Elle a été enregistrée selon des règles qui ont changé depuis : enregistrez-la de nouveau dans l'éditeur pour la proposer. Elle repart alors en relecture."
		},
		/** The way out of `stale` */
		edit: { en: 'Edit the job description', fr: "Modifier l'offre" }
	},
	/** The deck stopped (its failure says why) */
	stopped: { en: 'The candidates cannot be shown', fr: "Les candidats ne peuvent pas s'afficher" }
});
