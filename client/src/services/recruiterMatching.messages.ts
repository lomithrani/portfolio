import { defineMessages, plural } from 'portfolio-common';

// The texts built by recruiterMatching.ts: where a recruiter's job stands in matching (Path 2:
// proposed to the candidates whose criteria it meets, once a reviewer read it), why turning it on
// or off failed, and why their mutual interests could not be read. What a recruiter reads never
// counts candidates (no digit but the jobs they may propose at once: their own limit), never names
// a reviewer, and never calls a mutual interest a bare "match" (decision 11 of the founder).
export const m = defineMessages({
	/**
	 * A job's line on the dashboard (no count: where it stands with the reviewers, read from the
	 * posting alone). `live` says accepted, not proposed: the dashboard cannot read each job's feed,
	 * and a job accepted but saved under rules made tighter since is proposed to nobody, which only
	 * its own page (the matching panel, from the feed) can tell
	 */
	label: {
		live: { en: 'Accepted for candidates', fr: 'Acceptée pour les candidats' },
		pending: { en: 'In review for candidates', fr: 'En relecture pour les candidats' },
		rejected: { en: 'Not accepted for candidates', fr: 'Pas acceptée pour les candidats' },
		/** On hold: proposed to nobody until it is open again */
		paused: { en: 'Not proposed while on hold', fr: "Pas proposée tant qu'elle est en pause" }
	},
	/** Why PUT /jobs/:id/matching did not go through */
	switchFailure: {
		/** 409: put on hold, filled or back to draft meanwhile */
		notOpen: {
			en: 'Only an open job description can be proposed to candidates: open it first.',
			fr: "Seule une offre ouverte peut être proposée aux candidats : ouvrez-la d'abord."
		},
		/** 422 on `company`: candidates decide before they know who the recruiter is */
		company: {
			en: 'Name the company first: candidates say whether they are interested before they know which recruiter you are. Edit the job description to add it.',
			fr: "Indiquez d'abord l'entreprise : les candidats disent s'ils sont intéressés avant de savoir quel recruteur vous êtes. Modifiez l'offre pour l'ajouter."
		},
		description: {
			en: 'Describe the job first: candidates read the description before they say whether they are interested. Edit the job description to add it.',
			fr: "Décrivez d'abord le poste : les candidats lisent l'offre avant de dire s'ils sont intéressés. Modifiez l'offre pour l'ajouter."
		},
		/** 422 on another field: saved under rules that changed since (a pay range wider than the cap) */
		saveAgain: {
			en: 'Save this job description again in the editor before you propose it: it was saved under rules that have changed since.',
			fr: "Enregistrez de nouveau cette offre dans l'éditeur avant de la proposer : elle a été enregistrée selon des règles qui ont changé depuis."
		},
		/** 409: `max` is MATCHING_LIMITS.matchingJobsPerRecruiter (the recruiter's own jobs) */
		limit: {
			en: (max: number) =>
				`You can propose ${max} ${plural(max, 'job description', 'job descriptions')} to candidates at once: stop proposing one to propose this one.`,
			fr: (max: number) =>
				`Vous pouvez proposer ${max} ${plural(max, 'offre', 'offres')} aux candidats à la fois : arrêtez d'en proposer une pour proposer celle-ci.`
		},
		/** 409: edited, or its status changed, while it was put in */
		changed: {
			en: 'This job description changed meanwhile. Reload it, then try again.',
			fr: 'Cette offre a changé entre-temps. Rechargez-la, puis réessayez.'
		},
		signedOut: {
			en: 'Your session has ended. Sign in again to go on.',
			fr: 'Votre session a expiré. Reconnectez-vous pour continuer.'
		},
		noSpace: {
			en: 'Open your recruiter space to go on.',
			fr: 'Ouvrez votre espace recruteur pour continuer.'
		},
		terms: {
			en: 'Accept the terms of use in force to go on.',
			fr: "Acceptez les conditions d'utilisation en vigueur pour continuer."
		},
		gone: {
			en: 'This job description no longer exists.',
			fr: "Cette offre n'existe plus."
		},
		/** A 404 that is none of the API's texts: matching was turned off */
		off: {
			en: 'Proposing jobs to candidates is not available right now.',
			fr: "Proposer des offres aux candidats n'est pas disponible pour le moment."
		},
		retry: {
			en: 'Could not save this change. Try again in a moment.',
			fr: "Impossible d'enregistrer ce changement. Réessayez dans un instant."
		}
	},
	/**
	 * What a job that was put into matching loses once filled, closed or back to draft (its page's
	 * status, its editor's, both asked or said first). Backed by: server/services/jobMatching.ts
	 * afterJobStatusChange (out of matching, its pending answers dropped, its mutual interests ended,
	 * whatever the switch says: mutual interests go on once it is turned off)
	 */
	leaving: {
		/** Proposed to candidates now (the switch on) */
		proposed: {
			en: 'Filled, closed or back to draft, it stops being proposed: the answers that made no mutual interest are dropped, and its mutual interests end.',
			fr: "Pourvue, fermée ou repassée en brouillon, elle n'est plus proposée : les réponses sans intérêt réciproque sont effacées, et ses intérêts réciproques prennent fin."
		},
		/** Put into matching before, not proposed now (its mutual interests go on) */
		before: {
			en: 'Filled, closed or back to draft, its mutual interests with candidates end, if it has any.',
			fr: "Pourvue, fermée ou repassée en brouillon, ses intérêts réciproques avec des candidats prennent fin, s'il y en a."
		},
		/** Opened again later: what ended stays ended */
		final: {
			en: 'Opening it again does not bring them back.',
			fr: 'La rouvrir ne les fait pas revenir.'
		}
	},
	/** Its page's status set to filled, closed or draft, for a job put into matching: asked first */
	statusDialog: {
		/** `status`: the label of the status chosen */
		title: {
			en: (status: string) => `Change the status to “${status}”?`,
			fr: (status: string) => `Passer le statut à « ${status} » ?`
		},
		confirm: { en: 'Change the status', fr: 'Changer le statut' }
	},
	/** Deleting a job put into matching: added to the dialog. Backed by: jobMatching.ts afterJobDeleted */
	deleteDetails: {
		en: 'Its mutual interests with candidates, and the answers given on it, are deleted with it.',
		fr: 'Ses intérêts réciproques avec des candidats, et les réponses données à son sujet, sont supprimés avec elle.'
	},
	/**
	 * The job editor, for a job created open with "Propose it to candidates" ticked: what it asks
	 * first (portfolio-common's matchingJobProblem, the API's rule), with the other way out
	 */
	formErrors: {
		company: {
			en: 'Name the company: candidates decide whether they are interested before they know which recruiter you are. Or untick “Propose it to candidates”.',
			fr: "Indiquez l'entreprise : les candidats disent s'ils sont intéressés avant de savoir quel recruteur vous êtes. Ou décochez « La proposer aux candidats »."
		},
		description: {
			en: 'Describe the job: candidates read it before they say whether they are interested. Or untick “Propose it to candidates”.',
			fr: "Décrivez le poste : les candidats lisent l'offre avant de dire s'ils sont intéressés. Ou décochez « La proposer aux candidats »."
		}
	}
});
