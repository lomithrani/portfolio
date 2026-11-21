import { defineMessages } from 'portfolio-common';

// On the private page of a job proposed to the candidate (FeedAnswer.svelte): their score of it,
// and their answer, given or changed there. Decision 11: "Interested" and "Pass" (the buttons:
// matching.messages.ts), never a bare "match"
export const m = defineMessages({
	heading: { en: 'Proposed to you', fr: 'Une offre qui vous est proposée' },
	/**
	 * Before an answer. Backed by: the discovery consent and the recruiter's feed (`interested`):
	 * the candidate's interest is what the recruiter sees
	 */
	ask: {
		en: 'Does this job interest you? If it does, its recruiter sees it; your name and your portfolio stay hidden until you are both interested.',
		fr: "Cette offre vous intéresse-t-elle ? Si oui, son recruteur le voit ; votre nom et votre portfolio restent masqués jusqu'à un intérêt réciproque."
	},
	/** The answer given (here or in the deck), which can be changed until both are interested */
	interested: {
		en: 'This job interests you: its recruiter sees it.',
		fr: 'Cette offre vous intéresse : son recruteur le voit.'
	},
	passed: { en: 'You passed this job.', fr: 'Vous avez passé votre tour sur cette offre.' },
	/** The polite live region once an answer (or its undo) was saved */
	saidInterested: {
		en: 'Saved: this job interests you.',
		fr: 'Enregistré : cette offre vous intéresse.'
	},
	saidPass: {
		en: 'Saved: you passed this job.',
		fr: 'Enregistré : vous avez passé votre tour sur cette offre.'
	},
	undone: { en: 'Your answer was undone.', fr: 'Votre réponse a été annulée.' },
	/** A request on its way */
	sending: { en: 'Sending your answer…', fr: 'Envoi de votre réponse…' }
});
