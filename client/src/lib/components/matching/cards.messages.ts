import { defineMessages } from 'portfolio-common';

// The texts of the cards of matching: the anonymous card a recruiter reads of a candidate
// (CandidateCard.svelte), a job proposed to a candidate (OpportunityCard.svelte) and the moment
// both are interested (MutualInterestPanel.svelte). Decision 11 of the founder: "You're both
// interested", never a bare "match" (it names the score). The candidate never reads anything of
// who the recruiter is before that moment (decision 17), the recruiter never a name, a place, a
// score or a count.
export const m = defineMessages({
	candidate: {
		/** The heading of a card without a headline */
		anonymous: { en: 'Anonymous candidate', fr: 'Candidat anonyme' },
		/**
		 * After it, for screen readers only: the latest role (`title`), which tells one card from the
		 * next as the deck moves the focus to its heading
		 */
		latestRole: {
			en: (title: string) => `(${title})`,
			fr: (title: string) => `(${title})`
		},
		/** `duration`: '6 years 3 months' (formatMonthCount) */
		experience: {
			en: (duration: string) => `${duration} of professional experience`,
			fr: (duration: string) => `${duration} d'expérience professionnelle`
		},
		/** No professional role at all (roles without dates leave the total unsaid instead) */
		noExperience: {
			en: 'No professional experience listed',
			fr: 'Aucune expérience professionnelle indiquée'
		},
		roles: { en: 'Roles', fr: 'Postes' },
		/** A role held now */
		current: { en: 'Now', fr: 'En poste' },
		/** A role without dates: no time to show */
		noDates: { en: 'No dates', fr: 'Sans dates' },
		/** A role of less than a month so far */
		underAMonth: { en: 'Less than a month', fr: "Moins d'un mois" },
		skills: { en: 'Skills used in projects', fr: 'Compétences utilisées en projet' },
		/** A skill and the time it was used: 'Kafka, 3 years 4 months' (said, not shown) */
		skillTime: {
			en: (name: string, duration: string) => `${name}, ${duration}`,
			fr: (name: string, duration: string) => `${name}, ${duration}`
		},
		/** The candidate said they are interested in the recruiter's job (the consent says so) */
		interested: { en: 'Interested in your job', fr: "Votre offre l'intéresse" },
		/** Every card shown meets this: the job reaches the candidate's minimum, no deal-breaker missed */
		reaches: {
			en: "Your job reaches this candidate's minimum score.",
			fr: 'Votre offre atteint la note minimale de ce candidat.'
		},
		outcomes: {
			en: "How your job does on this candidate's criteria",
			fr: 'Votre offre face aux critères de ce candidat'
		},
		/** Their journey's job match does not show details: no outcome beside the card */
		noOutcomes: {
			en: 'This candidate does not share how your job does on each of their criteria.',
			fr: 'Ce candidat ne partage pas le résultat de votre offre pour chacun de ses critères.'
		},
		anonymity: {
			en: 'Anonymous until you are both interested: you then see their portfolio.',
			fr: "Anonyme jusqu'à un intérêt réciproque : vous voyez alors son portfolio."
		}
	},
	opportunity: {
		/** The day it was opened (a dated job description, article L5332-1 of the Labour Code) */
		opened: {
			en: (day: string) => `Opened <time>${day}</time>`,
			fr: (day: string) => `Ouverte le <time>${day}</time>`
		},
		/** Before and after the score, for screen readers: "Score: 82 out of 100" */
		score: { en: 'Score:', fr: 'Note :' },
		outOf100: { en: 'out of 100', fr: 'sur 100' },
		scoredAgainst: {
			en: 'Scored against your criteria',
			fr: 'Notée selon vos critères'
		},
		minimum: {
			en: (minScore: number) => `Your minimum score: ${minScore}`,
			fr: (minScore: number) => `Votre note minimale : ${minScore}`
		},
		/** Its recruiter said the candidate interests them (their answer, never who they are) */
		interested: {
			en: 'Its recruiter is interested in you',
			fr: "Son recruteur s'intéresse à vous"
		},
		outcomes: { en: 'How it does on your criteria', fr: 'Cette offre face à vos critères' },
		description: { en: 'Read the description', fr: 'Lire la description' },
		noDescription: { en: 'No description.', fr: 'Pas de description.' },
		open: { en: 'Open the job', fr: "Voir l'offre" }
	},
	mutual: {
		heading: { en: "You're both interested", fr: 'Intérêt réciproque' },
		/**
		 * To the candidate: what happens next (no email is promised: none is sent). Nothing of whether
		 * the portfolio is shown yet (their answer does not say it): how a meeting is booked
		 */
		candidate: {
			en: (title: string) =>
				`The recruiter of ${title} is interested in you too. To book a meeting with you, they go through the steps of your page for recruiters.`,
			fr: (title: string) =>
				`Le recruteur de l'offre ${title} s'intéresse aussi à vous. Pour réserver un rendez-vous avec vous, il passe par les étapes de votre page recruteurs.`
		},
		/** The same, for a version of the job that no longer reads back (no title to name) */
		candidateUntitled: {
			en: 'The recruiter of this job is interested in you too. To book a meeting with you, they go through the steps of your page for recruiters.',
			fr: "Le recruteur de cette offre s'intéresse aussi à vous. Pour réserver un rendez-vous avec vous, il passe par les étapes de votre page recruteurs."
		},
		/** To the recruiter, the portfolio revealed: their page for recruiters holds the job */
		recruiter: {
			en: (title: string) =>
				`This candidate is interested in ${title} too. Their portfolio is now shown to you: go through the steps of their page for recruiters, which holds your job, to book a meeting.`,
			fr: (title: string) =>
				`Ce candidat s'intéresse aussi à l'offre ${title}. Son portfolio vous est maintenant ouvert : passez par les étapes de sa page recruteurs, qui retient votre offre, pour réserver un rendez-vous.`
		},
		/** The mutual interest leads nowhere yet (its portfolio is not revealed, or gone) */
		notRevealed: {
			en: (title: string) =>
				`This candidate is interested in ${title} too, but their portfolio is not available right now.`,
			fr: (title: string) =>
				`Ce candidat s'intéresse aussi à l'offre ${title}, mais son portfolio n'est pas disponible pour le moment.`
		},
		portfolio: { en: 'See their portfolio', fr: 'Voir son portfolio' },
		pageForRecruiters: { en: 'Go to their page for recruiters', fr: 'Aller à sa page recruteurs' },
		openJob: { en: 'Open the job', fr: "Voir l'offre" },
		keepGoing: { en: 'Keep going', fr: 'Continuer' },
		/** A link that opens in a new tab, for screen readers */
		newTab: { en: '(opens in a new tab)', fr: '(ouvre un nouvel onglet)' }
	}
});
