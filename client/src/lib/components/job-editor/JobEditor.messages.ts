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

	// --- An opened posting's terms -------------------------------------------------------------

	/** The note at the top of the editor of a job description opened before: its terms are locked */
	locked: {
		title: { en: 'Pay and conditions locked', fr: 'Rémunération et conditions verrouillées' },
		text: {
			en: "This job description was opened: its pay and its conditions (the fields with a lock) can no longer be changed, because candidates' matches are computed on them. You can still edit its description and the other fields, and change its status. To change its pay and conditions, duplicate it as a new job description.",
			fr: "Cette offre d'emploi a été ouverte : sa rémunération et ses conditions (les champs marqués d'un cadenas) ne peuvent plus être modifiées, car les correspondances des candidats sont calculées sur elles. Vous pouvez toujours modifier sa description et les autres champs, et changer son statut. Pour modifier sa rémunération et ses conditions, dupliquez-la en une nouvelle offre d'emploi."
		},
		/**
		 * The fields locked (`fields`: their names as a list, 'Job title, City, … and Travel'): a typo
		 * in one of them cannot be fixed either
		 */
		fields: {
			en: (fields: string) => `Locked fields: ${fields}.`,
			fr: (fields: string) => `Champs verrouillés : ${fields}.`
		},
		/**
		 * A range saved wider than `ratio` (JOB_LIMITS.pay.maxRangeRatio) times its minimum, before
		 * that cap: its maximum shows (and is saved) as `amount`, the top it is scored with
		 */
		payCapped: {
			en: (amount: string, ratio: number) =>
				`Its pay range was saved wider than ${ratio.toLocaleString('en-GB')} times its minimum: its maximum shows as ${amount}, the top of the range candidates' matches are computed with, and your next save stores it.`,
			fr: (amount: string, ratio: number) =>
				`Sa fourchette de rémunération a été enregistrée plus large que ${ratio.toLocaleString('fr-FR')} fois sa minimale : sa rémunération maximale s'affiche à ${amount}, le haut de fourchette retenu pour les correspondances des candidats, et votre prochain enregistrement la conservera ainsi.`
		},
		duplicate: { en: 'Duplicate', fr: 'Dupliquer' }
	},
	/**
	 * Above the editor of an opened job description, when the draft kept in this browser changed its
	 * terms before it was opened: they cannot be saved on it, and are kept until the recruiter
	 * duplicates it with them or discards them
	 */
	droppedTerms: {
		title: {
			en: 'Your changes to its pay and conditions cannot be saved',
			fr: 'Vos modifications de sa rémunération et de ses conditions ne peuvent pas être enregistrées'
		},
		text: {
			en: "This job description was opened after you made them in this browser: its pay and its conditions are locked, because candidates' matches are computed on them. Your changes are kept here: duplicate it with your changes to make them a new job description, or discard them.",
			fr: "Cette offre d'emploi a été ouverte après que vous les avez faites dans ce navigateur : sa rémunération et ses conditions sont verrouillées, car les correspondances des candidats sont calculées sur elles. Vos modifications sont conservées ici : dupliquez-la avec vos modifications pour en faire une nouvelle offre d'emploi, ou abandonnez-les."
		},
		/** `fields`: the names of the fields changed, as a list ("Job title and Minimum pay") */
		fields: {
			en: (fields: string) => `Fields changed: ${fields}.`,
			fr: (fields: string) => `Champs modifiés : ${fields}.`
		},
		discard: { en: 'Discard these changes', fr: 'Abandonner ces modifications' },
		/** Announced to screen readers */
		discarded: {
			en: 'Your changes to its pay and conditions were discarded.',
			fr: 'Vos modifications de sa rémunération et de ses conditions ont été abandonnées.'
		}
	},
	/**
	 * Before "Duplicate with my changes" replaces a copy of the job description kept in this browser
	 * with changes of its own (a Duplicate started and left)
	 */
	replaceCopy: {
		title: {
			en: 'Replace your unsaved copy?',
			fr: 'Remplacer votre copie non enregistrée ?'
		},
		text: {
			en: 'This browser already keeps an unsaved copy of this job description, with changes of its own. Duplicating it with the changes made here replaces that copy.',
			fr: "Ce navigateur conserve déjà une copie non enregistrée de cette offre d'emploi, avec ses propres modifications. La dupliquer avec les modifications faites ici remplace cette copie."
		},
		confirm: { en: 'Replace it', fr: 'La remplacer' }
	},

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
		en: 'This job description was saved elsewhere since you started editing it (in another tab, or its status from its page). Your changes are kept in this browser: reload to see the saved version with your changes over it, to check them. Should it have been opened meanwhile, its pay and its conditions are locked: your changes to them are then kept for a duplicate.',
		fr: "Cette offre d'emploi a été enregistrée ailleurs depuis que vous avez commencé à la modifier (dans un autre onglet, ou son statut depuis sa page). Vos modifications sont conservées dans ce navigateur : rechargez pour voir la version enregistrée avec vos modifications par-dessus, à vérifier. Si elle a été ouverte entre-temps, sa rémunération et ses conditions sont verrouillées : vos modifications de celles-ci sont alors conservées pour une copie."
	},
	reload: { en: 'Reload', fr: 'Recharger' },
	/** The API refused the save: the job description was opened, its terms are locked (409) */
	termsLockedOnSave: {
		en: "The pay and the conditions of this job description are locked: it was opened, and candidates' matches are computed on them. Your changes are kept in this browser: reload to see it as it is, with your changes to the other fields over it, or duplicate it with all your changes as a new job description.",
		fr: "La rémunération et les conditions de cette offre d'emploi sont verrouillées : elle a été ouverte, et les correspondances des candidats sont calculées sur elles. Vos modifications sont conservées dans ce navigateur : rechargez pour la voir telle qu'elle est, avec vos modifications des autres champs par-dessus, ou dupliquez-la avec toutes vos modifications en une nouvelle offre d'emploi."
	},
	duplicateWithChanges: {
		en: 'Duplicate with my changes',
		fr: 'Dupliquer avec mes modifications'
	},
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

	// --- Matching (Path 2): a job created open, proposed to candidates --------------------------

	matching: {
		/** The choice, for a job created open (POST /jobs's `matching`) */
		label: { en: 'Propose it to candidates', fr: 'La proposer aux candidats' },
		/**
		 * Backed by: server/services/jobMatching.ts entersMatchingAtCreation (the company and a
		 * description required, sent for review) and matchFeeds.ts (the candidates whose own criteria
		 * it meets)
		 */
		hint: {
			en: 'Candidates whose own criteria it meets see it, and you see their anonymous cards. A reviewer reads it first. It needs the company and a description.',
			fr: "Les candidats dont elle remplit les critères la voient, et vous voyez leur fiche anonyme. Elle est d'abord relue. Elle doit indiquer l'entreprise et comporter une description."
		},
		/** The company's hint while "Propose it to candidates" is ticked (in place of `companyHint`) */
		companyRequired: {
			en: "Required to propose it to candidates: they see the company's name and decide whether they are interested before they know which recruiter you are.",
			fr: "Obligatoire pour la proposer aux candidats : ils voient le nom de l'entreprise et disent s'ils sont intéressés avant de savoir quel recruteur vous êtes."
		},
		/** For a job not created open: the choice comes once it is */
		later: {
			en: 'Once it is open, you can propose it to candidates from its page.',
			fr: 'Une fois ouverte, vous pourrez la proposer aux candidats depuis sa page.'
		},
		/**
		 * The editor of a job description proposed to candidates now (open and accepted), kept open:
		 * its terms are locked, what an edit changes is read again. Backed by:
		 * server/services/matchingReviews.ts reviewSavedWithEdit
		 */
		inMatching: {
			en: 'This job description is proposed to candidates: a change you save sends it back for review before they read it. Their answers and your mutual interests stay.',
			fr: "Cette offre est proposée aux candidats : une modification enregistrée la renvoie en relecture avant qu'ils ne la lisent. Leurs réponses et vos intérêts réciproques restent."
		},
		/** The same, for a job put into matching that is not proposed now (in review, not accepted, on hold) */
		inMatchingWaiting: {
			en: 'You propose this job description to candidates: a change you save is read by a reviewer before any candidate sees it. Their answers and your mutual interests stay.',
			fr: "Vous proposez cette offre aux candidats : une modification enregistrée est relue avant qu'un candidat ne la voie. Leurs réponses et vos intérêts réciproques restent."
		},
		/** 409 of a creation asked in matching (the jobs a recruiter may propose at once): created without it */
		withoutIt: { en: 'Create it without proposing it', fr: 'La créer sans la proposer' }
	},
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
	 * how a candidate's pay criterion is matched in it (`full`: how far up the range an ask still
	 * matches fully, in percent; PAY_MATCH). A fixed pay has no top of the range: up to it matches
	 */
	payScoredInRange: {
		en: (ratio: number, full: number) =>
			`The maximum can be up to ${ratio.toLocaleString('en-GB')} times the minimum. A candidate's pay criterion matches when what they ask is at most ${full}% of the way up your range (at most your pay, when it is fixed), and less and less from there.`,
		fr: (ratio: number, full: number) =>
			`Le maximum peut aller jusqu'à ${ratio.toLocaleString('fr-FR')} fois le minimum. Le critère de rémunération d'un candidat correspond quand sa demande ne dépasse pas les ${full} % inférieurs de votre fourchette (ou votre rémunération, quand elle est fixe), et de moins en moins au-delà.`
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
