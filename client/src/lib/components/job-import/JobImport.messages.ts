// Texts of the job description import dialog. What is wrong with a file, the allowance and why
// an import failed are in services/jobImport.messages.ts.
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	title: { en: 'Import a job description', fr: "Importer une offre d'emploi" },
	intro: {
		en: 'Turn a PDF job description into a draft you complete in the editor.',
		fr: "Transformez une offre d'emploi en PDF en un brouillon à compléter dans l'éditeur."
	},
	/** In place of the file's name while it is read, should it have none */
	yourPdf: { en: 'Your PDF', fr: 'Votre PDF' },

	// --- The file -----------------------------------------------------------------------------

	notPdf: {
		en: 'This file is not a PDF, whatever its name. Choose a PDF job description.',
		fr: "Ce fichier n'est pas un PDF, quel que soit son nom. Choisissez une offre d'emploi au format PDF."
	},
	unreadable: {
		en: 'This file could not be read. Choose it again.',
		fr: "Ce fichier n'a pas pu être lu. Choisissez-le de nouveau."
	},
	/** Announced to screen readers */
	selected: {
		en: (fileName: string) => `${fileName} selected.`,
		fr: (fileName: string) => `${fileName} sélectionné.`
	},
	fileRemoved: { en: 'File removed.', fr: 'Fichier retiré.' },
	dropHere: { en: 'Drop the job description here', fr: "Déposez l'offre d'emploi ici" },
	chooseHere: { en: 'Choose the job description', fr: "Choisissez l'offre d'emploi" },
	fileLimits: { en: 'PDF, up to 4 MB', fr: 'PDF, 4 Mo au maximum' },
	choosePdf: { en: 'Choose a PDF', fr: 'Choisir un PDF' },
	chooseAnother: { en: 'Choose another file', fr: 'Choisir un autre fichier' },

	// --- An unsaved import --------------------------------------------------------------------

	/** `<pdf>` shows the name of the unsaved import's PDF, in place of the words written here */
	replacesFile: {
		en: 'A new import replaces your unsaved import of <pdf>this PDF</pdf>, and any changes you made to it.',
		fr: 'Un nouvel import remplace votre import non enregistré de <pdf>ce PDF</pdf>, ainsi que les modifications que vous y avez apportées.'
	},
	/** The same, when the name of the PDF is not known */
	replacesUnnamed: {
		en: 'A new import replaces your unsaved import of <pdf>a job description</pdf>, and any changes you made to it.',
		fr: "Un nouvel import remplace votre import non enregistré d'<pdf>une offre d'emploi</pdf>, ainsi que les modifications que vous y avez apportées."
	},
	continueEditing: { en: 'Continue editing it instead', fr: 'Reprendre plutôt cet import' },

	// --- Before the import --------------------------------------------------------------------

	notAvailable: {
		en: 'Job description import is not available right now.',
		fr: "L'import d'offre n'est pas disponible pour le moment."
	},
	privacy: {
		en: 'Your PDF is sent to Anthropic’s Claude, which reads it to draft the job description. The file is not stored, and nothing is published: you complete the draft in the editor, then save it.',
		fr: "Votre PDF est envoyé à Claude, d'Anthropic, qui le lit pour préparer un brouillon de l'offre d'emploi. Le fichier n'est pas conservé et rien n'est publié : vous complétez le brouillon dans l'éditeur, puis vous l'enregistrez."
	},
	import: { en: 'Import', fr: 'Importer' },

	// --- Reading ------------------------------------------------------------------------------

	/** Announced to screen readers when the import starts */
	readingAnnouncement: {
		en: 'Reading the job description. This can take up to 3 minutes.',
		fr: "Lecture de l'offre d'emploi. Cela peut prendre jusqu'à 3 minutes."
	},
	reading: { en: 'Reading the job description…', fr: "Lecture de l'offre d'emploi…" },
	/** Name of the progress bar */
	readingLabel: { en: 'Reading the job description', fr: "Lecture de l'offre d'emploi" },
	finding: {
		en: 'Claude is finding the title, contract, working time, pay and requirements.',
		fr: "Claude repère l'intitulé, le contrat, le temps de travail, la rémunération et le profil recherché."
	},
	/** `<time>` shows the time elapsed ('0:42'), in place of the one written here */
	elapsed: {
		en: '<time>0:00</time> elapsed · this can take up to 3 minutes',
		fr: "Temps écoulé : <time>0:00</time> · cela peut prendre jusqu'à 3 minutes"
	},
	keepOpen: {
		en: 'Keep this window open. Stopping now may still count toward your free imports.',
		fr: 'Gardez cette fenêtre ouverte. Un import arrêté maintenant peut tout de même compter dans vos imports gratuits.'
	},
	/** Announced to screen readers */
	readOpening: {
		en: 'Job description read. Opening the editor.',
		fr: "Offre d'emploi lue. Ouverture de l'éditeur."
	},
	/** The draft came back, and could not be kept in localStorage */
	notKept: {
		en: 'The job description was read, but this browser could not keep the draft (site data may be blocked or full). Allow site data, then import it again: this import counted.',
		fr: "L'offre d'emploi a été lue, mais ce navigateur n'a pas pu conserver le brouillon (les données de site sont peut-être bloquées, ou l'espace est plein). Autorisez les données de site, puis importez-la de nouveau : cet import a été compté."
	},

	// --- Stopping -----------------------------------------------------------------------------

	stopQuestion: {
		en: 'Stop the import? It may still count toward your free imports.',
		fr: "Arrêter l'import ? Il peut tout de même compter dans vos imports gratuits."
	},
	keepWaiting: { en: 'Keep waiting', fr: 'Attendre encore' },
	stopImport: { en: 'Stop import', fr: "Arrêter l'import" },
	cancelImport: { en: 'Cancel import', fr: "Annuler l'import" }
});
