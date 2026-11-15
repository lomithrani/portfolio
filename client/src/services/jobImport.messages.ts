// Texts of jobImport.ts: what is wrong with a file, the allowance, why an import failed. The
// API's own messages (which limit was hit, when the next import is possible) come in the page's
// language and are shown as they are.
import { defineMessages, plural } from 'portfolio-common';

export const jobImportMessages = defineMessages({
	/** What is wrong with a file picked for import, before reading it */
	file: {
		notPdf: {
			en: 'Choose a PDF file: the import only reads PDF job descriptions.',
			fr: "Choisissez un fichier PDF : l'import ne lit que les offres d'emploi au format PDF."
		},
		empty: {
			en: 'This file is empty. Choose another PDF.',
			fr: 'Ce fichier est vide. Choisissez un autre PDF.'
		},
		/** `size`: the file's ('6.2 MB') */
		tooLarge: {
			en: (size: string) =>
				`This PDF is ${size}: the import takes files of up to 4 MB. Export a lighter version (fewer images) and try again.`,
			fr: (size: string) =>
				`Ce PDF fait ${size} : l'import accepte les fichiers de 4 Mo au maximum. Exportez une version plus légère (moins d'images) et réessayez.`
		}
	},
	/** '2 of 3 free imports left' */
	quota: {
		en: (left: number, limit: number) =>
			`${left} of ${limit} free ${plural(limit, 'import', 'imports')} left`,
		fr: (left: number, limit: number) =>
			`${left} ${plural(left, 'import gratuit restant', 'imports gratuits restants')} sur ${limit}`
	},
	/** 'You have used your 3 free imports. Paid plans are coming soon.' */
	planUsed: {
		en: (limit: number) =>
			`You have used your ${limit} free ${plural(limit, 'import', 'imports')}. Paid plans are coming soon.`,
		fr: (limit: number) =>
			`Vous avez utilisé ${plural(limit, 'votre', 'vos')} ${limit} ${plural(limit, 'import gratuit', 'imports gratuits')}. Des formules payantes arrivent bientôt.`
	},
	/** A daily limit is reached; `when`: the date and time imports start again */
	pausedUntil: {
		en: (when: string) => `No imports available right now: you can import again from ${when}.`,
		fr: (when: string) =>
			`Aucun import disponible pour le moment : vous pourrez importer de nouveau à partir du ${when}.`
	},
	paused: {
		en: 'No imports available right now. Try again later.',
		fr: 'Aucun import disponible pour le moment. Réessayez plus tard.'
	},
	/** The upload step, before the last import of the plan starts */
	lastImportCost: {
		en: 'This is your last free import: it counts even if you discard the draft.',
		fr: "C'est votre dernier import gratuit : il compte même si vous abandonnez le brouillon."
	},
	/** The upload step, before an import starts (`left`: 2 or more) */
	importCost: {
		en: (left: number) =>
			`This import uses 1 of your ${left} free imports left, even if you discard the draft.`,
		fr: (left: number) =>
			`Cet import utilise 1 de vos ${left} imports gratuits restants, même si vous abandonnez le brouillon.`
	},

	// --- Errors -------------------------------------------------------------------------------

	sessionExpired: {
		en: 'Your session expired. Sign in again, then import the job description.',
		fr: "Votre session a expiré. Reconnectez-vous, puis importez l'offre d'emploi."
	},
	networkError: {
		en: 'Could not reach the server. Check your connection and try again. If the import had started, it may still count toward your free imports.',
		fr: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez. Si l'import avait commencé, il peut tout de même compter dans vos imports gratuits."
	},
	/** The browser stopped waiting for the answer */
	timedOut: {
		en: 'The import took too long and was stopped. It may still count toward your free imports: try again later, or with a shorter PDF.',
		fr: "L'import a pris trop de temps et a été arrêté. Il peut tout de même compter dans vos imports gratuits : réessayez plus tard, ou avec un PDF plus court."
	},
	/** The recruiter stopped the import */
	stopped: {
		en: 'Import stopped. If Claude had already started reading the PDF, it still counts toward your free imports.',
		fr: 'Import arrêté. Si Claude avait déjà commencé à lire le PDF, il compte tout de même dans vos imports gratuits.'
	},
	/** POST /jobs/import failed, and the API gave no message of its own */
	errors: {
		noRecruiterSpace: {
			en: 'Your account has no recruiter space yet. Create it from your recruiter space, then import the PDF.',
			fr: "Votre compte n'a pas encore d'espace recruteur. Créez-le depuis votre espace recruteur, puis importez le PDF."
		},
		unavailable: {
			en: 'Job description import is not available on this site right now.',
			fr: "L'import d'offre n'est pas disponible sur ce site pour le moment."
		},
		tooLarge: {
			en: 'This PDF is too large: the import takes files of up to 4 MB.',
			fr: "Ce PDF est trop volumineux : l'import accepte les fichiers de 4 Mo au maximum."
		},
		unreadable: {
			en: 'This file could not be read as a job description. Choose another PDF.',
			fr: "Ce fichier n'a pas pu être lu comme une offre d'emploi. Choisissez un autre PDF."
		},
		noImportsAvailable: {
			en: 'No imports are available right now. Try again later.',
			fr: "Aucun import n'est disponible pour le moment. Réessayez plus tard."
		},
		temporarilyUnavailable: {
			en: 'Job description import is temporarily unavailable. Try again later.',
			fr: "L'import d'offre est temporairement indisponible. Réessayez plus tard."
		},
		failed: {
			en: 'The import failed. Try again in a moment.',
			fr: "L'import a échoué. Réessayez dans un instant."
		}
	},

	/**
	 * The toast once the editor opens on an import: 'Read from offer.pdf. Check the 2 notes above
	 * the form, then create the posting.' (`fileName` may be empty; `notes`: how many warnings)
	 */
	importedToast: {
		en: (fileName: string, notes: number) => {
			const from = fileName ? ` from ${fileName}` : '';
			if (notes === 0) return `Read${from}. Complete it, then create the posting.`;
			return `Read${from}. Check the ${notes === 1 ? 'note' : `${notes} notes`} above the form, then create the posting.`;
		},
		fr: (fileName: string, notes: number) => {
			const read = fileName ? `${fileName} a été lu.` : 'Le PDF a été lu.';
			if (notes === 0) return `${read} Complétez l'offre, puis créez-la.`;
			return `${read} Vérifiez ${notes === 1 ? 'la note' : `les ${notes} notes`} au-dessus du formulaire, puis créez l'offre.`;
		}
	}
});
