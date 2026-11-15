// Texts of the public job pages (/jobs, /jobs/[id]) and of applying, built by `applications.ts`.
import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	// --- Public pages -----------------------------------------------------------------------

	/** The error of a page whose posting is a draft or unknown (404) */
	jobNotFound: { en: 'Job posting not found', fr: "Offre d'emploi introuvable" },
	/** The error of the job pages when the API failed or could not be reached (503) */
	jobsUnavailable: {
		en: 'The job board is temporarily unavailable. Please retry shortly.',
		fr: "Les offres d'emploi sont momentanément indisponibles. Réessayez dans un instant."
	},
	noOpenPositions: { en: 'No open positions', fr: 'Aucune offre ouverte' },
	/** '1 open position', '12 open positions' */
	openPositions: {
		en: (count: number) => `${count} open ${plural(count, 'position', 'positions')}`,
		fr: (count: number) => `${count} ${plural(count, 'offre ouverte', 'offres ouvertes')}`
	},
	/** 'Published 3 Nov 2026' */
	published: {
		en: (day: string) => `Published ${day}`,
		fr: (day: string) => `Publiée le ${day}`
	},
	/** The page title of a posting without a title */
	untitled: { en: 'Job posting', fr: "Offre d'emploi" },
	/** The page title of a posting: 'Backend engineer at Acme' */
	titleAtCompany: {
		en: (title: string, company: string) => `${title} at ${company}`,
		fr: (title: string, company: string) => `${title} chez ${company}`
	},
	/** The description, for search results and link previews, of a posting that says nothing */
	shareFallback: {
		en: 'A job description: apply with your portfolio.',
		fr: "Une offre d'emploi : postulez avec votre portfolio."
	},

	// --- Applying ---------------------------------------------------------------------------

	/** Why a posting takes no applications, by status */
	closed: {
		on_hold: {
			title: { en: 'On hold', fr: 'En pause' },
			text: {
				en: 'This position is not taking applications for now. Check back later.',
				fr: "Cette offre n'accepte pas de candidatures pour le moment. Revenez plus tard."
			}
		},
		filled: {
			title: { en: 'Position filled', fr: 'Offre pourvue' },
			text: {
				en: 'This position has been filled: it is not taking applications any more.',
				fr: "Cette offre a été pourvue : elle n'accepte plus de candidatures."
			}
		},
		closed: {
			title: { en: 'Position closed', fr: 'Offre fermée' },
			text: {
				en: 'This position is closed: it is not taking applications any more.',
				fr: "Cette offre est fermée : elle n'accepte plus de candidatures."
			}
		},
		other: {
			title: { en: 'Not open', fr: 'Non ouverte' },
			text: {
				en: 'This position is not taking applications.',
				fr: "Cette offre n'accepte pas de candidatures."
			}
		}
	},
	/** How the viewer got on the applicant list, and when (the panel ends it with a full stop) */
	summary: {
		applied: { en: 'You applied', fr: 'Vous avez postulé' },
		appliedOn: {
			en: (day: string) => `You applied on ${day}`,
			fr: (day: string) => `Vous avez postulé le ${day}`
		},
		added: {
			en: 'The recruiter added your portfolio',
			fr: 'Le recruteur a ajouté votre portfolio'
		},
		addedOn: {
			en: (day: string) => `The recruiter added your portfolio on ${day}`,
			fr: (day: string) => `Le recruteur a ajouté votre portfolio le ${day}`
		}
	},
	/** What the panel says about leaving an applicant list, by how the viewer got on it (LeaveCopy) */
	leave: {
		/** Leaving a list the recruiter put the viewer's portfolio on: never called an application */
		remove: {
			button: { en: 'Remove me from the list', fr: 'Me retirer de la liste' },
			question: {
				en: 'Remove your portfolio from this applicant list? The recruiter will no longer see it there.',
				fr: "Retirer votre portfolio de cette liste de candidats ? Le recruteur ne l'y verra plus."
			},
			confirm: { en: 'Remove me', fr: 'Me retirer' },
			busy: { en: 'Removing…', fr: 'Retrait…' },
			done: { en: 'Removed from the applicant list', fr: 'Retiré de la liste des candidats' },
			doneDescription: {
				en: 'The recruiter no longer sees your portfolio on this list.',
				fr: 'Le recruteur ne voit plus votre portfolio dans cette liste.'
			}
		},
		withdraw: {
			button: { en: 'Withdraw my application', fr: 'Retirer ma candidature' },
			question: {
				en: 'Withdraw your application? The recruiter will no longer see you as an applicant.',
				fr: 'Retirer votre candidature ? Le recruteur ne vous verra plus parmi les candidats.'
			},
			confirm: { en: 'Withdraw', fr: 'Retirer' },
			busy: { en: 'Withdrawing…', fr: 'Retrait…' },
			done: { en: 'Application withdrawn', fr: 'Candidature retirée' },
			doneDescription: {
				en: 'The recruiter no longer sees you as an applicant.',
				fr: 'Le recruteur ne vous voit plus parmi les candidats.'
			}
		}
	},

	// --- A failed application request, by action ---------------------------------------------

	failed: {
		apply: {
			en: 'Could not send your application. Try again.',
			fr: "Impossible d'envoyer votre candidature. Réessayez."
		},
		withdraw: {
			en: 'Could not withdraw your application. Try again.',
			fr: 'Impossible de retirer votre candidature. Réessayez.'
		},
		remove: {
			en: 'Could not remove you from the list. Try again.',
			fr: 'Impossible de vous retirer de la liste. Réessayez.'
		},
		status: {
			en: 'Could not check whether you applied. Try again.',
			fr: 'Impossible de vérifier si vous avez postulé. Réessayez.'
		}
	},
	sessionExpired: {
		apply: {
			en: 'Your session expired. Sign in again to apply.',
			fr: 'Votre session a expiré. Reconnectez-vous pour postuler.'
		},
		withdraw: {
			en: 'Your session expired. Sign in again to withdraw your application.',
			fr: 'Votre session a expiré. Reconnectez-vous pour retirer votre candidature.'
		},
		remove: {
			en: 'Your session expired. Sign in again to remove yourself from the list.',
			fr: 'Votre session a expiré. Reconnectez-vous pour vous retirer de la liste.'
		},
		status: {
			en: 'Your session expired. Sign in again to apply.',
			fr: 'Votre session a expiré. Reconnectez-vous pour postuler.'
		}
	},
	/** The request did not get an answer */
	network: {
		en: 'Could not reach the server. Check your connection and try again.',
		fr: 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.'
	},
	ownPosting: {
		en: 'You cannot apply to your own job description.',
		fr: "Vous ne pouvez pas postuler à votre propre offre d'emploi."
	},
	noPortfolio: {
		en: 'Claim your portfolio before applying.',
		fr: 'Réservez votre portfolio avant de postuler.'
	},
	alreadyApplied: {
		en: 'You had already applied to this job.',
		fr: 'Vous aviez déjà postulé à cette offre.'
	},
	notOpen: {
		en: 'This position is no longer taking applications.',
		fr: "Cette offre n'accepte plus de candidatures."
	},
	full: {
		en: 'This job description has reached its limit of applicants.',
		fr: "Cette offre d'emploi a atteint sa limite de candidats."
	},
	/** Withdrawn in another tab, or removed by the recruiter: the wording blames no one */
	notAppliedOnWithdraw: {
		en: 'You are no longer on this job’s applicant list.',
		fr: 'Vous ne figurez plus sur la liste des candidats de cette offre.'
	},
	notAppliedOnRemove: {
		en: 'You were no longer on the applicant list.',
		fr: 'Vous ne figuriez déjà plus sur la liste des candidats.'
	},
	notPublished: {
		en: 'This job description is no longer published.',
		fr: "Cette offre d'emploi n'est plus publiée."
	}
});
