import { defineMessages } from 'portfolio-common';

// A mutual interest on the private page of its job (SharedInterest.svelte), beside the texts it
// shares with the candidate's list (CandidateInterest.messages.ts). Never a bare "match" (decision 11)
export const m = defineMessages({
	/**
	 * Its heading once it ended (by either side, or its job no longer open: the state under it says
	 * which); going on, it is "You're both interested" (cards.messages.ts)
	 */
	endedHeading: { en: 'Mutual interest ended', fr: 'Intérêt réciproque terminé' }
});
