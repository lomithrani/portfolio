// Texts of the job posting editor. How it names each field is `fieldLabels` of
// services/jobPosting.messages.ts (JOB_FIELD_LABELS), shared with the error summary; the labels
// of the values (status, work mode, contract type...) and the rules' messages are
// portfolio-common's, and the API's messages come in the page's language.
import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	// --- The import's banner ------------------------------------------------------------------

	/** `fileName` may be empty */
	importedFrom: {
		en: (fileName: string) =>
			`Imported from ${fileName || 'your PDF'}: check every field before saving.`,
		fr: (fileName: string) =>
			`Importé depuis ${fileName || 'votre PDF'} : vérifiez chaque champ avant d'enregistrer.`
	},
	nothingLeftOut: {
		en: 'Nothing was left out, but the reading can still be wrong.',
		fr: "Rien n'a été laissé de côté, mais la lecture peut tout de même être inexacte."
	},
	/** The import's remarks are the API's sentences, kept in the language the page had then */
	warningsOtherLanguage: {
		en: "This import's remarks were written in the site's other language and are not shown.",
		fr: "Les remarques de cet import ont été rédigées dans l'autre langue du site et ne sont pas affichées."
	},
	discardImportQuestion: {
		en: 'Discard this import? It still counts as one of your imports.',
		fr: 'Abandonner cet import ? Il compte tout de même parmi vos imports.'
	},
	discardImport: { en: 'Discard import', fr: "Abandonner l'import" },
	/** The other answer to "Discard…?" */
	keepIt: { en: 'Keep it', fr: 'Conserver' },

	// --- The restored draft -------------------------------------------------------------------

	restored: {
		en: 'Restored your unsaved changes from this browser.',
		fr: 'Vos modifications non enregistrées ont été restaurées depuis ce navigateur.'
	},
	/** After `restored`, when the posting was saved since the draft was made */
	restoredStale: {
		en: 'This job description was saved since you made them: check them before saving.',
		fr: "Cette offre d'emploi a été enregistrée depuis que vous les avez faites : vérifiez-les avant d'enregistrer."
	},
	discardChangesQuestion: {
		en: 'Discard your changes and go back to the saved job description?',
		fr: "Abandonner vos modifications et revenir à l'offre d'emploi enregistrée ?"
	},
	discardDraftQuestion: { en: 'Discard this draft?', fr: 'Abandonner ce brouillon ?' },
	discard: { en: 'Discard', fr: 'Abandonner' },
	discardDraft: { en: 'Discard draft', fr: 'Abandonner le brouillon' },
	/** Announced to screen readers */
	draftDiscarded: { en: 'Draft discarded.', fr: 'Brouillon abandonné.' },

	// --- Errors -------------------------------------------------------------------------------

	/** Announced to screen readers when a save stops on the form's errors */
	fieldsToFix: {
		en: (count: number) =>
			count === 1
				? '1 field needs fixing before saving.'
				: `${count} fields need fixing before saving.`,
		fr: (count: number) =>
			plural(
				count,
				`${count} champ est à corriger avant d'enregistrer.`,
				`${count} champs sont à corriger avant d'enregistrer.`
			)
	},
	/** Title of the error summary */
	problemsToFix: {
		en: (count: number) =>
			count === 1 ? 'Fix 1 problem before saving:' : `Fix ${count} problems before saving:`,
		fr: (count: number) =>
			`Corrigez ${count} ${plural(count, 'problème', 'problèmes')} avant d'enregistrer :`
	},
	/**
	 * A line of the error summary. English: the field's name, then what is wrong with it. French:
	 * the message alone, since every French rule names its field ("Durée : indiquez...")
	 */
	fieldProblem: {
		en: (label: string, message: string) => `${label}: ${message}`,
		fr: (_label: string, message: string) => message
	},
	networkError: {
		en: 'Could not reach the server. Check your connection and try again.',
		fr: 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.'
	},
	sessionExpired: {
		en: 'Your session expired. Sign in again (top of the page), then save: your changes are kept in this browser.',
		fr: 'Votre session a expiré. Reconnectez-vous (en haut de la page), puis enregistrez : vos modifications sont conservées dans ce navigateur.'
	},
	noRecruiterSpace: {
		en: 'This account has no recruiter space yet. Open the recruiter space to create it, then come back to save: your changes are kept in this browser.',
		fr: "Ce compte n'a pas encore d'espace recruteur. Ouvrez l'espace recruteur pour le créer, puis revenez enregistrer : vos modifications sont conservées dans ce navigateur."
	},
	openRecruiterSpace: { en: 'Open the recruiter space', fr: "Ouvrir l'espace recruteur" },
	/** The API refused the save: the recruiter has not accepted the terms in force (422 on consent) */
	termsRequired: {
		en: 'Accept the terms of use in force to save: open the recruiter space to accept them, then come back to save. Your changes are kept in this browser.',
		fr: "Acceptez les conditions d'utilisation en vigueur pour enregistrer : ouvrez l'espace recruteur pour les accepter, puis revenez enregistrer. Vos modifications sont conservées dans ce navigateur."
	},
	cannotSave: {
		en: 'You cannot save this job description.',
		fr: "Vous ne pouvez pas enregistrer cette offre d'emploi."
	},
	gone: {
		en: 'This job description no longer exists: it may have been deleted in another tab.',
		fr: "Cette offre d'emploi n'existe plus : elle a peut-être été supprimée dans un autre onglet."
	},
	backToJobs: { en: 'Back to your job descriptions', fr: "Retour à vos offres d'emploi" },
	changedSince: {
		en: 'This job description was changed since you opened it (in another tab, or its status from its page). Your changes are kept in this browser: reload to see the saved version, with your changes over it to check.',
		fr: "Cette offre d'emploi a été modifiée depuis que vous l'avez ouverte (dans un autre onglet, ou son statut depuis sa page). Vos modifications sont conservées dans ce navigateur : rechargez pour voir la version enregistrée, avec vos modifications par-dessus, à vérifier."
	},
	reload: { en: 'Reload', fr: 'Recharger' },
	tooManyJobs: {
		en: 'You have too many job descriptions: delete one to add another.',
		fr: "Vous avez trop d'offres d'emploi : supprimez-en une pour en ajouter une autre."
	},
	tooLarge: {
		en: 'This job description is too large: shorten the description and try again.',
		fr: "Cette offre d'emploi est trop volumineuse : raccourcissez la description et réessayez."
	},
	invalidFields: {
		en: 'Some fields are invalid. Check them and try again.',
		fr: 'Certains champs sont invalides. Vérifiez-les et réessayez.'
	},
	saveFailed: {
		en: 'Could not save the job description. Try again in a moment.',
		fr: "Impossible d'enregistrer l'offre d'emploi. Réessayez dans un instant."
	},
	savedPageNotOpened: {
		en: 'The job description is saved, but its page could not be opened.',
		fr: "L'offre d'emploi est enregistrée, mais sa page n'a pas pu être ouverte."
	},
	goToJobs: { en: 'Go to your job descriptions', fr: "Aller à vos offres d'emploi" },

	/** The toast of a save that failed after the recruiter left the editor */
	leftToast: {
		notCreated: {
			en: 'The job description was not created',
			fr: "L'offre d'emploi n'a pas été créée"
		},
		notSaved: {
			en: 'Your changes were not saved',
			fr: "Vos modifications n'ont pas été enregistrées"
		},
		sessionExpired: {
			en: 'Your session expired: sign in again, then open the editor to save. Your changes are kept in this browser.',
			fr: "Votre session a expiré : reconnectez-vous, puis ouvrez l'éditeur pour enregistrer. Vos modifications sont conservées dans ce navigateur."
		},
		failed: {
			en: 'Open the editor again to see why and save: your changes are kept in this browser.',
			fr: "Rouvrez l'éditeur pour voir pourquoi et enregistrer : vos modifications sont conservées dans ce navigateur."
		},
		openEditor: { en: 'Open the editor', fr: "Ouvrir l'éditeur" }
	},

	// --- The form -----------------------------------------------------------------------------

	/** `<star>`: the mark itself; `<spoken>`: how screen readers hear it */
	requiredNote: {
		en: 'Fields marked <star>*</star><spoken>with a star</spoken> are required.',
		fr: "Les champs marqués <star>*</star><spoken>d'une étoile</spoken> sont obligatoires."
	},
	sections: {
		basics: { en: 'Basics', fr: "L'essentiel" },
		description: { en: 'Description', fr: 'Description' },
		location: { en: 'Location', fr: 'Lieu' },
		contract: { en: 'Contract', fr: 'Contrat' },
		workingTime: { en: 'Working time', fr: 'Temps de travail' },
		pay: { en: 'Pay', fr: 'Rémunération' },
		team: { en: 'Team & organisation', fr: 'Équipe et organisation' },
		requirements: { en: 'Requirements', fr: 'Profil recherché' },
		conditions: { en: 'Conditions', fr: 'Conditions' }
	},
	/** A placeholder showing a value that reads the same in both languages: 'e.g. Lyon' */
	example: {
		en: (value: string) => `e.g. ${value}`,
		fr: (value: string) => `ex. : ${value}`
	},
	/** A select's first option: nothing chosen */
	notSpecified: { en: 'Not specified', fr: 'Non précisé' },

	titlePlaceholder: {
		en: 'e.g. Senior backend engineer',
		fr: 'ex. : Développeur backend senior'
	},
	companyHint: {
		en: 'Leave it empty to keep the company anonymous.',
		fr: "Laissez vide pour ne pas nommer l'entreprise."
	},
	/** After the number of openings */
	positions: { en: 'positions', fr: 'postes' },
	descriptionIntro: {
		en: 'The job, its team and its missions, as candidates will read them.',
		fr: 'Le poste, son équipe et ses missions, tels que les candidats les liront.'
	},
	/** Markdown, like the description it shows the shape of */
	descriptionPlaceholder: {
		en: '## The job\n\nWhat the role is about, the team, the stack…\n\n## Your missions\n\n- …',
		fr: '## Le poste\n\nEn quoi consiste le poste, son équipe, ses technologies…\n\n## Vos missions\n\n- …'
	},
	cityOptional: {
		en: 'Optional for a fully remote job.',
		fr: 'Facultative pour un poste entièrement en télétravail.'
	},
	addressHint: {
		en: "The office's street and number, if you can share it. If a list of addresses opens as you type, pick yours in it. A candidate's travel time is counted to it, or to the city's centre without it.",
		fr: "Le numéro et la rue du bureau, si vous pouvez les indiquer. Si une liste d'adresses s'ouvre pendant la saisie, choisissez-y la vôtre. Le temps de trajet d'un candidat est calculé jusqu'à cette adresse, ou jusqu'au centre de la ville sans elle."
	},
	/** An option of the remote days: '2 days a week' */
	daysAWeek: {
		en: (days: number) => `${days} ${plural(days, 'day', 'days')} a week`,
		fr: (days: number) => `${days} ${plural(days, 'jour', 'jours')} par semaine`
	},
	country: { en: 'Country', fr: 'Pays' },
	countryHint: {
		en: 'Only jobs in France for now.',
		fr: "Uniquement des postes en France pour l'instant."
	},
	/** After a duration or a trial period */
	months: { en: 'months', fr: 'mois' },
	durationOptional: {
		en: 'Optional for a freelance mission.',
		fr: 'Facultative pour une mission freelance.'
	},
	startDateHint: {
		en: 'Leave it empty for as soon as possible.',
		fr: 'Laissez vide pour « dès que possible ».'
	},
	/** The button next to the start date; `<spoken>`: the rest, for screen readers */
	clearStartDate: {
		en: 'Clear<spoken> the start date (as soon as possible)</spoken>',
		fr: 'Effacer<spoken> la date de début (dès que possible)</spoken>'
	},
	/** Label of the working time arrangement: hours per week, or days per year */
	countedIn: { en: 'Counted in', fr: 'Décompté en' },
	/** After the hours per week */
	hoursUnit: { en: 'h / week', fr: 'h / semaine' },
	hoursHint: {
		en: '35 h is full time in France; less is part-time.',
		fr: '35 h : le temps plein en France ; en dessous, un temps partiel.'
	},
	/** After a number of days per year */
	daysPerYearUnit: { en: 'days / year', fr: 'jours / an' },
	/** The same unit as screen readers hear it */
	daysPerYearSpoken: { en: 'days per year', fr: 'jours par an' },
	forfaitHint: {
		en: (days: number) =>
			`${days} days is the standard forfait jours. Candidates read it as counted in days worked, with no weekly hours.`,
		fr: (days: number) =>
			`${days} jours : le forfait jours habituel, décompté en jours travaillés, sans horaire hebdomadaire.`
	},
	/** Label of the RTT days (the unit says "per year") */
	rttDays: { en: 'RTT days', fr: 'Jours de RTT' },
	rttHint: {
		en: 'Reduced working time days, if any. Candidates read them as extra days off a year.',
		fr: "Jours de réduction du temps de travail, s'il y en a : des jours de repos en plus dans l'année."
	},
	payIntro: {
		en: 'Gross amounts (brut) in euros. The same minimum and maximum for a fixed pay.',
		fr: 'Montants bruts en euros. Le même minimum et le même maximum pour une rémunération fixe.'
	},
	/**
	 * Under the pay's intro: how wide a range can be (`ratio`: JOB_LIMITS.pay.maxRangeRatio), and
	 * how a candidate's pay criterion is matched in it (`top`: the share at the top of the range
	 * that matches only partly, in percent; PAY_MATCH)
	 */
	payScoredInRange: {
		en: (ratio: number, top: number) =>
			`The maximum can be up to ${ratio.toLocaleString('en-GB')} times the minimum. A candidate's pay criterion matches when what they ask is below the top ${top}% of your range, and less and less from there.`,
		fr: (ratio: number, top: number) =>
			`Le maximum peut aller jusqu'à ${ratio.toLocaleString('fr-FR')} fois le minimum. Le critère de rémunération d'un candidat correspond quand sa demande est sous les ${top} % supérieurs de votre fourchette, et de moins en moins au-delà.`
	},
	/** How screen readers hear the unit of a pay amount (€) */
	eurosGross: { en: 'euros, gross', fr: 'euros, brut' },
	/** Before the pay as candidates read it */
	candidatesSee: { en: 'Candidates see:', fr: 'Les candidats voient :' },
	variablePayHint: {
		en: 'Bonus, commission, profit-sharing… in a few words.',
		fr: 'Prime, commission, intéressement… en quelques mots.'
	},
	variablePayPlaceholder: {
		en: 'e.g. Up to 10% annual bonus',
		fr: "ex. : Prime annuelle jusqu'à 10 %"
	},
	teamIntro: {
		en: 'Where the job sits: candidates often ask.',
		fr: "La place du poste dans l'organisation : les candidats la demandent souvent."
	},
	directReportsHint: {
		en: 'People reporting to this job.',
		fr: 'Personnes rattachées à ce poste.'
	},
	/** Label of the peers (the hint says who they are) */
	peers: { en: 'Peers', fr: 'Pairs' },
	peersHint: {
		en: 'Colleagues under the same manager.',
		fr: 'Collègues sous le même responsable.'
	},
	levelsHint: {
		en: '1 = reports to the CEO.',
		fr: '1 = rattaché à la direction générale.'
	},
	languagePlaceholder: { en: 'e.g. English (C1)', fr: 'ex. : Anglais (C1)' },
	benefitPlaceholder: { en: 'e.g. Meal vouchers', fr: 'ex. : Titres-restaurant' },

	// --- The action bar -----------------------------------------------------------------------

	saved: { en: 'Saved', fr: 'Enregistré' },
	/** Announced to screen readers */
	savedAnnouncement: { en: 'Saved.', fr: 'Enregistré.' },
	unsavedChanges: { en: 'Unsaved changes', fr: 'Modifications non enregistrées' },
	noChanges: { en: 'No changes yet', fr: "Aucune modification pour l'instant" },
	/** After `unsavedChanges` */
	keptInBrowser: { en: '· kept in this browser', fr: '· conservées dans ce navigateur' },
	create: { en: 'Create job description', fr: "Créer l'offre" },
	saveChanges: { en: 'Save changes', fr: 'Enregistrer' }
});
