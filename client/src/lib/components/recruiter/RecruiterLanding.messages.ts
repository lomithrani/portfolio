// /recruiter for a visitor who is not signed in: what the recruiter space is for, and its sign-in
// (the age and terms box first, then Google's button). It sells the value of skills: on a
// portfolio a skill comes with the projects it was used in and their length (the experiences
// page's filters, previews and timeline). Keep the copy to what the code does: there is no search
// of portfolios, by skill or otherwise (a recruiter opens the portfolio a candidate shared), and a
// job is shared on a candidate's page for recruiters only when their journey has a job step.
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	title: {
		en: 'See where a candidate used each skill, and for how long',
		fr: 'Voyez où un candidat a utilisé chaque compétence, et pendant combien de temps'
	},
	lead: {
		en: "On Portfolio, a skill is not a keyword: it comes with the projects it was used in, and for how long. When a candidate's page for recruiters asks for a job, share yours there, and book a meeting once you have been through their steps.",
		fr: "Sur Portfolio, une compétence n'est pas un mot-clé : elle vient avec les projets où elle a servi, et leur durée. Lorsque la page recruteurs d'un candidat demande une offre, partagez-y la vôtre, et réservez un rendez-vous une fois ses étapes franchies."
	},
	/**
	 * Backed by: the Terms of use (#service: free for recruiters for now, told before any paid
	 * feature applies to them, charged nothing they did not agree to): never "free forever"; one
	 * account holds both spaces (USER_MODES of common/models/account.ts, the account menu)
	 */
	free: {
		en: 'Free for recruiters today: you would be told before any paid feature applied to you. The same Google account can also hold your own portfolio, as a candidate: switch spaces from the account menu.',
		fr: "Gratuit pour les recruteurs aujourd'hui : vous seriez prévenu avant qu'une fonction payante ne s'applique à vous. Avec le même compte Google, vous pouvez aussi avoir votre propre portfolio de candidat : changez d'espace depuis le menu du compte."
	},
	/** In place of Google's button until the age and terms box is ticked */
	tickToContinue: { en: 'Tick the box to continue', fr: 'Cochez la case pour continuer' },
	/** Google's button clicked once the box was unticked */
	tickToSignIn: { en: 'Tick the box to sign in.', fr: 'Cochez la case pour vous connecter.' },
	welcome: {
		title: { en: 'Welcome to your recruiter space', fr: 'Bienvenue dans votre espace recruteur' },
		description: {
			en: 'Write your first job description.',
			fr: "Rédigez votre première offre d'emploi."
		}
	},
	/** What a portfolio says about a skill: the heart of the page */
	skills: {
		title: {
			en: 'Skills you can check, not just read',
			fr: 'Des compétences à vérifier, pas seulement à lire'
		},
		where: {
			title: { en: 'Where it was used', fr: 'Où elle a servi' },
			text: {
				en: "Pick a skill on a candidate's portfolio: the projects that used it stand out, each with its company and its dates.",
				fr: "Choisissez une compétence sur le portfolio d'un candidat : les projets qui y ont fait appel ressortent, chacun avec son entreprise et ses dates."
			}
		},
		howLong: {
			title: { en: 'For how long', fr: 'Pendant combien de temps' },
			text: {
				en: 'The time those projects add up to, month by month: “Used in 5 projects (5 years 3 months)”.',
				fr: 'La durée cumulée de ces projets, mois par mois : « Utilisée dans 5 projets (5 ans 3 mois) ».'
			}
		},
		when: {
			title: { en: 'How recently', fr: 'À quand elle remonte' },
			text: {
				en: "Switch to the timeline: a skill from last year's project and one from ten years ago do not look the same.",
				fr: "Passez à la frise chronologique : une compétence utilisée l'an dernier et une autre d'il y a dix ans ne se ressemblent pas."
			}
		},
		example: {
			en: 'See it on <example>an example</example>.',
			fr: 'Voyez-le sur <example>un exemple</example>.'
		}
	},
	features: {
		/**
		 * Backed by: JobPostingInput of common/models/jobPosting.ts and JOB_FIELD_CRITERIA of
		 * common/models/perfectJob.ts (the fields the criteria read)
		 */
		job: {
			title: { en: 'Say exactly what you need', fr: 'Dites exactement ce que vous cherchez' },
			text: {
				en: 'Skills, contract, working time, pay range, remote days: the facts candidates look for, and the ones their portfolio can check your job against.',
				fr: 'Compétences, contrat, temps de travail, fourchette de rémunération, télétravail : ce que les candidats regardent, et ce à quoi leur portfolio peut comparer votre offre.'
			}
		},
		/**
		 * Backed by: the job step and the job match step (server/services/workflowSteps/job.ts,
		 * jobMatch.ts: the score and, with the candidate's showDetails, each criterion's outcome),
		 * only on a journey that has them; the meeting opens once the steps before it succeeded
		 * (openStepOfType of server/services/workflows.ts). What is checked is only what the
		 * candidate rated: never "no call about pay"
		 */
		match: {
			title: { en: 'A match before the meeting', fr: 'Une correspondance avant le rendez-vous' },
			text: {
				en: "Share your job on a candidate's page for recruiters and, when their journey scores it, see how it does against their criteria. When it passes, book a meeting in their calendar: what they asked for was checked before the call.",
				fr: "Partagez votre offre sur la page recruteurs d'un candidat et, lorsque son parcours la note, voyez son résultat selon ses critères. Si elle passe, réservez un rendez-vous dans son agenda : ce qu'il demande a été vérifié avant l'appel."
			}
		},
		/** Backed by: GET /appointments/booked (server/services/bookedMeetings.ts), UpcomingMeetings.svelte */
		meetings: {
			title: { en: 'Your meetings in one place', fr: 'Vos rendez-vous au même endroit' },
			text: {
				en: "The meetings you book on candidates' pages for recruiters while signed in are listed in your recruiter space, with the link to join those held on Google Meet.",
				fr: 'Les rendez-vous que vous réservez connecté sur la page recruteurs des candidats sont listés dans votre espace recruteur, avec le lien pour rejoindre ceux qui ont lieu sur Google Meet.'
			}
		},
		pdf: {
			title: { en: 'Start from a PDF', fr: "Partez d'un PDF" },
			text: {
				en: (imports: number) =>
					`Where PDF import is offered, Claude drafts the job description from your file for you to complete. The free plan includes ${imports} imports.`,
				fr: (imports: number) =>
					`Lorsque l'import de PDF est proposé, Claude rédige à partir de votre fichier un brouillon de l'offre, que vous complétez. La formule gratuite comprend ${imports} imports.`
			}
		}
	}
});
