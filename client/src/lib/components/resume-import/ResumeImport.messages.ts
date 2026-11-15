import { defineMessages, plural } from 'portfolio-common';

// The résumé import's dialog, step by step. What it says about sizes, the allowance and failed
// imports or drafts is in `#services/resumeImport.messages.ts`.
export const m = defineMessages({
	title: { en: 'Import from résumé', fr: 'Importer depuis un CV' },
	/** Under the title, one per step */
	description: {
		upload: {
			en: 'Turn a PDF résumé into experience drafts you review before adding them.',
			fr: "Transformez un CV au format PDF en brouillons d'expériences, à vérifier avant de les ajouter."
		},
		/** While reading, in place of the file's name when it is not known */
		yourResume: { en: 'Your résumé', fr: 'Votre CV' },
		/** `fileName`: the résumé's, '' when it is not known */
		review: {
			en: (count: number, fileName: string) =>
				`${count} ${plural(count, 'experience', 'experiences')} found in ${fileName || 'your résumé'}. Tick the ones to add.`,
			fr: (count: number, fileName: string) =>
				`${count} ${plural(count, 'expérience trouvée', 'expériences trouvées')} dans ${fileName || 'votre CV'}. Cochez celles à ajouter.`
		}
	},
	upload: {
		drop: { en: 'Drop your résumé here', fr: 'Déposez votre CV ici' },
		/** In place of `drop` on a touch screen */
		choose: { en: 'Choose your résumé', fr: 'Choisissez votre CV' },
		limits: { en: 'PDF, up to 4 MB', fr: "PDF, jusqu'à 4 Mo" },
		choosePdf: { en: 'Choose a PDF', fr: 'Choisir un PDF' },
		chooseAnother: { en: 'Choose another file', fr: 'Choisir un autre fichier' },
		/** Announced; `name`: the file's */
		selected: {
			en: (name: string) => `${name} selected.`,
			fr: (name: string) => `${name} sélectionné.`
		},
		removed: { en: 'File removed.', fr: 'Fichier retiré.' },
		notPdf: {
			en: 'This file is not a PDF, whatever its name. Choose a PDF résumé.',
			fr: "Ce fichier n'est pas un PDF, quel que soit son nom. Choisissez un CV au format PDF."
		},
		unreadable: {
			en: 'This file could not be read. Choose it again.',
			fr: "Ce fichier n'a pas pu être lu. Choisissez-le de nouveau."
		},
		noImportsLeft: {
			en: 'You have no imports left for now.',
			fr: 'Il ne vous reste aucun import pour le moment.'
		},
		/** `date`: when the allowance comes back ('Nov 20, 2:05 PM GMT+1') */
		importAgainFrom: {
			en: (date: string) => `You can import again from ${date}.`,
			fr: (date: string) => `Vous pourrez de nouveau importer à partir du ${date}.`
		},
		unavailable: {
			en: 'Résumé import is not available right now.',
			fr: "L'import de CV n'est pas disponible pour le moment."
		},
		/** Where the PDF goes and what is kept: say exactly what the import does */
		privacy: {
			en: 'Your PDF is sent to Anthropic’s Claude, which reads it to draft your experiences. This portfolio does not store the file, and nothing is published until you review the drafts and add them.',
			fr: "Votre PDF est envoyé à Claude d'Anthropic, qui le lit pour rédiger les brouillons de vos expériences. Ce portfolio ne conserve pas le fichier, et rien n'est publié tant que vous n'avez pas vérifié puis ajouté les brouillons."
		},
		import: { en: 'Import résumé', fr: 'Importer le CV' }
	},
	reading: {
		/** Announced when the import starts */
		started: {
			en: 'Reading your résumé. This can take up to 3 minutes.',
			fr: "Lecture de votre CV. Cela peut prendre jusqu'à 3 minutes."
		},
		heading: { en: 'Reading your résumé…', fr: 'Lecture de votre CV…' },
		detail: {
			en: 'Claude is finding your experiences, projects and skills.',
			fr: 'Claude repère vos expériences, vos projets et vos compétences.'
		},
		/** Names the progress bar */
		progress: { en: 'Reading your résumé', fr: 'Lecture de votre CV' },
		/** What the progress bar says of itself while no value is known (the component's own text) */
		progressValue: { en: 'loading...', fr: 'chargement…' },
		/** `time`: minutes and seconds since the import started ('0:42'), marked up as <time> */
		elapsed: {
			en: (time: string) => `<time>${time}</time> elapsed · this can take up to 3 minutes`,
			fr: (time: string) =>
				`Temps écoulé : <time>${time}</time> · cela peut prendre jusqu'à 3 minutes`
		},
		keepOpen: {
			en: 'Keep this window open. Stopping now may still count toward your imports.',
			fr: 'Gardez cette fenêtre ouverte. Un import arrêté maintenant peut tout de même être décompté de vos imports.'
		},
		cancel: { en: 'Cancel import', fr: "Annuler l'import" },
		stopped: {
			en: 'Import stopped. If Claude had already started reading your résumé, it still counts toward your imports.',
			fr: 'Import arrêté. Si Claude avait déjà commencé à lire votre CV, cet import est tout de même décompté.'
		},
		timedOut: {
			en: 'The import took too long and was stopped. It may still count toward your imports: try again later, or with a shorter résumé.',
			fr: "L'import a pris trop de temps et a été arrêté. Il peut tout de même être décompté de vos imports : réessayez plus tard, ou avec un CV plus court."
		},
		networkError: {
			en: 'Could not reach the server. Check your connection and try again. If the import had started, it may still count toward your imports.',
			fr: "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez. Si l'import avait commencé, il peut tout de même être décompté de vos imports."
		},
		/** `fileName`: the résumé's */
		nothingFound: {
			en: (fileName: string) =>
				`No experiences were found in ${fileName}. Check that it is your résumé, or try another PDF.`,
			fr: (fileName: string) =>
				`Aucune expérience n'a été trouvée dans ${fileName}. Vérifiez qu'il s'agit bien de votre CV, ou essayez un autre PDF.`
		},
		/**
		 * How the API's own warning for a résumé without experiences starts, in the language it
		 * answers in: `nothingFound` says it already, so that warning is not listed under it
		 */
		nothingFoundWarning: { en: 'No experiences were found', fr: 'Aucune expérience' },
		/** Announced once the drafts are there */
		found: {
			en: (count: number) =>
				`${count} ${plural(count, 'experience', 'experiences')} found. Review them, then add the ones you want.`,
			fr: (count: number) =>
				`${count} ${plural(count, 'expérience trouvée', 'expériences trouvées')}. Vérifiez-les, puis ajoutez celles que vous voulez.`
		}
	},
	review: {
		heading: { en: 'Review the experiences found', fr: 'Vérifiez les expériences trouvées' },
		/** Announced: the editor's unsaved changes to `count` drafts were taken into the review */
		editedKept: {
			en: (count: number) =>
				count === 1
					? 'Your unsaved changes to a draft are kept in it.'
					: `Your unsaved changes to ${count} drafts are kept in them.`,
			fr: (count: number) =>
				count === 1
					? "Vos modifications non enregistrées d'un brouillon y sont conservées."
					: `Vos modifications non enregistrées de ${count} brouillons y sont conservées.`
		},
		/** Announced; `title`: the experience's */
		added: {
			en: (title: string) => `${title} added.`,
			fr: (title: string) => `${title} ajoutée.`
		},
		addedCount: {
			en: (count: number) =>
				`${count} ${count === 1 ? 'experience was' : 'experiences were'} added.`,
			fr: (count: number) =>
				`${count} ${plural(count, 'expérience a été ajoutée', 'expériences ont été ajoutées')}.`
		},
		warnings: { en: 'Check before adding', fr: "À vérifier avant d'ajouter" },
		/** Instead of the warnings, when they were written in the site's other language */
		warningsOtherLanguage: {
			en: "This import has remarks in the site's other language. Switch back to read them, or check each draft before adding it.",
			fr: "Cet import a des remarques dans l'autre langue du site : revenez-y pour les lire, ou vérifiez chaque brouillon avant de l'ajouter."
		},
		/** `selected` of the `total` drafts not added yet are ticked */
		selected: {
			en: (selected: number, total: number) => `${selected} of ${total} selected`,
			fr: (selected: number, total: number) =>
				`${selected} sur ${total} ${plural(selected, 'sélectionnée', 'sélectionnées')}`
		},
		selectAll: { en: 'Select all', fr: 'Tout sélectionner' },
		selectNone: { en: 'Select none', fr: 'Tout désélectionner' },
		list: { en: 'Experiences found', fr: 'Expériences trouvées' },
		/** The button that adds the ticked drafts: none ticked, then `count` of them */
		add: {
			en: (count: number) =>
				count === 0
					? 'Add experiences'
					: `Add ${count} ${plural(count, 'experience', 'experiences')}`,
			fr: (count: number) =>
				count === 0
					? 'Ajouter des expériences'
					: `Ajouter ${count} ${plural(count, 'expérience', 'expériences')}`
		},
		/** While the drafts are added one by one: the `current`th of `total` */
		addingOne: {
			en: (current: number, total: number) => `Adding ${current} of ${total}…`,
			fr: (current: number, total: number) => `Ajout ${current} sur ${total}…`
		},
		adding: { en: 'Adding…', fr: 'Ajout…' },
		discard: { en: 'Discard', fr: 'Abandonner' },
		discardImport: { en: 'Discard import', fr: "Abandonner l'import" },
		discarded: { en: 'Import discarded.', fr: 'Import abandonné.' },
		sessionExpired: {
			en: 'Your session expired. Sign in again: your drafts are kept, and you can add the rest then.',
			fr: 'Votre session a expiré. Reconnectez-vous : vos brouillons sont conservés, et vous pourrez alors ajouter le reste.'
		},
		notOwner: {
			en: 'Only the owner of this portfolio can add experiences to it.',
			fr: 'Seul le propriétaire de ce portfolio peut y ajouter des expériences.'
		},
		noPortfolio: {
			en: 'Claim your portfolio before adding experiences.',
			fr: "Réservez l'adresse de votre portfolio avant d'ajouter des expériences."
		},
		networkError: {
			en: 'Could not reach the server. Check your connection.',
			fr: 'Impossible de joindre le serveur. Vérifiez votre connexion.'
		}
	},
	confirm: {
		stop: {
			en: 'Stop the import? It may still count toward your imports.',
			fr: "Arrêter l'import ? Il peut tout de même être décompté de vos imports."
		},
		discard: {
			en: 'Discard these drafts? Importing the résumé again counts as a new import.',
			fr: 'Abandonner ces brouillons ? Importer de nouveau le CV compte comme un nouvel import.'
		},
		keepWaiting: { en: 'Keep waiting', fr: 'Continuer à attendre' },
		keepDrafts: { en: 'Keep drafts', fr: 'Garder les brouillons' },
		stopImport: { en: 'Stop import', fr: "Arrêter l'import" }
	}
});
