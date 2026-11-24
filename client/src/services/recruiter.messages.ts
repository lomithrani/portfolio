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

	// --- Status -----------------------------------------------------------------------------

	/** The toast after a change of status (`status`: the status as its badge names it) */
	statusChanged: {
		en: (status: string) => `Status changed to ${status}`,
		fr: (status: string) => `Statut modifié : ${status}`
	},

	// --- Deleting a posting (the dashboard and the posting's page) --------------------------

	/** The confirmation's title */
	deleteJobTitle: {
		en: (title: string) => `Delete “${title}”?`,
		fr: (title: string) => `Supprimer « ${title} » ?`
	},
	/** What the confirmation says before a posting is deleted */
	deleteJob: { en: 'This cannot be undone.', fr: 'Cette action est irréversible.' },
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
