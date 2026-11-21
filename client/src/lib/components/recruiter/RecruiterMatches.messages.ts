import { defineMessages } from 'portfolio-common';

// The recruiter's mutual interests (RecruiterMatches.svelte, RecruiterInterest.svelte): on the
// dashboard, and one job's in its matching panel. A mutual interest is "You're both interested",
// never a bare "match" (decision 11 of the founder); the candidate's portfolio once revealed (its
// address and title, never a name or an email address); no count but the account's own list, and
// no email promised (decision 10: in-app only).
export const m = defineMessages({
	/** The dashboard's section */
	title: { en: 'Mutual interests', fr: 'Intérêts réciproques' },
	/** Backed by: server/services/matches.ts (the portfolio revealed), workflows.ts (the journey holds the job) */
	intro: {
		en: 'Candidates who are interested in your job as you are in them: their portfolio is shown to you, and their page for recruiters holds your job while it is open.',
		fr: "Les candidats qui s'intéressent à votre offre comme vous vous intéressez à eux : leur portfolio vous est ouvert, et leur page recruteurs reprend votre offre tant qu'elle est ouverte."
	},
	/** One job's, in its matching panel */
	jobTitle: { en: 'Mutual interests on this job', fr: 'Intérêts réciproques sur cette offre' },
	empty: {
		en: 'No mutual interest yet. Propose an open job description to candidates from its page: the candidates you are both interested in show here.',
		fr: "Pas encore d'intérêt réciproque. Proposez une offre ouverte aux candidats depuis sa page : les candidats avec qui l'intérêt est réciproque s'affichent ici."
	},
	jobEmpty: {
		en: 'No mutual interest on this job yet.',
		fr: "Pas encore d'intérêt réciproque sur cette offre."
	},
	loading: { en: 'Loading your mutual interests…', fr: 'Chargement de vos intérêts réciproques…' },
	loadFailed: {
		en: 'Could not load your mutual interests. Try again in a moment.',
		fr: 'Impossible de charger vos intérêts réciproques. Réessayez dans un instant.'
	},
	more: { en: 'Show more', fr: 'Afficher la suite' },
	/** One mutual interest */
	item: {
		/** Not seen before this showing */
		new: { en: 'New', fr: 'Nouveau' },
		/** The portfolio is not revealed (or gone): nothing to name */
		notRevealed: { en: 'Portfolio not available', fr: 'Portfolio indisponible' },
		/** While it lasts, revealed: how a meeting is booked (no email is sent) */
		next: {
			en: 'To book a meeting, go through the steps of their page for recruiters: it holds your job.',
			fr: 'Pour réserver un rendez-vous, passez par les étapes de sa page recruteurs : elle reprend votre offre.'
		},
		/**
		 * While it lasts, revealed, its job on hold. Backed by: server/services/workflowSteps/job.ts
		 * matchedJob (the step holds the job while it is open; no other job while it lasts)
		 */
		onHold: {
			en: 'Your job is on hold: their page for recruiters holds it again once you open it again, and a meeting is booked from there.',
			fr: 'Votre offre est en pause : sa page recruteurs la reprend dès que vous la rouvrez, et un rendez-vous se réserve de là.'
		},
		pageForRecruiters: { en: 'Go to their page for recruiters', fr: 'Aller à sa page recruteurs' },
		portfolio: { en: 'See their portfolio', fr: 'Voir son portfolio' },
		/** A link that opens in a new tab, for screen readers */
		newTab: { en: '(opens in a new tab)', fr: '(ouvre un nouvel onglet)' },
		end: { en: 'End it', fr: 'Y mettre fin' }
	},
	/** Ending one: asked first */
	endDialog: {
		title: { en: 'End this mutual interest?', fr: 'Mettre fin à cet intérêt réciproque ?' },
		/** Backed by: server/services/matches.ts endMatch (what it stored in the journey goes: dropHandOffs) */
		description: {
			en: "The candidate's page for recruiters will no longer hold your job for you: to book a meeting, you would go through its steps as anyone does. You cannot undo this.",
			fr: "La page recruteurs du candidat ne retiendra plus votre offre pour vous : pour réserver un rendez-vous, vous passeriez par ses étapes comme n'importe qui. Vous ne pourrez pas revenir en arrière."
		},
		confirm: { en: 'End it', fr: 'Y mettre fin' },
		busy: { en: 'Ending…', fr: 'Fin en cours…' },
		done: { en: 'Mutual interest ended', fr: 'Intérêt réciproque terminé' },
		failed: {
			en: 'Could not end it. Try again in a moment.',
			fr: "Impossible d'y mettre fin. Réessayez dans un instant."
		},
		gone: {
			en: 'This mutual interest is no longer there.',
			fr: "Cet intérêt réciproque n'existe plus."
		}
	}
});
