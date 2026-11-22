import { defineMessages } from 'portfolio-common';

// The matching panel of a recruiter's job description (MatchingPanel.svelte): proposing it to the
// candidates whose criteria it meets (Path 2), where it stands with the reviewers, whether
// candidates wait for an answer (never how many), and its mutual interests. Decision 11 of the
// founder: "Interested" and "Pass", "You're both interested", never a bare "match".
export const m = defineMessages({
	title: { en: 'Propose to candidates', fr: 'Proposer aux candidats' },
	/**
	 * What proposing a job does. Backed by: server/services/matchFeeds.ts (the job scored against
	 * each candidate's own criteria, their minimum and deal-breakers), candidateCard.ts (the card),
	 * matches.ts (the portfolio revealed once both are interested)
	 */
	intro: {
		en: 'Candidates whose own criteria this job meets see it, and you see their anonymous cards. Their portfolio is shown to you once you are both interested.',
		fr: "Les candidats dont cette offre remplit les critères la voient, et vous voyez leur fiche anonyme. Leur portfolio vous est ouvert en cas d'intérêt réciproque."
	},
	/** The switch */
	switchLabel: { en: 'Propose this job to candidates', fr: 'Proposer cette offre aux candidats' },
	/** Under the switch, off, for a job that is not open (only an open job can be proposed) */
	openFirst: {
		en: 'Open this job description to propose it.',
		fr: 'Ouvrez cette offre pour la proposer.'
	},
	/** Under the switch, off, for an open job: what turning it on does first */
	reviewFirst: {
		en: 'A reviewer reads it before any candidate sees it.',
		fr: "Elle est relue avant qu'un candidat ne la voie."
	},
	/** Where it stands, on (a badge, then what it means) */
	state: {
		pending: {
			badge: { en: 'In review', fr: 'En relecture' },
			text: {
				en: 'A reviewer reads every job description before any candidate sees it. Until then it is proposed to nobody.',
				fr: "Chaque offre est relue avant qu'un candidat ne la voie. D'ici là, elle n'est proposée à personne."
			}
		},
		rejected: {
			badge: { en: 'Not accepted', fr: 'Pas acceptée' },
			/** The reviewer's reason follows, as they wrote it (not translated) */
			text: {
				en: 'A reviewer did not accept it for candidates. Their reason:',
				fr: "Elle n'a pas été acceptée à la relecture. La raison donnée :"
			},
			/**
			 * Backed by: server/services/matchingReviews.ts reviewSavedWithEdit (an edit sends it back
			 * for review), common/models/jobTerms.ts LOCKED_JOB_FIELDS (an opened job's terms are locked)
			 */
			next: {
				en: 'You can edit what is not locked, such as the description: once saved, it goes back for review. If the reason is about its terms, which are locked, stop proposing it, or duplicate it to change them.',
				fr: "Vous pouvez modifier ce qui n'est pas verrouillé, comme la description : une fois enregistrée, elle repart en relecture. Si la raison porte sur ses conditions, qui sont verrouillées, arrêtez de la proposer, ou dupliquez-la pour les changer."
			},
			/** Backed by: server/services/jobMatching.ts jobsInMatching (counted while the switch is on) */
			place: {
				en: 'While it stays on, it counts among the job descriptions you can propose at once: turning it off frees its place.',
				fr: "Tant qu'elle reste activée, elle compte parmi les offres que vous pouvez proposer à la fois : la désactiver libère sa place."
			}
		},
		live: {
			badge: { en: 'Proposed to candidates', fr: 'Proposée aux candidats' },
			text: {
				en: 'Candidates whose criteria it meets see it now.',
				fr: 'Les candidats dont elle remplit les critères la voient maintenant.'
			}
		},
		paused: {
			badge: { en: 'On hold', fr: 'En pause' },
			text: {
				en: 'It is proposed to nobody while it is on hold. Open it again to propose it.',
				fr: "Elle n'est proposée à personne tant qu'elle est en pause. Rouvrez-la pour la proposer."
			}
		},
		/**
		 * Open, on and accepted, but the API proposes it to nobody (its feed's 409 JOB_NOT_PROPOSED).
		 * Backed by: server/services/jobMatching.ts versionReadsBack (saved under rules made tighter
		 * since: a pay range wider than the cap)
		 */
		stale: {
			badge: { en: 'Not proposed right now', fr: 'Pas proposée en ce moment' },
			text: {
				en: 'It is proposed to nobody right now: it was saved under rules that have changed since. Save it again in the editor to propose it: it then goes back for review.',
				fr: "Elle n'est proposée à personne en ce moment : elle a été enregistrée selon des règles qui ont changé depuis. Enregistrez-la de nouveau dans l'éditeur pour la proposer : elle repart alors en relecture."
			}
		}
	},
	/** Whether candidates wait for an answer (a read of the feed): never how many */
	candidates: {
		some: { en: 'Candidates to review', fr: 'Des candidats à examiner' },
		none: {
			en: 'No candidate to review right now.',
			fr: 'Aucun candidat à examiner pour le moment.'
		},
		review: { en: 'Review candidates', fr: 'Examiner les candidats' }
	},
	/** The toasts once the switch went through, from what the API answered */
	turnedOn: {
		en: 'Sent for review: a reviewer reads it before candidates do',
		fr: "Envoyée en relecture : elle est relue avant qu'un candidat ne la voie"
	},
	/** Turned on again, unchanged since a reviewer accepted it */
	turnedOnLive: { en: 'Proposed to candidates', fr: 'Proposée aux candidats' },
	/**
	 * Turned on again, unchanged since a reviewer did not accept it. Backed by:
	 * server/services/jobMatching.ts reviewOnEntry (an unchanged job keeps its review)
	 */
	turnedOnRejected: {
		en: 'Turned on again, still not accepted: edit it to send it back for review',
		fr: 'Réactivée, toujours pas acceptée : modifiez-la pour la renvoyer en relecture'
	},
	turnedOff: { en: 'No longer proposed to candidates', fr: "N'est plus proposée aux candidats" },
	/** Turning it off: asked first */
	stopDialog: {
		title: { en: 'Stop proposing this job?', fr: 'Ne plus proposer cette offre ?' },
		/**
		 * Backed by: server/services/jobMatching.ts afterMatchingOff (every interest no mutual interest
		 * came of goes, the passes stay; mutual interests go on) and reviewOnEntry (turned on again, it
		 * keeps its review only when unchanged)
		 */
		description: {
			en: "It leaves every candidate's list at once. The interests that made no mutual interest are dropped, yours and candidates'; your mutual interests on it go on. Proposed again after a change, it is read again first.",
			fr: "Elle disparaît aussitôt de la liste de chaque candidat. Les intérêts sans réciprocité sont effacés, les vôtres comme ceux des candidats ; vos intérêts réciproques sur cette offre continuent. Proposée de nouveau après une modification, elle est d'abord relue."
		},
		confirm: { en: 'Stop proposing', fr: 'Ne plus la proposer' },
		busy: { en: 'Stopping…', fr: 'Arrêt en cours…' }
	},
	/** The way to fix a refusal */
	edit: { en: 'Edit the job description', fr: "Modifier l'offre" },
	/** A job not accepted for a locked term: a copy changes it (/recruiter/jobs/new?duplicate=) */
	duplicate: { en: 'Duplicate', fr: 'Dupliquer' },
	reload: { en: 'Reload', fr: 'Recharger' }
});
