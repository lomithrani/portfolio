import { defineMessages, plural } from 'portfolio-common';

// The candidate's inbox of matching (Path 2): the open jobs proposed to them, answered one at a
// time ("To review"), and their mutual interests. Decision 11 of the founder: "Interested" and
// "Pass", "You're both interested", never a bare "match" (it names the score). Decision 10: in-app
// only, no text promises an email. Decision 17: nothing of who a recruiter is before both are
// interested. Neutral: having a portfolio says nothing of looking for a job
export const m = defineMessages({
	/** The browser tab's title (while matching answers: "Portfolio" until it does) */
	pageTitle: { en: 'Opportunities | Portfolio', fr: 'Opportunités | Portfolio' },
	/** The row of views */
	views: { en: 'Your opportunities', fr: 'Vos opportunités' },
	tabs: {
		review: { en: 'To review', fr: 'À examiner' },
		interests: { en: 'Mutual interests', fr: 'Intérêts réciproques' }
	},

	/** Signed out: the page is private */
	signedOut: {
		title: {
			en: 'Sign in to see your opportunities',
			fr: 'Connectez-vous pour voir vos opportunités'
		},
		text: {
			en: 'This page is private: only you can see it, once signed in.',
			fr: 'Cette page est privée : vous seul pouvez la voir, une fois connecté.'
		}
	},
	loadFailed: {
		title: {
			en: 'Could not load your opportunities',
			fr: 'Impossible de charger vos opportunités'
		},
		/** Not the network (that one says so): the API answered with an error, or something unreadable */
		text: {
			en: 'Something went wrong on our side. Try again in a moment.',
			fr: 'Un problème est survenu de notre côté. Réessayez dans un instant.'
		}
	},
	sessionExpired: {
		en: 'Your session has ended. Sign in again to see your opportunities.',
		fr: 'Votre session a expiré. Reconnectez-vous pour voir vos opportunités.'
	},

	// --- To review: the deck, or why there is none -----------------------------------------
	review: {
		/** The deck's accessible name */
		deck: { en: 'Jobs proposed to you', fr: 'Offres qui vous sont proposées' },
		/**
		 * Above the deck (`minScore`: their journey's minimum). Backed by: server/services/matchFeeds.ts
		 * (a job proposed when it reaches the minimum with no deal-breaker missed), the discovery
		 * consent (its recruiter sees the candidate's interest)
		 */
		intro: {
			en: (minScore: number) =>
				`The open jobs that score at least ${minScore} out of 100 against your criteria, with no deal-breaker missed. If a job interests you, its recruiter sees it; your name and your portfolio stay hidden until you are both interested.`,
			fr: (minScore: number) =>
				`Les offres ouvertes qui obtiennent au moins ${minScore} sur 100 selon vos critères, sans critère éliminatoire manqué. Si une offre vous intéresse, son recruteur le voit ; votre nom et votre portfolio restent masqués jusqu'à un intérêt réciproque.`
		},
		/** The same without a minimum known */
		introNoMinimum: {
			en: 'The open jobs that meet your criteria and your minimum score, with no deal-breaker missed. If a job interests you, its recruiter sees it; your name and your portfolio stay hidden until you are both interested.',
			fr: "Les offres ouvertes qui répondent à vos critères et à votre note minimale, sans critère éliminatoire manqué. Si une offre vous intéresse, son recruteur le voit ; votre nom et votre portfolio restent masqués jusqu'à un intérêt réciproque."
		},
		/**
		 * Nothing to answer, true whether or not they answered jobs already (the feed leaves out what
		 * they answered). No email is sent: the account menu says when both are interested
		 */
		empty: {
			title: { en: 'Nothing to review right now', fr: 'Rien à examiner pour le moment' },
			text: {
				en: 'No open job that meets your criteria and your minimum score is waiting for your answer right now. New ones show up here: come back to see them. When the recruiter of a job that interests you is interested in you too, your account menu says so.',
				fr: "Aucune offre ouverte répondant à vos critères et à votre note minimale n'attend votre réponse pour le moment. Les nouvelles apparaissent ici : revenez les voir. Quand le recruteur d'une offre qui vous intéresse s'intéresse aussi à vous, le menu de votre compte l'indique."
			}
		},
		/**
		 * Above the deck, in the consent's last DISCOVERY_CONSENT_RENEWAL_DAYS days (`day`: when it
		 * ends; no email says it, decision 10); <settings> links discovery's settings, where it is
		 * confirmed again. Backed by: portfolio-common's discoveryConsentRenewable
		 */
		consentEnds: {
			en: (day: string) =>
				`Your consent to be visible to recruiters ends on ${day}. Confirm it again in <settings>its settings</settings> to stay visible.`,
			fr: (day: string) =>
				`Votre consentement à être visible des recruteurs prend fin le ${day}. Confirmez-le de nouveau dans <settings>ses réglages</settings> pour rester visible.`
		},
		criteria: { en: 'Review my criteria', fr: 'Revoir mes critères' },
		/** Discovery needs a portfolio */
		noPortfolio: {
			title: { en: 'Create your portfolio first', fr: "Créez d'abord votre portfolio" },
			text: {
				en: 'Jobs are proposed to portfolio owners who make themselves visible to recruiters.',
				fr: 'Les offres sont proposées aux propriétaires de portfolio qui se rendent visibles des recruteurs.'
			},
			create: { en: 'Create your portfolio', fr: 'Créer votre portfolio' }
		},
		/** Backed by: server/services/discovery.ts (opt-in), server/services/matches.ts (revealed once both are interested) */
		off: {
			title: {
				en: 'You are not visible to recruiters',
				fr: "Vous n'êtes pas visible des recruteurs"
			},
			text: {
				en: 'Make yourself visible to recruiters, and the open jobs that meet your criteria show up here for you to answer. Their recruiters read an anonymous card: your name and your portfolio stay hidden until you are both interested.',
				fr: "Devenez visible des recruteurs : les offres ouvertes qui répondent à vos critères apparaissent alors ici pour que vous y répondiez. Leurs recruteurs lisent une fiche anonyme : votre nom et votre portfolio restent masqués jusqu'à un intérêt réciproque."
			}
		},
		paused: {
			title: {
				en: 'Paused: you are proposed to no recruiter',
				fr: 'En pause : aucun recruteur ne voit votre fiche'
			},
			/** Followed by each requirement missing (`count`: how many) */
			text: {
				en: (count: number) =>
					plural(
						count,
						'Since you turned it on, something you need to be visible to recruiters has gone missing:',
						'Since you turned it on, some things you need to be visible to recruiters have gone missing:'
					),
				fr: (count: number) =>
					plural(
						count,
						"Depuis l'activation, il manque une condition pour être visible des recruteurs :",
						"Depuis l'activation, il manque des conditions pour être visible des recruteurs :"
					)
			}
		},
		lapsed: {
			title: {
				en: 'Your consent to be visible to recruiters has ended',
				fr: 'Votre consentement à être visible des recruteurs a expiré'
			},
			text: {
				en: 'Give it again to be proposed to recruiters and to see the jobs that meet your criteria here.',
				fr: "Donnez-le de nouveau : votre fiche est alors proposée aux recruteurs, et les offres qui répondent à vos critères s'affichent ici."
			}
		},
		/** To discovery's settings, at the end of the admin's Perfect job tab */
		settings: { en: 'Open the settings', fr: 'Ouvrir les réglages' },
		/** The deck stopped for another reason (its message says which) */
		stopped: { en: 'Could not go on', fr: 'Impossible de continuer' }
	},

	// --- Mutual interests -------------------------------------------------------------------
	interests: {
		/**
		 * Backed by: server/services/mutualInterests.ts (it leads into the candidate's own journey,
		 * whether or not that journey still has a job step)
		 */
		intro: {
			en: 'When you and a recruiter are both interested in one of their jobs, it shows here. To book a meeting with you, the recruiter goes through the steps of your page for recruiters.',
			fr: "Quand un recruteur et vous avez un intérêt réciproque pour l'une de ses offres, elle apparaît ici. Pour réserver un rendez-vous avec vous, le recruteur passe par les étapes de votre page recruteurs."
		},
		empty: {
			title: { en: 'No mutual interest yet', fr: 'Aucun intérêt réciproque pour le moment' },
			text: {
				en: 'When the recruiter of a job that interests you is interested in you too, it shows here, and your account menu says so.',
				fr: "Quand le recruteur d'une offre qui vous intéresse s'intéresse aussi à vous, elle apparaît ici, et le menu de votre compte l'indique."
			}
		},
		loading: {
			en: 'Loading your mutual interests…',
			fr: 'Chargement de vos intérêts réciproques…'
		},
		loadFailed: {
			en: 'Could not load your mutual interests. Try again in a moment.',
			fr: 'Impossible de charger vos intérêts réciproques. Réessayez dans un instant.'
		},
		more: { en: 'Show more', fr: 'Afficher plus' }
	}
});
