import { defineMessages } from '../i18n';

/**
 * A number that is not a whole one, or out of its range. English names the setting first; French
 * says what is counted (`fr`: "de jours"), since the tab's summary puts the criterion's name first
 */
const wholeNumber = (en: string, fr: string) => ({
	en: (min: number, max: number) => `${en} must be a whole number from ${min} to ${max}.`,
	fr: (min: number, max: number) => `Indiquez un nombre entier ${fr}, de ${min} à ${max}.`
});

/** A pay asked that is not a whole number of euros */
const euros = (en: string, fr: string) => ({
	en: `${en} must be a whole number of euros, above 0.`,
	fr: `Indiquez un nombre entier d'euros ${fr}, supérieur à 0.`
});

export const perfectJobMessages = defineMessages({
	// ── Display ─────────────────────────────────────────────────

	/** How much a criterion matters, from 1 to 5 */
	importance: {
		1: { en: 'Nice to have', fr: 'Un plus' },
		2: { en: 'Matters a little', fr: 'Compte un peu' },
		3: { en: 'Important', fr: 'Important' },
		4: { en: 'Very important', fr: 'Très important' },
		5: { en: 'Essential', fr: 'Essentiel' }
	},
	/** A criterion's name, for the owner's editor and for the recruiter reading their job's score */
	criterion: {
		titles: { en: 'Job title', fr: 'Intitulé du poste' },
		seniority: { en: 'Seniority', fr: "Niveau d'expérience" },
		management: { en: 'Management', fr: 'Management' },
		workMode: { en: 'Work mode', fr: 'Mode de travail' },
		cities: { en: 'Location', fr: 'Lieu' },
		commute: { en: 'Commute', fr: 'Trajet' },
		contractTypes: { en: 'Contract', fr: 'Contrat' },
		workingTime: { en: 'Working time', fr: 'Temps de travail' },
		rttDays: { en: 'RTT days', fr: 'Jours de RTT' },
		pay: { en: 'Pay', fr: 'Rémunération' },
		skills: { en: 'Skills', fr: 'Compétences' },
		avoidedSkills: { en: 'Skills to avoid', fr: 'Compétences à éviter' },
		travel: { en: 'Travel', fr: 'Déplacements' }
	},
	commuteMode: {
		transit: { en: 'Public transport', fr: 'Transports en commun' },
		bike: { en: 'Bike', fr: 'Vélo' },
		car: { en: 'Car', fr: 'Voiture' },
		walk: { en: 'On foot', fr: 'À pied' }
	},
	managementRole: {
		manager: { en: 'Managing people (direct reports)', fr: 'Encadrer une équipe' },
		contributor: { en: 'No direct reports', fr: 'Sans équipe à encadrer' }
	},

	// ── Parsing (parsePerfectJob) ───────────────────────────────

	problems: {
		/** The criteria sent are not an object at all: a client's mistake, not the owner's */
		notAnObject: { en: 'Criteria must be an object.', fr: 'Les critères doivent être un objet.' },
		invalidCriterion: { en: 'This criterion is not valid.', fr: "Ce critère n'est pas valide." },
		importance: {
			en: (min: number, max: number) => `Say how much it matters, from ${min} to ${max}.`,
			fr: (min: number, max: number) => `Indiquez son importance, de ${min} à ${max}.`
		},
		/** The lists a criterion is made of: nothing in it, too many items, an item too long */
		lists: {
			jobTitle: {
				empty: { en: 'Add at least one job title.', fr: 'Ajoutez au moins un intitulé de poste.' },
				tooMany: {
					en: (max: number) => `At most ${max} job titles.`,
					fr: (max: number) => `${max} intitulés de poste au maximum.`
				},
				itemTooLong: {
					en: (max: number) => `Each job title must be at most ${max} characters.`,
					fr: (max: number) => `Utilisez ${max} caractères au maximum par intitulé de poste.`
				}
			},
			place: {
				empty: { en: 'Add at least one place.', fr: 'Ajoutez au moins un lieu.' },
				tooMany: {
					en: (max: number) => `At most ${max} places.`,
					fr: (max: number) => `${max} lieux au maximum.`
				},
				itemTooLong: {
					en: (max: number) => `Each place must be at most ${max} characters.`,
					fr: (max: number) => `Utilisez ${max} caractères au maximum par lieu.`
				}
			},
			skill: {
				empty: { en: 'Add at least one skill.', fr: 'Ajoutez au moins une compétence.' },
				tooMany: {
					en: (max: number) => `At most ${max} skills.`,
					fr: (max: number) => `${max} compétences au maximum.`
				},
				itemTooLong: {
					en: (max: number) => `Each skill must be at most ${max} characters.`,
					fr: (max: number) => `Utilisez ${max} caractères au maximum par compétence.`
				}
			}
		},
		seniorityRequired: {
			en: 'Pick at least one seniority level.',
			fr: "Choisissez au moins un niveau d'expérience."
		},
		managementRequired: {
			en: 'Say whether you want to manage people.',
			fr: 'Indiquez si vous souhaitez encadrer une équipe.'
		},
		workModeRequired: {
			en: 'Pick at least one work mode.',
			fr: 'Choisissez au moins un mode de travail.'
		},
		minRemoteDays: wholeNumber('Remote days a week', 'de jours de télétravail par semaine'),
		commuteFromRequired: {
			en: 'Give the address you would travel from.',
			fr: "Indiquez l'adresse d'où vous partiriez."
		},
		commuteFromTooLong: {
			en: (max: number) => `The address is at most ${max} characters.`,
			fr: (max: number) => `Utilisez ${max} caractères au maximum pour l'adresse.`
		},
		commuteModeRequired: {
			en: 'Pick at least one way of travelling.',
			fr: 'Choisissez au moins un mode de transport.'
		},
		commuteTime: {
			en: 'Give the travel time you accept a week, from 10 minutes to 50 hours.',
			fr: 'Indiquez le temps de trajet que vous acceptez par semaine, de 10 minutes à 50 heures.'
		},
		contractRequired: {
			en: 'Pick at least one contract.',
			fr: 'Choisissez au moins un contrat.'
		},
		workingTimeRequired: {
			en: 'Pick at least one way of counting working time.',
			fr: 'Choisissez au moins un décompte du temps de travail.'
		},
		maxHoursPerWeek: wholeNumber('Hours per week', "d'heures par semaine"),
		rttDays: wholeNumber('RTT days', 'de jours de RTT'),
		payPerYear: euros('Pay per year', 'par an'),
		payPerDay: euros('Pay per day', 'par jour'),
		payRequired: {
			en: 'Give the pay you ask for: per year, per day, or both.',
			fr: 'Indiquez la rémunération que vous demandez : par an, par jour, ou les deux.'
		},
		travelRequired: {
			en: 'Pick how much travel you accept.',
			fr: 'Choisissez la fréquence des déplacements que vous acceptez.'
		}
	}
});
