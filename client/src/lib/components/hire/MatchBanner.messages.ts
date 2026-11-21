import { defineMessages } from 'portfolio-common';

// The banner of the Hire page for the recruiter of a mutual interest (MatchBanner.svelte): the
// owner and they are both interested in one of their jobs (matching), which leads into the owner's
// journey. Its heading is "You're both interested" (cards.messages.ts), never a bare "match", which
// names the score (decision 11 of the founder); no email is promised (decision 10: in-app only).
// What is left of the journey is workflow.messages.ts's (`match`), read with the journey.
export const m = defineMessages({
	/**
	 * Where the values go, each rendered by its own snippet (what a person typed never goes through
	 * the tag parser): `<owner></owner>` the portfolio's name; `<job></job>` "Senior Engineer · Acme",
	 * the version the owner said yes to; `<time></time>` '20 Nov 2026'. Backed by:
	 * server/services/workflows.ts (`match`: the job of the mutual interest and when it was made)
	 */
	together: {
		en: 'You and <owner></owner> are both interested in <job></job> (since <time></time>).',
		fr: "Depuis le <time></time>, l'intérêt est réciproque entre <owner></owner> et vous pour <job></job>."
	},
	/**
	 * The journey's job step holds that job now (succeeded: open, the terms in force accepted; while
	 * it does not, what brings it back is said instead: workflow.messages.ts `match`). Backed by:
	 * server/services/workflowSteps/job.ts (`matched`, 409 JOB_OF_MUTUAL_INTEREST for another job)
	 */
	holds: {
		en: 'This page holds that job for you: you cannot share another here while your mutual interest lasts.',
		fr: "Cette page retient cette offre pour vous : vous ne pouvez pas en partager une autre ici tant que l'intérêt réciproque dure."
	},
	/**
	 * The journey has no job step (the owner took it out since, or keeps the meeting alone). Backed
	 * by: server/services/workflows.ts (openStepOfType adds the mutual interest's lines to the
	 * invitation when no job step before the meeting names its job)
	 */
	inInvitation: {
		en: 'The meeting invitation names that job.',
		fr: "L'invitation au rendez-vous mentionne cette offre."
	},
	/** The posting was edited since (`changed`): the owner keeps the version they said yes to */
	changed: {
		en: (ownerName: string) =>
			`The job description was edited since: ${ownerName} keeps the version they said yes to.`,
		fr: (ownerName: string) =>
			`L'offre a été modifiée depuis : ${ownerName} garde la version sur laquelle porte l'intérêt réciproque.`
	},
	end: { en: 'End it', fr: 'Y mettre fin' },
	/**
	 * Ending it was refused for the terms of use in force (POST /matches/:id/end is a recruiter
	 * route: 422 on `consent`), which TermsAcceptance follows. Backed by: server/services/matches.ts
	 * (ownMatch: requireRecruiterSpace for the recruiter's side)
	 */
	endTerms: {
		en: 'To end it, accept the terms of use in force first.',
		fr: "Pour y mettre fin, acceptez d'abord les conditions d'utilisation en vigueur."
	},
	/** Ending it: asked first (the dialog's title, confirm, busy and failure texts are the list's) */
	endDialog: {
		/** Backed by: server/services/matches.ts endMatch (what it stored in the journey goes: dropHandOffs) */
		description: {
			en: 'This page will no longer hold your job for you: to book a meeting, you would go through its steps as anyone does. You cannot undo this.',
			fr: "Cette page ne retiendra plus votre offre pour vous : pour réserver un rendez-vous, vous passeriez par ses étapes comme n'importe qui. Vous ne pourrez pas revenir en arrière."
		},
		/**
		 * The meeting step succeeded: the meeting is booked. Backed by: server/services/matches.ts
		 * endMatch (dropHandOffs removes only what the mutual interest stored: the Calendar event and
		 * the booking stay), server/services/bookedMeetings.ts (the dashboard lists the meetings the
		 * account booked signed in)
		 */
		booked: {
			en: "The meeting already booked stays booked: it is listed on your recruiter space's dashboard.",
			fr: 'Le rendez-vous déjà réservé est maintenu : il figure sur le tableau de bord de votre espace recruteur.'
		}
	}
});
