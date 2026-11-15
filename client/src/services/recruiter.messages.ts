// Texts of the recruiter's pages built by `recruiter.ts`, and those its two pages share
// (/recruiter and /recruiter/jobs/:id).
import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	/** What the pages say when the API could not be reached */
	networkError: {
		en: 'Could not reach the server. Check your connection and try again.',
		fr: 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.'
	},

	// --- The list ---------------------------------------------------------------------------

	/** How the filters name each status (plural where it reads as a group: "Drafts") */
	statusFilter: {
		all: { en: 'All', fr: 'Toutes' },
		draft: { en: 'Drafts', fr: 'Brouillons' },
		open: { en: 'Open', fr: 'Ouvertes' },
		on_hold: { en: 'On hold', fr: 'En pause' },
		filled: { en: 'Filled', fr: 'Pourvues' },
		closed: { en: 'Closed', fr: 'Fermées' }
	},
	/** '6 job descriptions' */
	jobDescriptions: {
		en: (count: number) => `${count} ${plural(count, 'job description', 'job descriptions')}`,
		fr: (count: number) => `${count} ${plural(count, "offre d'emploi", "offres d'emploi")}`
	},
	/** 'Open: 2 of 6 job descriptions' (`status`: the status as its badge names it) */
	shownJobs: {
		en: (status: string, shown: number, total: number) =>
			`${status}: ${shown} of ${total} ${plural(total, 'job description', 'job descriptions')}`,
		fr: (status: string, shown: number, total: number) =>
			`${status} : ${shown} sur ${total} ${plural(total, "offre d'emploi", "offres d'emploi")}`
	},
	noApplicants: { en: 'No applicants yet', fr: 'Aucun candidat pour le moment' },
	/** '1 applicant', '12 applicants' */
	applicantCount: {
		en: (count: number) => `${count} ${plural(count, 'applicant', 'applicants')}`,
		fr: (count: number) => `${count} ${plural(count, 'candidat', 'candidats')}`
	},

	// --- Status -----------------------------------------------------------------------------

	/** The toast after a change of status (`status`: the status as its badge names it) */
	statusChanged: {
		en: (status: string) => `Status changed to ${status}`,
		fr: (status: string) => `Statut modifié : ${status}`
	},

	// --- Applicants -------------------------------------------------------------------------

	/** How an applicant got on the list (a badge) */
	applicantSource: {
		applied: { en: 'Applied', fr: 'A postulé' },
		added_by_recruiter: { en: 'Added by you', fr: 'Ajouté par vous' }
	},
	/** 'Applied 3 Nov 2026' */
	appliedOn: {
		en: (day: string) => `Applied ${day}`,
		fr: (day: string) => `A postulé le ${day}`
	},
	/** 'Added 3 Nov 2026' */
	addedOn: {
		en: (day: string) => `Added ${day}`,
		fr: (day: string) => `Ajouté le ${day}`
	},
	/** Why "Add a portfolio" cannot send what was typed */
	domainProblem: {
		empty: {
			en: 'Enter the name of a portfolio, e.g. louis.gentil.',
			fr: "Saisissez le nom d'un portfolio, par exemple louis.gentil."
		},
		invalid: {
			en: 'This is not a portfolio name. Check how it is spelled.',
			fr: "Ce n'est pas un nom de portfolio. Vérifiez son orthographe."
		}
	},
	/** Why POST /jobs/:id/applicants failed */
	addApplicant: {
		sessionExpired: {
			en: 'Your session expired. Sign in again to add a portfolio.',
			fr: 'Votre session a expiré. Reconnectez-vous pour ajouter un portfolio.'
		},
		ownPortfolio: {
			en: 'This is your own portfolio: you cannot add it.',
			fr: "C'est votre propre portfolio : vous ne pouvez pas l'ajouter."
		},
		noRecruiterSpace: {
			en: 'Your account has no recruiter space yet. Create it to manage applicants.',
			fr: "Votre compte n'a pas encore d'espace recruteur. Créez-le pour gérer les candidats."
		},
		unknownPortfolio: {
			en: (domain: string) => `No portfolio is named “${domain}”. Check how it is spelled.`,
			fr: (domain: string) =>
				`Aucun portfolio ne s'appelle « ${domain} ». Vérifiez son orthographe.`
		},
		jobGone: {
			en: 'This job description no longer exists: it may have been deleted.',
			fr: "Cette offre d'emploi n'existe plus : elle a peut-être été supprimée."
		},
		alreadyApplicant: {
			en: (domain: string) => `“${domain}” is already an applicant.`,
			fr: (domain: string) => `« ${domain} » fait déjà partie des candidats.`
		},
		full: {
			en: (limit: number) => `This job description has reached its limit of ${limit} applicants.`,
			fr: (limit: number) => `Cette offre d'emploi a atteint sa limite de ${limit} candidats.`
		},
		failed: {
			en: 'Could not add this portfolio. Try again in a moment.',
			fr: "Impossible d'ajouter ce portfolio. Réessayez dans un instant."
		}
	},
	/** What the confirmation says before an applicant is removed (`name`: how they are listed) */
	removeApplicant: {
		applied: {
			en: (name: string) =>
				`${name} applied with their portfolio. They are no longer listed for this job description, and can apply again while it is open.`,
			fr: (name: string) =>
				`${name} a postulé avec son portfolio. Son nom ne figurera plus sur cette offre d'emploi, et une nouvelle candidature reste possible tant qu'elle est ouverte.`
		},
		added: {
			en: (name: string) =>
				`${name} is no longer listed for this job description. You can add the portfolio again later.`,
			fr: (name: string) =>
				`${name} ne figurera plus sur cette offre d'emploi. Vous pourrez ajouter ce portfolio de nouveau plus tard.`
		}
	},

	// --- Deleting a posting (the dashboard and the posting's page) --------------------------

	/** The confirmation's title */
	deleteJobTitle: {
		en: (title: string) => `Delete “${title}”?`,
		fr: (title: string) => `Supprimer « ${title} » ?`
	},
	/** What the confirmation says before a posting is deleted */
	deleteJob: {
		noApplicants: { en: 'This cannot be undone.', fr: 'Cette action est irréversible.' },
		withApplicants: {
			en: (count: number) =>
				`Its list of ${count} ${plural(count, 'applicant', 'applicants')} is deleted with it. This cannot be undone.`,
			fr: (count: number) =>
				`Sa liste de ${count} ${plural(count, 'candidat', 'candidats')} est supprimée avec elle. Cette action est irréversible.`
		}
	},
	deleteJobFailed: {
		en: 'Could not delete it. Try again in a moment.',
		fr: 'Impossible de la supprimer. Réessayez dans un instant.'
	},
	jobDeleted: { en: 'Job description deleted', fr: "Offre d'emploi supprimée" },

	// --- Both pages -------------------------------------------------------------------------

	/** A request answered 401: the page shows its signed-out state, a toast says why */
	sessionExpired: {
		en: 'Your session expired. Sign in again.',
		fr: 'Votre session a expiré. Reconnectez-vous.'
	},
	/** Under "Could not load…": the list or the posting could not be read */
	loadFailed: {
		en: 'The server could not be reached, or it failed. Check your connection and try again.',
		fr: 'Le serveur est injoignable, ou il a rencontré une erreur. Vérifiez votre connexion et réessayez.'
	}
});
