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
		 * The headline says who the candidate is: their name (also as their email address writes
		 * it), their portfolio's title or address, a company or a place of their experiences, a place
		 * of their perfect job (cardTextIdentifies, or the address of the site followed by a path):
		 * the card stays anonymous until both sides are interested
		 */
		headlineIdentity: {
			en: 'Leave your name, the title and address of your portfolio, the companies and places of your experiences and the places of your perfect job out of your headline: recruiters read it before they know who you are.',
			fr: "Retirez de votre accroche votre nom, le titre et l'adresse de votre portfolio, les entreprises et les lieux de vos expériences ainsi que les lieux de votre poste idéal : les recruteurs la lisent avant de savoir qui vous êtes."
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
	},
	/**
	 * A recruiter's job refused in matching (PUT /jobs/:id/matching, POST /jobs with `matching`,
	 * PUT /jobs/:id of a job in it): what it lacks (matchingJobProblem), how many jobs can be in it
	 */
	job: {
		/** 422 on `company`: candidates decide before they know who the recruiter is */
		companyRequired: {
			en: 'Name the company: candidates decide whether they are interested before they know who you are.',
			fr: "Indiquez l'entreprise : les candidats disent s'ils sont intéressés avant de savoir qui vous êtes."
		},
		/** 422 on `description` */
		descriptionRequired: {
			en: 'Describe the job: candidates read it before they say whether they are interested.',
			fr: "Décrivez le poste : les candidats lisent l'offre avant de dire s'ils sont intéressés."
		},
		/** 422 on `matching`: a job created as a draft (or on hold) with matching asked for */
		openOnly: {
			en: 'Only an open job can be proposed to candidates: create it open, or propose it once it is.',
			fr: "Seule une offre ouverte peut être proposée aux candidats : créez-la ouverte, ou proposez-la une fois qu'elle l'est."
		},
		/**
		 * 422 on `matching`: a job whose stored version a recruiter could not save today (saved
		 * under rules made tighter since), which matching does not propose until it is saved again
		 */
		saveAgain: {
			en: 'Save this job again in the editor before you propose it to candidates: it was saved under rules that have changed since.',
			fr: "Enregistrez de nouveau cette offre dans l'éditeur avant de la proposer aux candidats : elle a été enregistrée selon des règles qui ont changé depuis."
		},
		/** 422 on `company`: an edit of a job in matching that takes its company out */
		companyKept: {
			en: 'This job is proposed to candidates, so it names its company: stop proposing it before you remove the company.',
			fr: "Cette offre est proposée aux candidats, elle indique donc son entreprise : arrêtez de la proposer avant de retirer l'entreprise."
		},
		/** 409: `max` is MATCHING_LIMITS.matchingJobsPerRecruiter */
		tooMany: {
			en: (max: number) =>
				`You can propose ${max} ${plural(max, 'job', 'jobs')} to candidates at once: stop proposing one to propose another.`,
			fr: (max: number) =>
				`Vous pouvez proposer ${max} ${plural(max, 'offre', 'offres')} aux candidats à la fois : arrêtez d'en proposer une pour en proposer une autre.`
		}
	},
	/** A reviewer's decision refused (PUT /matching/reviews/:jobId, 422 on `reason`) */
	review: {
		reasonRequired: {
			en: 'Say why the job is not accepted: its recruiter reads it.',
			fr: "Dites pourquoi l'offre n'est pas acceptée : son recruteur le lira."
		},
		/** `max`: MATCHING_LIMITS.reviewReason */
		reasonTooLong: {
			en: (max: number) => `The reason can be ${max} characters at most.`,
			fr: (max: number) => `La raison peut faire ${max} caractères au plus.`
		}
	}
});
