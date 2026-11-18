import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	pageTitle: { en: 'Your job descriptions | Recruiter', fr: "Vos offres d'emploi | Recruteur" },
	title: { en: 'Your job descriptions', fr: "Vos offres d'emploi" },
	lead: {
		en: "Open one, then pick it on a candidate's Hire page to show it to them.",
		fr: "Ouvrez-en une, puis choisissez-la sur la page Recruter d'un candidat pour la lui présenter."
	},

	/** Signed in without a recruiter space */
	space: {
		title: { en: 'Create your recruiter space', fr: 'Créez votre espace recruteur' },
		text: {
			en: "Your account has a candidate space. Add a recruiter space to write job descriptions and bring them to candidates' Hire pages. You can switch between both from the account menu.",
			fr: "Votre compte a un espace candidat. Ajoutez un espace recruteur pour rédiger des offres d'emploi et les présenter sur la page Recruter des candidats. Vous pouvez passer de l'un à l'autre depuis le menu du compte."
		},
		/** Create was pressed with the age and terms box unticked */
		tickTheBox: {
			en: 'Tick the box to confirm your age and accept the terms before you create your recruiter space.',
			fr: 'Cochez la case pour confirmer votre âge et accepter les conditions avant de créer votre espace recruteur.'
		},
		create: { en: 'Create my recruiter space', fr: 'Créer mon espace recruteur' },
		creating: { en: 'Creating your space…', fr: 'Création de votre espace…' },
		/** The toast once created */
		ready: { en: 'Your recruiter space is ready', fr: 'Votre espace recruteur est prêt' },
		readyDescription: {
			en: 'Write your first job description.',
			fr: "Rédigez votre première offre d'emploi."
		}
	},

	/** The toast once a PDF was read (its description comes from the job import) */
	imported: { en: 'Job description imported', fr: "Offre d'emploi importée" },
	/**
	 * An import read earlier, not saved as a posting yet. The page shows the file's name in the
	 * marked passage, or these words when it has none
	 */
	pendingImport: {
		en: 'You imported <file>a job description</file> but have not created the posting yet.',
		fr: "Vous avez importé <file>un PDF</file> mais n'avez pas encore créé l'offre."
	},
	continueEditing: { en: 'Continue editing', fr: 'Continuer la rédaction' },
	importFromPdf: { en: 'Import from PDF', fr: 'Importer un PDF' },
	newJob: { en: 'New job description', fr: "Nouvelle offre d'emploi" },

	loadFailed: {
		en: 'Could not load your job descriptions',
		fr: "Impossible de charger vos offres d'emploi"
	},
	empty: {
		title: { en: 'No job descriptions yet', fr: "Pas encore d'offre d'emploi" },
		text: {
			en: 'Write your first one. It stays a draft, visible only to you, until you open it to candidates.',
			fr: "Rédigez votre première offre. Elle reste un brouillon, visible de vous seul, jusqu'à ce que vous l'ouvriez aux candidats."
		},
		/** The same, when the PDF import is available */
		textWithImport: {
			en: 'Write your first one, or import an existing job description from a PDF. It stays a draft, visible only to you, until you open it to candidates.',
			fr: "Rédigez votre première offre, ou importez une offre existante depuis un PDF. Elle reste un brouillon, visible de vous seul, jusqu'à ce que vous l'ouvriez aux candidats."
		}
	},

	filterByStatus: { en: 'Filter by status', fr: 'Filtrer par statut' },
	/** Name of the list */
	jobDescriptions: { en: 'Job descriptions', fr: "Offres d'emploi" },
	/** On a card (`day`: '3 Nov 2026', shown as a <time>) */
	updated: {
		en: (day: string) => `Updated <time>${day}</time>`,
		fr: (day: string) => `Mise à jour le <time>${day}</time>`
	},
	view: { en: 'View', fr: 'Voir' },
	/** After View, Edit and Delete on a card, for screen readers: which posting */
	ofJob: {
		en: (title: string) => `: ${title}`,
		fr: (title: string) => ` : ${title}`
	},
	alreadyDeleted: {
		en: 'This job description was already deleted',
		fr: "Cette offre d'emploi avait déjà été supprimée"
	}
});
