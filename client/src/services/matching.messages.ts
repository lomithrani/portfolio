import { defineMessages } from 'portfolio-common';

// The texts of the decks of matching (matching.ts, MatchDeck.svelte): a candidate answers the
// jobs proposed to them, a recruiter the anonymous cards proposed for their job. Decision 11 of
// the founder: "Interested" and "Pass", never "Match" (it names the score), and a mutual interest
// is "You're both interested", never a bare "match". What a recruiter reads never counts
// candidates: no digit in `recruiter` (matching.test.ts), only whether there are more.
export const m = defineMessages({
	/** The deck's buttons */
	decision: {
		interested: { en: 'Interested', fr: "Ça m'intéresse" },
		pass: { en: 'Pass', fr: 'Passer' },
		undo: { en: 'Undo', fr: 'Annuler' }
	},
	/** Under the deck where a keyboard is likely (not on a touch screen), each key marked up */
	shortcuts: {
		en: 'Keyboard: <kbd>←</kbd> Pass, <kbd>→</kbd> Interested, <kbd>Z</kbd> Undo',
		fr: "Clavier : <kbd>←</kbd> Passer, <kbd>→</kbd> Ça m'intéresse, <kbd>Z</kbd> Annuler"
	},
	/**
	 * Over a card dragged sideways, the answer it gives once let go (the label, not read out: the
	 * buttons say it)
	 */
	dragHint: {
		interested: { en: 'Interested', fr: "Ça m'intéresse" },
		pass: { en: 'Pass', fr: 'Passer' }
	},
	/** A candidate's deck: the jobs proposed to them (a job's title is the recruiter's text) */
	candidate: {
		/** Said once the answer is saved (a polite live region) */
		passed: {
			en: (title: string) => `You passed ${title}.`,
			fr: (title: string) => `Vous avez passé votre tour sur l'offre ${title}.`
		},
		/** Its recruiter sees the candidate's interest (the discovery consent says so) */
		interested: {
			en: (title: string) => `${title} interests you: its recruiter sees it.`,
			fr: (title: string) => `L'offre ${title} vous intéresse : son recruteur le voit.`
		},
		undone: {
			en: (title: string) => `Undone: ${title} is back.`,
			fr: (title: string) => `Annulé : l'offre ${title} est de retour.`
		},
		/** A job no longer proposed to them (closed, out of matching, criteria changed): it leaves */
		gone: {
			en: 'This job is no longer proposed to you.',
			fr: 'Cette offre ne vous est plus proposée.'
		},
		loading: { en: 'Loading the jobs proposed to you…', fr: 'Chargement des offres proposées…' },
		/** Travel times are still being computed (the API's `pending`): read again in a moment */
		pending: {
			en: 'Some travel times are still being computed: more jobs may be proposed to you in a moment.',
			fr: "Certains temps de trajet sont encore en cours de calcul : d'autres offres peuvent vous être proposées dans un instant."
		},
		checkAgain: { en: 'Check again', fr: 'Vérifier de nouveau' },
		/** The same, no job proposed yet: in place of "nothing to review" */
		pendingTitle: {
			en: 'Travel times are still being computed',
			fr: 'Des temps de trajet sont encore en cours de calcul'
		},
		pendingEmpty: {
			en: 'No job is waiting for your answer yet: jobs whose travel time is still being computed may be proposed to you in a moment.',
			fr: "Aucune offre n'attend encore votre réponse : celles dont le temps de trajet est encore en cours de calcul peuvent vous être proposées dans un instant."
		},
		loadFailed: {
			en: 'Could not load the jobs proposed to you. Try again in a moment.',
			fr: 'Impossible de charger les offres qui vous sont proposées. Réessayez dans un instant.'
		}
	},
	/** A recruiter's deck: the anonymous cards proposed for their job. No digit anywhere */
	recruiter: {
		passed: {
			en: 'You passed this candidate.',
			fr: 'Vous avez passé votre tour sur ce candidat.'
		},
		/** The candidate sees the recruiter's interest beside the job (their feed's `interested`) */
		interested: {
			en: 'This candidate interests you: they see it beside your job.',
			fr: 'Ce candidat vous intéresse : il le voit à côté de votre offre.'
		},
		undone: {
			en: 'Undone: the candidate is back.',
			fr: 'Annulé : le candidat est de retour.'
		},
		/** A candidate no longer proposed for the job (withdrew, criteria changed): the card leaves */
		gone: {
			en: 'This candidate is no longer proposed for this job.',
			fr: "Ce candidat n'est plus proposé pour cette offre."
		},
		/** Whether there are more after the card shown: never how many */
		more: {
			en: 'More candidates after this one.',
			fr: "D'autres candidats après celui-ci."
		},
		last: { en: 'No other candidate for now.', fr: 'Aucun autre candidat pour le moment.' },
		loading: { en: 'Loading the next candidate…', fr: 'Chargement du candidat suivant…' },
		loadFailed: {
			en: 'Could not load the next candidate. Try again in a moment.',
			fr: 'Impossible de charger le candidat suivant. Réessayez dans un instant.'
		}
	},
	/** No card left while the answer on its way is saved (and none to read after it) */
	sending: { en: 'Sending your answer…', fr: 'Envoi de votre réponse…' },
	/**
	 * A page of matching that is not available to its reader (matching off, or a page that is not
	 * theirs: the reviewers'): the same words on every such page (the inbox, the reviewers' page, the
	 * candidates of a job), never what the page is, nor that signing in would open it
	 */
	unavailable: {
		title: { en: 'Not available', fr: 'Indisponible' },
		text: { en: 'This page is not available.', fr: "Cette page n'est pas disponible." },
		/** The way out, the same on every such page */
		home: { en: 'Go to the home page', fr: "Aller à la page d'accueil" },
		/** The browser tab's title meanwhile */
		pageTitle: { en: 'Not available | Portfolio', fr: 'Indisponible | Portfolio' }
	},
	/** Undo (Z) pressed while the answer is still on its way: said, never a key that does nothing */
	stillSending: {
		en: 'Your answer is still being sent: undo it once it is saved.',
		fr: "Votre réponse est encore en cours d'envoi : annulez-la une fois enregistrée."
	},
	/**
	 * Where a mutual interest stands (the lists of each side: mutualInterestStateText,
	 * mutualInterestChangeText, matchedOnText). Never a bare "match" (it names the score)
	 */
	mutualInterest: {
		ongoing: { en: 'Going on', fr: 'En cours' },
		ended: { en: 'Ended', fr: 'Terminé' },
		endedByYou: { en: 'You ended it', fr: 'Vous y avez mis fin' },
		endedByCandidate: { en: 'The candidate ended it', fr: 'Le candidat y a mis fin' },
		endedByRecruiter: { en: 'The recruiter ended it', fr: 'Le recruteur y a mis fin' },
		/** Filled, closed or back to draft: every mutual interest on it ends */
		jobClosed: {
			en: 'Ended: the job is no longer open',
			fr: "Terminé : l'offre n'est plus ouverte"
		},
		/** The posting was edited since (`changedAt`): each side keeps the version they were both interested in */
		changed: {
			candidate: {
				en: 'The job description was edited since: you keep the version you said yes to.',
				fr: "L'offre a été modifiée depuis : vous gardez la version à laquelle vous avez dit oui."
			},
			recruiter: {
				en: 'The job description was edited since: the candidate keeps the version they said yes to.',
				fr: "L'offre a été modifiée depuis : le candidat garde la version à laquelle il a dit oui."
			}
		},
		/** `day`: '20 Nov 2026' */
		matchedOn: {
			en: (day: string) => `Both interested on ${day}`,
			fr: (day: string) => `Intérêt réciproque le ${day}`
		}
	},
	/** Why an answer, or its undo, did not go through */
	failure: {
		retry: {
			en: 'Could not save your answer. Try again in a moment.',
			fr: "Impossible d'enregistrer votre réponse. Réessayez dans un instant."
		},
		undo: {
			en: 'Could not undo your answer. Try again in a moment.',
			fr: "Impossible d'annuler votre réponse. Réessayez dans un instant."
		},
		/** 409: over MATCHING_LIMITS.undoMinutes, another answer since, or an answer given again */
		final: {
			en: 'This answer can no longer be undone.',
			fr: 'Cette réponse ne peut plus être annulée.'
		},
		/** 404: the answer is gone already (a withdrawal, the job out of matching) */
		nothingToUndo: {
			en: 'There is no answer to undo anymore.',
			fr: "Il n'y a plus de réponse à annuler."
		},
		/** 409: a mutual interest exists already (answered elsewhere) */
		mutual: {
			en: "You're both interested already.",
			fr: 'Intérêt réciproque déjà établi.'
		},
		/**
		 * 429: the answers of a day (MATCHING_LIMITS.decisionsPerDay, a UTC day), with from when
		 * (`moment`: its Retry-After, '22 Nov 2026, 01:00', in the visitor's time zone)
		 */
		limitUntil: {
			en: (moment: string) =>
				`You have answered as many times as a day allows. You can answer again from ${moment}.`,
			fr: (moment: string) =>
				`Vous avez répondu autant de fois qu'une journée le permet. Vous pourrez répondre de nouveau à partir du ${moment}.`
		},
		/** The same without a Retry-After (never "tomorrow": the day is a UTC day) */
		limit: {
			en: 'You have answered as many times as a day allows. Try again later.',
			fr: "Vous avez répondu autant de fois qu'une journée le permet. Réessayez plus tard."
		},
		/** 429 of a read of a feed: the reads of an hour (MATCHING_FEED_READS of the API), from when */
		readLimitUntil: {
			en: (moment: string) =>
				`You have read what is proposed to you as often as an hour allows. Try again from ${moment}.`,
			fr: (moment: string) =>
				`Vous avez consulté ce qui vous est proposé aussi souvent qu'une heure le permet. Réessayez à partir du ${moment}.`
		},
		readLimit: {
			en: 'You have read what is proposed to you as often as an hour allows. Try again later.',
			fr: "Vous avez consulté ce qui vous est proposé aussi souvent qu'une heure le permet. Réessayez plus tard."
		},
		signedOut: {
			en: 'Your session has ended. Sign in again to answer.',
			fr: 'Votre session a expiré. Reconnectez-vous pour répondre.'
		},
		/** 403: the candidate is no longer proposed to recruiters (off, paused or lapsed) */
		notProposed: {
			en: 'You are not proposed to recruiters right now, so no job is proposed to you.',
			fr: "Vous n'êtes pas proposé aux recruteurs en ce moment : aucune offre ne vous est proposée."
		},
		/** 409: the recruiter's job is not proposed to candidates now (not open, out of matching, in review) */
		jobNotProposed: {
			en: 'This job is not proposed to candidates right now.',
			fr: "Cette offre n'est pas proposée aux candidats en ce moment."
		},
		/** 404: the recruiter's job description is gone (deleted) */
		jobGone: {
			en: 'This job description no longer exists.',
			fr: "Cette offre n'existe plus."
		},
		/** 422 on `consent`: the recruiter has not accepted the terms in force */
		terms: {
			en: 'Accept the terms of use in force to go on.',
			fr: "Acceptez les conditions d'utilisation en vigueur pour continuer."
		},
		noSpace: {
			en: 'Open your recruiter space to go on.',
			fr: 'Ouvrez votre espace recruteur pour continuer.'
		},
		/** A 404 that is none of the API's texts: the routes of matching are off */
		off: {
			en: 'This is not available right now.',
			fr: "Ce n'est pas disponible pour le moment."
		}
	}
});
