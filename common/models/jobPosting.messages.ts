import { defineMessages } from '../i18n';

// The rules of a posting name the field they are about, since the editor also lists them away
// from it. In French the field's name comes first ("Durée : indiquez..."), which reads well for
// every field whatever its gender and number.

/** A text that is too long */
const tooLong = (en: string, fr: string) => ({
	en: (max: number) => `${en} must be at most ${max} characters`,
	fr: (max: number) => `${fr} : utilisez ${max} caractères au maximum`
});

/** A number that is not a whole one, or out of its range */
const wholeNumber = (en: string, fr: string) => ({
	en: (min: number, max: number) => `${en} must be a whole number from ${min} to ${max}`,
	fr: (min: number, max: number) => `${fr} : indiquez un nombre entier de ${min} à ${max}`
});

/** A pay amount that is not one */
const amount = (en: string, fr: string) => ({
	en: `${en} must be a positive amount (at most 2 decimals)`,
	fr: `${fr} : indiquez un montant positif (2 décimales au maximum)`
});

/** A list with too many items, or an item that is too long */
const list = (en: string, fr: string) => ({
	tooMany: {
		en: (max: number) => `${en}: at most ${max}`,
		fr: (max: number) => `${fr} : ${max} au maximum`
	},
	itemTooLong: {
		en: (max: number) => `${en}: each one must be at most ${max} characters`,
		fr: (max: number) => `${fr} : utilisez ${max} caractères au maximum par élément`
	}
});

export const jobPostingMessages = defineMessages({
	// ── Display ─────────────────────────────────────────────────

	status: {
		draft: { en: 'Draft', fr: 'Brouillon' },
		open: { en: 'Open', fr: 'Ouverte' },
		on_hold: { en: 'On hold', fr: 'En pause' },
		filled: { en: 'Filled', fr: 'Pourvue' },
		closed: { en: 'Closed', fr: 'Fermée' }
	},
	workMode: {
		on_site: { en: 'On site', fr: 'Sur site' },
		hybrid: { en: 'Hybrid', fr: 'Hybride' },
		remote: { en: 'Full remote', fr: 'Télétravail complet' }
	},
	country: {
		FR: { en: 'France', fr: 'France' }
	},
	/** French contracts: the English names the French one, the French needs no translation */
	contractType: {
		cdi: { en: 'CDI (permanent)', fr: 'CDI' },
		cdd: { en: 'CDD (fixed-term)', fr: 'CDD' },
		interim: { en: 'Temporary (intérim)', fr: 'Intérim' },
		apprenticeship: { en: 'Apprenticeship (apprentissage)', fr: 'Alternance (apprentissage)' },
		professionalisation: {
			en: 'Work-study (professionnalisation)',
			fr: 'Alternance (professionnalisation)'
		},
		internship: { en: 'Internship (stage)', fr: 'Stage' },
		freelance: { en: 'Freelance', fr: 'Freelance' }
	},
	workingTime: {
		weekly_hours: { en: 'Hours per week', fr: 'Heures par semaine' },
		annual_days: { en: 'Days per year (forfait jours)', fr: 'Jours par an (forfait jours)' }
	},
	/** After an amount: "45,000 € per year" */
	payPeriod: {
		year: { en: 'per year', fr: 'par an' },
		month: { en: 'per month', fr: 'par mois' },
		day: { en: 'per day', fr: 'par jour' },
		hour: { en: 'per hour', fr: 'par heure' }
	},
	seniority: {
		entry: { en: 'Entry level', fr: 'Débutant' },
		junior: { en: 'Junior (0-2 years)', fr: 'Junior (0 à 2 ans)' },
		mid: { en: 'Mid-level (2-5 years)', fr: 'Confirmé (2 à 5 ans)' },
		senior: { en: 'Senior (5-10 years)', fr: 'Senior (5 à 10 ans)' },
		lead: { en: 'Lead / Principal (10+ years)', fr: 'Lead / Principal (10 ans et plus)' },
		executive: { en: 'Executive', fr: 'Cadre dirigeant' }
	},
	/** French education levels: most of them are names, the same in both languages */
	education: {
		none: { en: 'No diploma required', fr: 'Aucun diplôme requis' },
		cap_bep: { en: 'CAP / BEP', fr: 'CAP / BEP' },
		bac: { en: 'Bac', fr: 'Bac' },
		bac_2: { en: 'Bac+2', fr: 'Bac+2' },
		bac_3: { en: 'Bac+3 (Licence)', fr: 'Bac+3 (Licence)' },
		bac_5: { en: 'Bac+5 (Master)', fr: 'Bac+5 (Master)' },
		doctorate: { en: 'Doctorate', fr: 'Doctorat' }
	},
	travel: {
		none: { en: 'No travel', fr: 'Aucun déplacement' },
		occasional: { en: 'Occasional travel', fr: 'Déplacements occasionnels' },
		frequent: { en: 'Frequent travel', fr: 'Déplacements fréquents' }
	},

	// ── Validation (validateJobPosting) ─────────────────────────

	problems: {
		titleRequired: { en: 'Title is required', fr: "Indiquez l'intitulé du poste" },
		descriptionRequired: { en: 'Description is required', fr: 'Rédigez la description du poste' },
		unknownStatus: { en: 'Unknown status', fr: 'Statut inconnu' },
		unsupportedCountry: {
			en: 'Only jobs in France are supported for now',
			fr: 'Seules les offres en France sont prises en charge pour le moment'
		},
		unknownWorkMode: { en: 'Unknown work mode', fr: 'Mode de travail inconnu' },
		cityRequired: {
			en: 'City is required unless the job is fully remote',
			fr: 'Indiquez la ville, sauf si le poste est entièrement en télétravail'
		},
		invalidPostalCode: { en: 'Postal code is not valid', fr: "Ce code postal n'est pas valide" },
		unknownContractType: { en: 'Unknown contract type', fr: 'Type de contrat inconnu' },
		durationRequired: {
			en: 'Duration is required for this contract',
			fr: 'Indiquez la durée de ce contrat'
		},
		startDate: {
			en: (minYear: number, maxYear: number) =>
				`Start date must be a date (YYYY-MM-DD) from ${minYear} to ${maxYear}`,
			fr: (minYear: number, maxYear: number) =>
				`Date de début : indiquez une date (AAAA-MM-JJ) de ${minYear} à ${maxYear}`
		},
		unknownWorkingTime: {
			en: 'Unknown working time arrangement',
			fr: 'Décompte du temps de travail inconnu'
		},
		hoursPerWeekRequired: {
			en: 'Hours per week are required',
			fr: 'Indiquez les heures par semaine'
		},
		hoursPerWeek: {
			en: (min: number, max: number) =>
				`Hours per week must be from ${min} to ${max} (half hours allowed)`,
			fr: (min: number, max: number) =>
				`Heures par semaine : indiquez un nombre de ${min} à ${max} (demi-heures acceptées)`
		},
		daysPerYearRequired: { en: 'Days per year are required', fr: 'Indiquez les jours par an' },
		payMaxBelowMin: {
			en: 'Maximum pay must not be below the minimum',
			fr: 'La rémunération maximale ne peut pas être inférieure à la minimale'
		},
		/**
		 * `ratio`: JOB_LIMITS.pay.maxRangeRatio; `most`: the highest maximum this minimum allows,
		 * formatted ('€67,500')
		 */
		payRangeTooWide: {
			en: (ratio: number, most: string) =>
				`Maximum pay must be at most ${most} (${ratio.toLocaleString('en-GB')} times the minimum)`,
			fr: (ratio: number, most: string) =>
				`Rémunération maximale : indiquez ${most} au maximum (${ratio.toLocaleString('fr-FR')} fois la minimale)`
		},
		unknownCurrency: { en: 'Unknown currency', fr: 'Devise inconnue' },
		unknownPayPeriod: { en: 'Unknown pay period', fr: 'Période de rémunération inconnue' },
		unknownSeniority: { en: 'Unknown seniority', fr: "Niveau d'expérience inconnu" },
		unknownEducation: { en: 'Unknown education level', fr: "Niveau d'études inconnu" },
		unknownTravel: { en: 'Unknown travel frequency', fr: 'Fréquence de déplacement inconnue' },
		tooLong: {
			title: tooLong('Title', 'Intitulé'),
			description: tooLong('Description', 'Description'),
			company: tooLong('Company', 'Entreprise'),
			city: tooLong('City', 'Ville'),
			address: tooLong('Address', 'Adresse'),
			collectiveAgreement: tooLong('Collective agreement', 'Convention collective'),
			variablePay: tooLong('Variable pay', 'Rémunération variable')
		},
		wholeNumber: {
			openings: wholeNumber('Openings', 'Nombre de postes'),
			remoteDaysPerWeek: wholeNumber('Remote days per week', 'Jours de télétravail par semaine'),
			durationMonths: wholeNumber('Duration', 'Durée'),
			trialPeriodMonths: wholeNumber('Trial period', "Période d'essai"),
			daysPerYear: wholeNumber('Days per year', 'Jours par an'),
			rttDaysPerYear: wholeNumber('RTT days per year', 'Jours de RTT par an'),
			directReports: wholeNumber('Direct reports', 'Personnes encadrées'),
			peers: wholeNumber('Peers', 'Pairs'),
			levelsToCeo: wholeNumber('Levels to the CEO', "Niveaux jusqu'à la direction générale")
		},
		amount: {
			min: amount('Minimum pay', 'Rémunération minimale'),
			max: amount('Maximum pay', 'Rémunération maximale')
		},
		list: {
			skills: list('Skills', 'Compétences'),
			languages: list('Languages', 'Langues'),
			benefits: list('Benefits', 'Avantages')
		}
	}
});
