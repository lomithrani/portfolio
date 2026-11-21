import { defineMessages } from 'portfolio-common';

// A mutual interest as its candidate reads it in their list (CandidateInterest.svelte): the job
// they said yes to, where it stands, and what they can do. Never a bare "match" (decision 11)
export const m = defineMessages({
	/** A mutual interest not seen before this showing */
	new: { en: 'New', fr: 'Nouveau' },
	/** A version of the job that no longer reads back (a rule made tighter since) */
	untitled: {
		en: 'A job whose version can no longer be shown',
		fr: 'Une offre dont la version ne peut plus être affichée'
	},
	/** Their score of the version they said yes to, when they said it */
	scoreThen: {
		en: (score: number, minScore: number) =>
			`Scored ${score} out of 100 against your criteria then (your minimum score: ${minScore})`,
		fr: (score: number, minScore: number) =>
			`Notée ${score} sur 100 selon vos critères à ce moment-là (votre note minimale : ${minScore})`
	},
	/** While it lasts: how a meeting is booked (no email: none is sent) */
	next: {
		en: 'To book a meeting with you, its recruiter goes through the steps of your page for recruiters.',
		fr: 'Pour réserver un rendez-vous avec vous, son recruteur passe par les étapes de votre page recruteurs.'
	},
	open: { en: 'Open the job', fr: "Voir l'offre" },
	end: { en: 'End it', fr: 'Y mettre fin' },
	/** Ending one (the list of /opportunities, the job's private page): asked first */
	endDialog: {
		title: { en: 'End this mutual interest?', fr: 'Mettre fin à cet intérêt réciproque ?' },
		/** Backed by: server/services/matches.ts endMatch (what it stored in the journey goes) */
		description: {
			en: 'Your page for recruiters will no longer hold this job for its recruiter: to book a meeting with you, they would go through its steps as anyone does. You cannot undo this.',
			fr: "Votre page recruteurs ne retiendra plus cette offre pour son recruteur : pour réserver un rendez-vous avec vous, il passerait par ses étapes comme n'importe qui. Vous ne pourrez pas revenir en arrière."
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
