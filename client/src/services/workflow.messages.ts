import { defineMessages } from 'portfolio-common';

// The texts of workflow.ts: the owner's journey editor, the Hire page and its steps.
export const m = defineMessages({
	// --- The owner's editor ---
	addStep: {
		journeyFull: {
			en: (max: number) => `A journey has at most ${max} steps.`,
			fr: (max: number) => `Un parcours compte au plus ${max} étapes.`
		},
		usedOnce: {
			en: 'Already in your journey: it can be used only once.',
			fr: "Déjà dans votre parcours : elle ne peut servir qu'une fois."
		},
		usedMax: {
			en: (max: number) => `Already ${max} times in your journey.`,
			fr: (max: number) => `Déjà ${max} fois dans votre parcours.`
		}
	},
	/** The name of a step whose type this version does not have */
	unknownStepName: { en: 'Unavailable step', fr: 'Étape indisponible' },
	summary: {
		empty: {
			en: 'Your page for recruiters offers nothing: recruiters are asked to reach out directly.',
			fr: 'Votre page recruteurs ne propose rien : les recruteurs sont invités à prendre contact directement.'
		},
		/** A step named with its own title: the type's label, lowercased, then the title */
		titled: {
			en: (phrase: string, title: string) => `${phrase} (“${title}”)`,
			fr: (phrase: string, title: string) => `${phrase} (« ${title} »)`
		},
		/** `phrase`: the label of the only step, lowercased ("book a meeting") */
		one: {
			en: (phrase: string) => `Recruiters can ${phrase} right away.`,
			fr: (phrase: string) => `Les recruteurs peuvent ${phrase} tout de suite.`
		},
		/** `phrases`: the labels of the steps, lowercased, in order (two at least) */
		many: {
			en: (phrases: readonly string[]) =>
				`Recruiters ${phrases.slice(0, -1).join(', ')}, then ${phrases.at(-1)}.`,
			fr: (phrases: readonly string[]) =>
				`Pour les recruteurs : ${phrases.slice(0, -1).join(', ')}, puis ${phrases.at(-1)}.`
		}
	},

	// --- The visitor's journey ---
	/**
	 * The Hire page's description (journeyDescription): its meta description and a shared link's.
	 * `phrases`: the labels of the steps, lowercased, in order (one at least); `duration`: about how
	 * long they take (`inAbout`)
	 */
	description: {
		steps: {
			en: (ownerName: string, phrases: readonly string[], duration: string) =>
				`Propose a role to ${ownerName} on their page for recruiters: ${phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(', ')}, then ${phrases.at(-1)}`}, ${duration}.`,
			fr: (ownerName: string, phrases: readonly string[], duration: string) =>
				`Proposez un poste à ${ownerName} sur sa page recruteurs : ${phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(', ')}, puis ${phrases.at(-1)}`}, ${duration}.`
		},
		/** About how long the steps take, through plural() */
		inAbout: {
			one: { en: 'in about a minute', fr: 'en une minute environ' },
			other: {
				en: (minutes: number) => `in about ${minutes} minutes`,
				fr: (minutes: number) => `en ${minutes} minutes environ`
			}
		},
		/** A journey without steps */
		none: {
			en: (ownerName: string) =>
				`Propose a role to ${ownerName} on their page for recruiters. They do not take meeting requests online right now.`,
			fr: (ownerName: string) =>
				`Proposez un poste à ${ownerName} sur sa page recruteurs. ${ownerName} ne prend pas de demandes de rendez-vous en ligne pour le moment.`
		},
		/** The journey is not known yet (it is loaded in the browser) */
		unknown: {
			en: (ownerName: string) =>
				`Propose a role to ${ownerName}: their page for recruiters, with the steps they ask you to follow.`,
			fr: (ownerName: string) =>
				`Proposez un poste à ${ownerName} : sa page recruteurs, avec les étapes à suivre.`
		}
	},
	intro: {
		noGoal: {
			en: (ownerName: string) => `${ownerName} does not take meeting requests online right now.`,
			fr: (ownerName: string) =>
				`${ownerName} ne prend pas de demandes de rendez-vous en ligne pour le moment.`
		},
		/** `before`: how many steps come first (one at least); `after`: what the goal's type says then */
		stepsFirst: {
			en: (ownerName: string, before: number, after: string) =>
				`${ownerName} asks recruiters to complete ${before === 1 ? 'one step' : `${before} steps`} first. ${after}`,
			fr: (ownerName: string, before: number, after: string) =>
				`${ownerName} demande aux recruteurs de terminer d'abord ${before === 1 ? 'une étape' : `${before} étapes`}. ${after}`
		}
	},
	stepUnavailable: { en: 'This step is not available.', fr: "Cette étape n'est pas disponible." },
	completeStepAbove: {
		en: 'Complete the step above first.',
		fr: "Terminez d'abord l'étape ci-dessus."
	},
	completeStepsAbove: {
		en: 'Complete the steps above first.',
		fr: "Terminez d'abord les étapes ci-dessus."
	},
	notPassed: { en: 'Not passed.', fr: 'Non validée.' },
	submit: {
		failed: {
			en: 'Could not save this step. Try again in a moment.',
			fr: "Impossible d'enregistrer cette étape. Réessayez dans un instant."
		},
		signedOut: {
			en: 'Your session expired. Sign in again to continue.',
			fr: 'Votre session a expiré. Reconnectez-vous pour continuer.'
		},
		ownJourney: {
			en: 'This is your own portfolio: its journey is for recruiters.',
			fr: "C'est votre propre portfolio : son parcours est destiné aux recruteurs."
		},
		noPortfolio: { en: 'This portfolio no longer exists.', fr: "Ce portfolio n'existe plus." },
		journeyChanged: {
			en: 'This hiring journey changed.',
			fr: 'Ce parcours de recrutement a changé.'
		}
	},

	// --- Job step ---
	job: {
		/** `status`: the posting's status as its label says it ("Closed") */
		notOpen: {
			en: (title: string, status: string) =>
				`${title} is ${status.toLowerCase()} now: pick an open job description.`,
			fr: (title: string, status: string) =>
				`${title} a maintenant le statut « ${status} » : choisissez une offre ouverte.`
		},
		ask: {
			en: 'Pick the job you are hiring for, or write it.',
			fr: "Choisissez l'offre pour laquelle vous recrutez, ou rédigez-la."
		},
		pick: {
			signedOut: {
				en: 'Your session expired. Sign in again to pick a job.',
				fr: 'Votre session a expiré. Reconnectez-vous pour choisir une offre.'
			},
			noSpace: {
				en: 'Create your recruiter space to pick a job.',
				fr: 'Créez votre espace recruteur pour choisir une offre.'
			},
			terms: {
				en: 'Accept the terms of use in force to pick a job.',
				fr: "Acceptez les conditions d'utilisation en vigueur pour choisir une offre."
			},
			gone: {
				en: 'This job description no longer exists. Pick another one.',
				fr: "Cette offre n'existe plus. Choisissez-en une autre."
			},
			notOpen: {
				en: 'Only an open job description can be picked. Set its status to Open first.',
				fr: "Seule une offre ouverte peut être choisie. Passez d'abord son statut à « Ouverte »."
			},
			journeyChanged: {
				en: 'This hiring journey changed: it no longer asks for a job here.',
				fr: "Ce parcours de recrutement a changé : il ne demande plus d'offre ici."
			},
			failed: {
				en: 'Could not pick this job. Try again in a moment.',
				fr: 'Impossible de choisir cette offre. Réessayez dans un instant.'
			}
		}
	},

	// --- Job match step ---
	jobMatch: {
		passed: {
			en: (title: string, score: number) => `${title} scores ${score} out of 100.`,
			fr: (title: string, score: number) => `${title} obtient ${score} sur 100.`
		},
		under: {
			en: (title: string, score: number, minScore: number) =>
				`${title} scores ${score} out of 100: at least ${minScore} is needed.`,
			fr: (title: string, score: number, minScore: number) =>
				`${title} obtient ${score} sur 100 : il faut au moins ${minScore}.`
		},
		ask: {
			en: 'The job you picked is scored out of 100.',
			fr: "L'offre que vous avez choisie est notée sur 100."
		},
		askMin: {
			en: (minScore: number) =>
				`The job you picked is scored out of 100: at least ${minScore} is needed.`,
			fr: (minScore: number) =>
				`L'offre que vous avez choisie est notée sur 100 : il faut au moins ${minScore}.`
		},
		outcome: {
			unknown: {
				en: 'Could not be computed right now: not counted',
				fr: 'Impossible à calculer pour le moment : non pris en compte'
			},
			notStated: {
				en: 'Not stated in your job description',
				fr: 'Non précisé dans votre offre'
			},
			match: { en: 'Matches', fr: 'Correspond' },
			partial: { en: 'Partly matches', fr: 'Correspond en partie' },
			miss: { en: 'Does not match', fr: 'Ne correspond pas' }
		}
	}
});
