import { defineMessages, plural } from 'portfolio-common';

// The texts of discovery in the admin's Perfect job tab (DiscoverySettings.svelte,
// ReadinessChecklist.svelte, CardPreviewDialog.svelte): being proposed to recruiters as an
// anonymous card (Path 2, CLAUDE.md "Matching"). Neutral: having a portfolio, or being visible,
// says nothing about looking for a job. "Visible to recruiters" (« visible des recruteurs »), never
// "on the market"; both interested is "you are both interested", never a bare "match". What each
// requirement asks is portfolio-common's (discoveryRequirementMessage), and the consent's wording
// is legalMessages.discoveryConsent: neither is here.
export const m = defineMessages({
	title: { en: 'Be found by recruiters', fr: 'Être visible des recruteurs' },
	/**
	 * Backed by: server/services/matchFeeds.ts (the candidate's feed: the open jobs that meet their
	 * criteria; a recruiter's: the anonymous cards of the candidates their job meets),
	 * server/services/candidateCard.ts (no name, portfolio, company or place on the card),
	 * server/services/matches.ts (the portfolio revealed once both are interested), and the
	 * DiscoveryProfile off until a consent is recorded (server/services/discovery.ts)
	 */
	intro: {
		en: 'Portfolio shows you the open jobs that meet your criteria, and proposes your anonymous card to their recruiters. Your name and your portfolio stay hidden until you are both interested.',
		fr: "Portfolio vous montre les offres ouvertes qui répondent à vos critères, et propose votre fiche anonyme à leurs recruteurs. Votre nom et votre portfolio restent masqués jusqu'à un intérêt réciproque."
	},
	/** Before the intro, while it is off */
	optional: {
		en: 'Optional, and off until you turn it on.',
		fr: "Facultatif, et désactivé tant que vous ne l'activez pas."
	},
	/** Where the candidate stands (DISCOVERY_STATES), on a badge */
	state: {
		off: { en: 'Off', fr: 'Désactivé' },
		on: { en: 'On', fr: 'Activé' },
		paused: { en: 'Paused', fr: 'En pause' },
		lapsed: { en: 'Consent ended', fr: 'Consentement expiré' }
	},
	/** `since`, `until`: '12 Nov 2026' (the consent's date, and DISCOVERY_CONSENT_MONTHS after it) */
	on: {
		en: (since: string, until: string) =>
			`Visible to recruiters since ${since}. Your consent is valid until ${until}.`,
		fr: (since: string, until: string) =>
			`Visible des recruteurs depuis le ${since}. Votre consentement est valable jusqu'au ${until}.`
	},
	/** Backed by: services/discovery.ts isProposed (the state on and nothing missing, at every read) */
	paused: {
		en: 'Paused: you are proposed to no recruiter until what is missing below is set.',
		fr: "En pause : aucun recruteur ne voit votre fiche tant que ce qui manque ci-dessous n'est pas réglé."
	},
	/** Paused, and the consent in its last DISCOVERY_CONSENT_RENEWAL_DAYS days too */
	pausedRenew: {
		en: (until: string) =>
			`Your consent ends on ${until}: once what is missing is set, confirm it again to stay visible.`,
		fr: (until: string) =>
			`Votre consentement prend fin le ${until} : une fois réglé ce qui manque, confirmez-le de nouveau pour rester visible.`
	},
	/** Its last DISCOVERY_CONSENT_RENEWAL_DAYS days: confirmed again, it counts from then */
	renew: {
		en: (until: string) =>
			`Your consent ends on ${until}. Confirm it again to stay visible to recruiters.`,
		fr: (until: string) =>
			`Votre consentement prend fin le ${until}. Confirmez-le de nouveau pour rester visible des recruteurs.`
	},
	lapsed: {
		en: (ended: string) =>
			`Your consent ended on ${ended}: no recruiter sees your card. Give your consent again to be proposed to recruiters.`,
		fr: (ended: string) =>
			`Votre consentement a pris fin le ${ended} : aucun recruteur ne voit votre fiche. Donnez de nouveau votre consentement pour qu'elle leur soit proposée.`
	},
	/**
	 * The one bar a job is held to, the journey's job match minimum. Backed by:
	 * services/matchFeeds.ts (a job proposed, and a card proposed for it, only when it scores at
	 * least the candidate's minimum with no deal-breaker missed)
	 */
	minimum: {
		en: (score: number) =>
			`A job is proposed to you, and your card to its recruiter, only when it scores at least ${score} out of 100 against your criteria, with no deal-breaker missed: the minimum of your hiring journey. <journey>Change it</journey>`,
		fr: (score: number) =>
			`Une offre ne vous est proposée, et votre fiche à son recruteur, que si elle obtient au moins ${score} sur 100 selon vos critères, sans critère éliminatoire manqué : le minimum de votre parcours de recrutement. <journey>Le modifier</journey>`
	},
	/**
	 * While on or paused: the candidate's inbox. Backed by: routes/(app)/opportunities (the jobs
	 * proposed, GET /opportunities, or why there are none)
	 */
	opportunities: {
		en: 'See the jobs proposed to you',
		fr: 'Voir les offres proposées'
	},
	/** A change answered a 404: matching was turned off meanwhile */
	unavailable: {
		en: 'Being visible to recruiters is not available right now.',
		fr: "La visibilité auprès des recruteurs n'est pas disponible pour le moment."
	},
	/** A request that expired: the page is not signed out (what was typed stays) */
	sessionExpired: {
		en: 'Your session expired. Your changes are still here: sign in again in another tab, then try again.',
		fr: 'Votre session a expiré. Vos modifications sont toujours là : reconnectez-vous dans un autre onglet, puis réessayez.'
	},

	/** What is missing (GET /discovery's `missing`), each with what fixes it */
	checklist: {
		before: { en: 'Before you turn it on', fr: "Avant de l'activer" },
		missing: { en: 'What is missing', fr: 'Ce qui manque' },
		ready: {
			en: 'Everything it asks is set.',
			fr: "Tout ce qu'il faut est réglé."
		},
		action: {
			account: { en: 'Open my account', fr: 'Ouvrir mon compte' },
			criteria: { en: 'Go to my criteria', fr: 'Aller à mes critères' },
			pay: { en: 'Rate the pay', fr: 'Noter la rémunération' },
			/** Adds the gate's missing steps in the Hiring journey tab, as unsaved changes */
			journey: { en: 'Add the missing steps', fr: 'Ajouter les étapes manquantes' },
			appointments: { en: 'Open my calendar settings', fr: "Ouvrir mes réglages d'agenda" }
		}
	},

	card: {
		title: { en: 'Your anonymous card', fr: 'Votre fiche anonyme' },
		/**
		 * As legalMessages.discoveryConsent says it. Backed by: server/services/candidateCard.ts
		 * (CANDIDATE_CARD_FIELDS: the headline, the role titles with the months in each and whether
		 * each is held now, the months of professional experience, the skills with their months; never
		 * a name, the portfolio, a company or a place) and server/services/matchFeeds.ts (`interested`
		 * on a recruiter's feed: the candidate said the job interests them)
		 */
		text: {
			en: 'What recruiters read of you before you are both interested: your headline, your role titles with the time in each and whether you still hold it, your total time of professional experience, and your skills with how long you used each. If you say a job interests you, its recruiter sees it on your card. Never your name, your portfolio, a company or a place.',
			fr: "Ce que les recruteurs lisent de vous avant un intérêt réciproque : votre accroche, vos intitulés de poste avec le temps passé à chacun et si vous l'occupez encore, votre durée totale d'expérience professionnelle, ainsi que vos compétences et leur durée d'utilisation. Si vous dites qu'une offre vous intéresse, son recruteur le voit sur votre fiche. Jamais votre nom, votre portfolio, une entreprise ou un lieu."
		},
		headline: { en: 'Headline', fr: 'Accroche' },
		/** `max`: DISCOVERY_LIMITS.headline */
		headlineHint: {
			en: (max: number) =>
				`One line about what you do, without your name, a company, a place, a link or a way to reach you. ${max} characters at most.`,
			fr: (max: number) =>
				`Une ligne sur ce que vous faites, sans votre nom, ni entreprise, ni lieu, ni lien, ni moyen de vous joindre. ${max} caractères au plus.`
		},
		headlinePlaceholder: {
			en: 'Backend engineer, payments and data platforms',
			fr: 'Ingénieur backend, paiements et plateformes de données'
		},
		/** The characters typed, of the most a headline takes (not read out: the hint says it) */
		count: {
			en: (count: number, max: number) => `${count}/${max}`,
			fr: (count: number, max: number) => `${count}/${max}`
		},
		experiences: { en: 'Experiences your card reads', fr: 'Expériences lues par votre fiche' },
		experiencesHint: {
			en: 'Untick an experience to leave it out of your card: its role, its time and the skills of its projects.',
			fr: 'Décochez une expérience pour la laisser hors de votre fiche : son poste, son temps et les compétences de ses projets.'
		},
		noExperience: {
			en: 'Your portfolio has no experience yet: your card shows your headline alone.',
			fr: "Votre portfolio n'a encore aucune expérience : votre fiche ne montre que votre accroche."
		},
		/** An experience without a title, in the list */
		untitled: { en: 'Untitled experience', fr: 'Expérience sans intitulé' },
		save: { en: 'Save my card', fr: 'Enregistrer ma fiche' },
		/** Leaving the page with the card's settings not saved */
		leaveUnsaved: {
			en: 'Leave without saving your anonymous card? Your changes will be lost.',
			fr: 'Quitter sans enregistrer votre fiche anonyme ? Vos modifications seront perdues.'
		},
		undo: { en: 'Undo changes', fr: 'Annuler les modifications' },
		saved: { en: 'Card saved', fr: 'Fiche enregistrée' },
		saveFailed: {
			en: 'Your card could not be saved. Try again in a moment.',
			fr: "Votre fiche n'a pas pu être enregistrée. Réessayez dans un instant."
		},
		preview: { en: 'Preview my card', fr: 'Aperçu de ma fiche' }
	},

	consent: {
		/** Under the box: the privacy policy, in a new tab (the anchor ships with item 2.14) */
		privacy: {
			en: 'Details in the <privacy>privacy policy</privacy> (opens in a new tab).',
			fr: 'Détails dans la <privacy>politique de confidentialité</privacy> (nouvel onglet).'
		},
		turnOn: { en: 'Make me visible to recruiters', fr: 'Me rendre visible des recruteurs' },
		renew: { en: 'Confirm my consent again', fr: 'Confirmer de nouveau mon consentement' },
		giveAgain: { en: 'Give my consent again', fr: 'Donner de nouveau mon consentement' },
		missingFirst: {
			en: 'Set what is missing above first.',
			fr: "Réglez d'abord ce qui manque ci-dessus."
		},
		/** The card's settings hold changes not saved yet: recruiters would read the card saved */
		saveCardFirst: {
			en: 'Save or undo the changes to your card first.',
			fr: "Enregistrez ou annulez d'abord les modifications de votre fiche."
		},
		saveCriteriaFirst: {
			en: 'Save your criteria first.',
			fr: "Enregistrez d'abord vos critères."
		},
		/** `moment`: '28 Nov 2026, 14:05' (a 429's Retry-After, or 7 days after turning it off) */
		waitUntil: {
			en: (moment: string) => `You can turn it on again from ${moment}.`,
			fr: (moment: string) => `Vous pourrez l'activer de nouveau à partir du ${moment}.`
		},
		/** A 429 without a Retry-After */
		waitLater: {
			en: 'You cannot turn it on again yet. Try again later.',
			fr: "Vous ne pouvez pas encore l'activer de nouveau. Réessayez plus tard."
		},
		turnedOn: { en: 'You are visible to recruiters', fr: 'Vous êtes visible des recruteurs' },
		renewed: { en: 'Consent confirmed', fr: 'Consentement confirmé' },
		failed: {
			en: 'It could not be turned on. Try again in a moment.',
			fr: "L'activation n'a pas abouti. Réessayez dans un instant."
		}
	},

	/** Turning discovery off: at once, asked first */
	off: {
		button: { en: 'Stop being visible', fr: 'Ne plus être visible' },
		title: {
			en: 'Stop being visible to recruiters?',
			fr: 'Ne plus être visible des recruteurs ?'
		},
		/**
		 * Backed by: services/discovery.ts withdrawDiscovery (out of every feed at once) and
		 * discoveryWithdrawal.dropPendingDecisions (the matches without a mutual interest go; the
		 * mutual interests stay, each ended on its own)
		 */
		description: {
			en: "You leave every recruiter's list at once. Your answers on the jobs proposed to you, and recruiters' answers about you, are dropped, except where you are both interested: those go on until you or the recruiter ends them.",
			fr: "Vous quittez aussitôt la liste de chaque recruteur. Vos réponses aux offres qui vous sont proposées, et celles des recruteurs à votre sujet, sont effacées, sauf en cas d'intérêt réciproque : celui-ci continue jusqu'à ce que vous ou le recruteur y mettiez fin."
		},
		/** `days`: DISCOVERY_REJOIN_DAYS */
		details: {
			en: (days: number) =>
				`You can turn it on again ${days} ${plural(days, 'day', 'days')} after you turn it off.`,
			fr: (days: number) =>
				`Vous pourrez l'activer de nouveau ${days} ${plural(days, 'jour', 'jours')} après l'avoir désactivé.`
		},
		/** Once the consent ended: proposed to nobody already, the answers about them still kept */
		lapsedButton: { en: 'Turn it off', fr: 'Désactiver' },
		lapsedTitle: {
			en: 'Turn off being found by recruiters?',
			fr: 'Désactiver la visibilité auprès des recruteurs ?'
		},
		/**
		 * Backed by: services/discovery.ts withdrawDiscovery (dropPendingDecisions whatever the state;
		 * the opt-in held back DISCOVERY_REJOIN_DAYS after it, which `details` says)
		 */
		lapsedDescription: {
			en: "Your consent ended, so you are already proposed to no recruiter. Turning it off also drops your answers on the jobs proposed to you, and recruiters' answers about you, except where you are both interested: those go on until you or the recruiter ends them.",
			fr: "Votre consentement a pris fin : votre fiche n'est déjà plus proposée à aucun recruteur. Le désactiver efface aussi vos réponses aux offres qui vous ont été proposées, et celles des recruteurs à votre sujet, sauf en cas d'intérêt réciproque : celui-ci continue jusqu'à ce que vous ou le recruteur y mettiez fin."
		},
		busy: { en: 'Turning it off…', fr: 'Désactivation…' },
		done: {
			en: 'You are no longer visible to recruiters',
			fr: "Vous n'êtes plus visible des recruteurs"
		},
		failed: {
			en: 'It could not be turned off. Try again.',
			fr: "La désactivation n'a pas abouti. Réessayez."
		}
	},

	/** The card as recruiters read it (GET /discovery/card), and what it leaves out */
	preview: {
		title: { en: 'Your anonymous card', fr: 'Votre fiche anonyme' },
		description: {
			en: 'As recruiters read it before you are both interested.',
			fr: 'Telle que les recruteurs la lisent avant un intérêt réciproque.'
		},
		loading: { en: 'Loading your card…', fr: 'Chargement de votre fiche…' },
		failed: {
			en: 'Your card could not be loaded.',
			fr: "Votre fiche n'a pas pu être chargée."
		},
		unsaved: {
			en: 'Your changes are not saved yet: this is your card as saved.',
			fr: "Vos modifications ne sont pas encore enregistrées : voici votre fiche telle qu'enregistrée."
		},
		/**
		 * `list`: the criteria whose outcome a recruiter reads beside the card (cardOutcomeCriteria:
		 * only with the job match's showDetails, never the commute or the places)
		 */
		outcomes: {
			en: (list: string) =>
				`Beside your card, for their job, recruiters read its outcome on: ${list}. Never what you ask for, your commute or where you want to work.`,
			fr: (list: string) =>
				`À côté de votre fiche, pour leur offre, les recruteurs lisent son résultat sur : ${list}. Jamais ce que vous demandez, votre trajet ni le lieu où vous voulez travailler.`
		},
		noOutcomes: {
			en: 'Beside your card, recruiters read no outcome per criterion: your hiring journey does not show them how their job does on each.',
			fr: 'À côté de votre fiche, les recruteurs ne lisent aucun résultat par critère : votre parcours de recrutement ne leur montre pas le résultat de leur offre sur chacun.'
		},
		/**
		 * Backed by: components/matching/CandidateCard.svelte (`reaches`, beside every card a feed
		 * gives) and server/services/matchFeeds.ts (`interested` on a recruiter's feed)
		 */
		alsoRead: {
			en: 'Recruiters also read that their job reaches your minimum score, and whether you said you are interested in it.',
			fr: "Les recruteurs lisent aussi que leur offre atteint votre note minimale, et si vous avez dit qu'elle vous intéresse."
		},
		withheld: { en: 'Left out of your card', fr: 'Laissé hors de votre fiche' },
		headline: {
			en: "Your headline: it says who you are (your name, a company or a place). Change it in your card's settings.",
			fr: 'Votre accroche : elle dit qui vous êtes (votre nom, une entreprise ou un lieu). Modifiez-la dans les réglages de votre fiche.'
		},
		/** A professional experience that is not a role of the card, and why (CARD_ROLE_WITHHELD) */
		role: {
			hidden: {
				en: (title: string) => `${title}: you left it out.`,
				fr: (title: string) => `${title} : vous avez laissé cette expérience hors de votre fiche.`
			},
			title: {
				en: (title: string) =>
					`${title}: its title says who you are (your name, a company or a place).`,
				fr: (title: string) =>
					`${title} : son intitulé dit qui vous êtes (votre nom, une entreprise ou un lieu).`
			},
			upcoming: {
				en: (title: string) => `${title}: it has not started yet.`,
				fr: (title: string) => `${title} : ce poste n'a pas encore commencé.`
			},
			/** `max`: MATCHING_LIMITS.roles */
			limit: {
				en: (title: string, max: number) =>
					`${title}: your card shows your ${max} most recent roles.`,
				fr: (title: string, max: number) =>
					`${title} : votre fiche montre vos ${max} postes les plus récents.`
			}
		},
		skills: {
			en: (list: string) => `Skills whose name says who you are: ${list}.`,
			fr: (list: string) => `Compétences dont le nom dit qui vous êtes : ${list}.`
		}
	}
});
