import { defineMessages, plural } from '../i18n';

export const matchingMessages = defineMessages({
	/**
	 * What each requirement of discovery asks (DISCOVERY_REQUIREMENTS, matching.ts): the API's 422
	 * on `requirements.<requirement>` when a candidate turns discovery on without it, and the
	 * checklist that shows what is missing
	 */
	requirement: {
		portfolio: {
			en: 'Claim the address of your portfolio first.',
			fr: "Réservez d'abord l'adresse de votre portfolio."
		},
		terms: {
			en: 'Accept the terms of use in force first.',
			fr: "Acceptez d'abord les conditions d'utilisation en vigueur."
		},
		/** `min`: DISCOVERY_MIN_CRITERIA */
		criteria: {
			en: (min: number) =>
				`Switch on at least ${min} ${plural(min, 'criterion', 'criteria')} in your perfect job.`,
			fr: (min: number) =>
				`Activez au moins ${min} ${plural(min, 'critère', 'critères')} dans votre poste idéal.`
		},
		pay: {
			en: 'Say the pay you ask for in your perfect job.',
			fr: 'Indiquez la rémunération que vous demandez dans votre poste idéal.'
		},
		journey: {
			en: 'Your hiring journey must ask for the job, get it scored, then lead to a meeting.',
			fr: "Votre parcours de recrutement doit demander l'offre, la faire noter, puis mener à un rendez-vous."
		},
		calendar: {
			en: 'Connect Google Calendar, so recruiters can book a meeting.',
			fr: 'Connectez Google Agenda pour que les recruteurs puissent réserver un rendez-vous.'
		},
		schedule: {
			en: 'Turn on an appointment schedule that has hours.',
			fr: 'Activez un agenda de rendez-vous qui a des horaires.'
		},
		/** `days`: DISCOVERY_INACTIVITY_DAYS */
		active: {
			en: (days: number) => `Sign in at least once every ${days} days.`,
			fr: (days: number) => `Connectez-vous au moins une fois tous les ${days} jours.`
		}
	},
	/** The settings of the anonymous card refused (PUT /discovery, 422 on `card...`) */
	card: {
		invalid: {
			en: 'The settings of your card could not be read.',
			fr: "Les réglages de votre fiche n'ont pas pu être lus."
		},
		headlineInvalid: {
			en: 'Your headline could not be read.',
			fr: "Votre accroche n'a pas pu être lue."
		},
		headlineTooLong: {
			en: (max: number) => `Your headline can be ${max} characters at most.`,
			fr: (max: number) => `Votre accroche peut faire ${max} caractères au plus.`
		},
		/**
		 * A link, an email address or a phone number in the headline: the card is read before both
		 * sides are interested
		 */
		headlineContact: {
			en: 'Leave links, email addresses and phone numbers out of your headline: recruiters read it before they know who you are.',
			fr: 'Retirez les liens, adresses e-mail et numéros de téléphone de votre accroche : les recruteurs la lisent avant de savoir qui vous êtes.'
		},
		/**
		 * The headline says who the candidate is: their name, their portfolio's title or address, a
		 * company or a place of their experiences (cardTextIdentifies, or the address of the site
		 * followed by a path): the card stays anonymous until both sides are interested
		 */
		headlineIdentity: {
			en: 'Leave your name, the title and address of your portfolio, and the companies and places of your experiences out of your headline: recruiters read it before they know who you are.',
			fr: "Retirez de votre accroche votre nom, le titre et l'adresse de votre portfolio, ainsi que les entreprises et les lieux de vos expériences : les recruteurs la lisent avant de savoir qui vous êtes."
		},
		hiddenExperiences: {
			en: 'The experiences to hide could not be read.',
			fr: "Les expériences à masquer n'ont pas pu être lues."
		},
		tooManyHidden: {
			en: (max: number) =>
				`You can hide ${max} ${plural(max, 'experience', 'experiences')} at most.`,
			fr: (max: number) =>
				`Vous pouvez masquer ${max} ${plural(max, 'expérience', 'expériences')} au plus.`
		}
	}
});
