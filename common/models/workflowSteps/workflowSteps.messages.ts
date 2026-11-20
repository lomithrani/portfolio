import { defineMessages } from '../../i18n';

// The step types of the hiring journey, one group each: the name and the description of their
// manifest, and what their parseConfig says of settings it refuses.
export const workflowStepMessages = defineMessages({
	note: {
		label: { en: 'Read a note', fr: 'Lire une note' },
		description: {
			en: 'Recruiters read a note you wrote (what you are looking for, your conditions) and confirm it before going further.',
			fr: "Les recruteurs lisent une note que vous avez écrite (ce que vous recherchez, vos conditions) et la confirment avant d'aller plus loin."
		},
		titleRequired: { en: 'Give the note a title.', fr: 'Donnez un titre à la note.' },
		titleTooLong: {
			en: (max: number) => `The title is at most ${max} characters.`,
			fr: (max: number) => `Utilisez ${max} caractères au maximum pour le titre.`
		},
		textRequired: {
			en: 'Write the note recruiters will read.',
			fr: 'Écrivez la note que les recruteurs liront.'
		},
		textTooLong: {
			en: (max: number) => `The note is at most ${max} characters.`,
			fr: (max: number) => `Utilisez ${max} caractères au maximum pour la note.`
		}
	},
	job: {
		label: { en: 'Select or create a job', fr: 'Choisir ou créer une offre' },
		description: {
			en: 'Recruiters pick one of their open job descriptions, or write a new one, before going further. You find it in the meeting invitation.',
			fr: "Les recruteurs choisissent l'une de leurs offres d'emploi ouvertes, ou en rédigent une nouvelle, avant d'aller plus loin. Vous la retrouvez dans l'invitation au rendez-vous."
		}
	},
	jobMatch: {
		/**
		 * What recruiters read too (the step's heading on the page for recruiters, "Before you start",
		 * the page's description in a link preview): neutral, never "the perfect job", which would
		 * say the owner is looking for one. The owner-only description names the perfect job
		 */
		label: { en: 'Get the job scored', fr: "Faire noter l'offre" },
		description: {
			en: 'The job the recruiter picked is scored out of 100 against your perfect job (the Perfect job tab). Under the minimum you set, they cannot go further.',
			fr: "L'offre choisie par le recruteur est notée sur 100 par rapport à votre poste idéal (onglet Poste idéal). En dessous de la note minimale que vous fixez, il ne peut pas aller plus loin."
		},
		minScore: {
			en: (min: number, max: number) =>
				`The minimum score is a whole number from ${min} to ${max}.`,
			fr: (min: number, max: number) =>
				`La note minimale est un nombre entier de ${min} à ${max}.`
		}
	},
	meeting: {
		label: { en: 'Book a meeting', fr: 'Réserver un rendez-vous' },
		description: {
			en: 'Recruiters book a slot in your calendar, with the appointment schedules of the Appointments tab.',
			fr: "Les recruteurs réservent un créneau dans votre agenda, parmi les agendas de rendez-vous de l'onglet Rendez-vous."
		}
	}
});
