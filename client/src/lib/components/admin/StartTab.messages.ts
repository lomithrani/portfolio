import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	title: { en: 'Get started', fr: 'Pour commencer' },
	/** Shown whatever is done, every item included: it never says that something is left */
	intro: {
		en: 'What to set before you share your link. Each item can wait, in any order: your link works from now on.',
		fr: "Ce qu'il faut régler avant de partager votre lien. Chaque point peut attendre, dans l'ordre que vous voulez : votre lien fonctionne dès maintenant."
	},
	loading: { en: 'Loading your checklist…', fr: 'Chargement de votre liste…' },
	/** The checklist, for screen readers */
	list: { en: 'Checklist', fr: 'Liste à régler' },
	progress: {
		en: (done: number, total: number) => `${done} of ${total} done`,
		fr: (done: number, total: number) => `${done} sur ${total} ${plural(done, 'réglé', 'réglés')}`
	},
	/** After an item's title, in brackets, for screen readers */
	state: {
		done: { en: 'done', fr: 'réglé' },
		toDo: { en: 'to do', fr: 'à faire' },
		unavailable: { en: 'not available', fr: 'indisponible' }
	},

	resume: {
		title: { en: 'Your experiences', fr: 'Vos expériences' },
		toDo: {
			en: 'Import your résumé or add your experiences: they are what recruiters read first.',
			fr: "Importez votre CV ou ajoutez vos expériences : c'est ce que les recruteurs lisent en premier."
		},
		done: {
			en: (count: number) =>
				`${count} ${plural(count, 'experience', 'experiences')} on your portfolio.`,
			fr: (count: number) =>
				`${count} ${plural(count, 'expérience', 'expériences')} sur votre portfolio.`
		},
		open: { en: 'Open my experiences', fr: 'Ouvrir mes expériences' },
		/** While the portfolio has no experience and the résumé import is offered */
		upload: { en: 'Upload my résumé (PDF)', fr: 'Importer mon CV (PDF)' },
		importNotice: {
			en: 'To be read, your PDF is sent to Anthropic, in the United States, which does not use it to train its models. Details in the <privacy>privacy policy</privacy>.',
			fr: "Pour être lu, votre PDF est envoyé à Anthropic, aux États-Unis, qui ne l'utilise pas pour entraîner ses modèles. Détails dans la <privacy>politique de confidentialité</privacy>."
		}
	},

	perfectJob: {
		title: { en: 'What you want', fr: 'Ce que vous voulez' },
		/**
		 * Backed by: server/services/workflowSteps/jobMatch.ts (a visitor's view: their score, the
		 * step's minimum and, with showDetails, each criterion's name and outcome, never what is
		 * asked; a job is scored only by that step, which the default journey has not),
		 * server/plugins/perfectJob.ts (the perfect job is read by its owner only)
		 */
		toDo: {
			en: 'Rate the pay first, then what else matters to you. Recruiters never see what you ask for: only how their job does against your criteria, and the minimum you set, when your steps score it.',
			fr: "Notez d'abord la rémunération, puis ce qui compte aussi pour vous. Les recruteurs ne voient jamais ce que vous demandez : seulement le résultat de leur offre face à vos critères, et le minimum que vous fixez, lorsque vos étapes la notent."
		},
		done: {
			en: (count: number) =>
				`The pay is rated, with ${count} ${plural(count, 'criterion', 'criteria')} in all.`,
			fr: (count: number) =>
				`La rémunération est notée, avec ${count} ${plural(count, 'critère', 'critères')} en tout.`
		},
		/** `essentials`: the essentials not rated yet, lowercased, as one list (Intl.ListFormat) */
		suggest: {
			en: (essentials: string) => `You could also rate ${essentials}.`,
			fr: (essentials: string) => `Vous pouvez aussi noter ${essentials}.`
		},
		essentials: {
			pay: { en: 'the pay', fr: 'la rémunération' },
			workMode: { en: 'the work mode', fr: 'le mode de travail' },
			place: { en: 'where you work', fr: 'le lieu de travail' },
			contractTypes: { en: 'the contract', fr: 'le contrat' }
		},
		open: { en: 'Set my perfect job', fr: 'Définir mon poste idéal' }
	},

	journey: {
		title: { en: 'Your steps', fr: 'Vos étapes' },
		/** The journey is the default one: a meeting alone, never chosen */
		toDo: {
			en: 'You have not chosen your steps yet: today your page for recruiters asks nothing before the meeting.',
			fr: "Vous n'avez pas encore choisi vos étapes : aujourd'hui, votre page recruteurs ne demande rien avant le rendez-vous."
		},
		/** After `toDo`, above the gate journey and "Keep the meeting alone" */
		choose: {
			en: 'Ask for the job first, or keep the meeting alone.',
			fr: "Demandez d'abord l'offre, ou gardez le rendez-vous seul."
		},
		/** A journey the owner saved: the meeting alone */
		meetingAlone: {
			en: 'Your page for recruiters asks nothing before the meeting.',
			fr: 'Votre page recruteurs ne demande rien avant le rendez-vous.'
		},
		/** After `meetingAlone`, above the gate journey */
		askFirst: { en: 'To ask for the job first:', fr: "Pour demander d'abord l'offre :" },
		/**
		 * The steps lead to a meeting, but the calendar item is not done: no slot can be booked yet
		 * (said only on a site that takes Google Calendar connections)
		 */
		calendarFirst: {
			en: 'Recruiters can book once your calendar is open.',
			fr: 'Les recruteurs pourront réserver une fois votre agenda ouvert.'
		},
		/**
		 * `calendarFirst`, for steps before the meeting: until the calendar is open, the page for
		 * recruiters shows them read-only (routes/[domain]/hire/+page.svelte, `closed`)
		 */
		calendarFirstSteps: {
			en: 'Recruiters can go through your steps and book once your calendar is open.',
			fr: 'Les recruteurs pourront suivre vos étapes et réserver une fois votre agenda ouvert.'
		},
		/**
		 * A step before the meeting is not available anymore (a journey saved by an older version):
		 * it can never be passed
		 */
		blocked: {
			en: 'A step of yours is not available anymore: recruiters cannot get past it, nor book a meeting. Remove it from your steps, or ask for the job first.',
			fr: "L'une de vos étapes n'est plus disponible : les recruteurs ne peuvent pas la franchir, ni réserver de rendez-vous. Retirez-la de vos étapes, ou demandez d'abord l'offre."
		},
		/** A journey was saved, but it leads to no meeting */
		noMeeting: {
			en: 'Your steps lead to no meeting: recruiters cannot book one. Ask for the job first, or add a meeting step.',
			fr: "Vos étapes ne mènent à aucun rendez-vous : les recruteurs ne peuvent pas en réserver. Demandez d'abord l'offre, ou ajoutez une étape de rendez-vous."
		},
		gate: {
			title: { en: 'Ask for the job first', fr: "Demander d'abord l'offre" },
			text: {
				en: (minScore: number) =>
					`Recruiters read your note, share one of their job descriptions, and see it scored against what you want, criterion by criterion. They book a meeting only once it scores at least ${minScore} out of 100.`,
				fr: (minScore: number) =>
					`Les recruteurs lisent votre note, présentent l'une de leurs offres d'emploi et voient son résultat au regard de ce que vous voulez, critère par critère. Ils ne peuvent réserver un rendez-vous que si l'offre obtient au moins ${minScore} sur 100.`
			},
			/** Before the steps of the gate journey, for screen readers */
			steps: { en: 'Its steps', fr: 'Ses étapes' },
			/** A step of it with a name of its own (the note): its type, then its name */
			named: {
				en: (label: string, title: string) => `${label}: ${title}`,
				fr: (label: string, title: string) => `${label} : ${title}`
			},
			editNote: { en: 'Change the note first', fr: "Modifier d'abord la note" },
			emptyPerfectJob: {
				en: 'Your perfect job has no criterion yet: every job would score 100. Say what you want first.',
				fr: "Votre poste idéal n'a encore aucun critère : toute offre obtiendrait 100. Dites d'abord ce que vous voulez."
			},
			use: { en: 'Use these steps', fr: 'Utiliser ces étapes' },
			using: { en: 'Saving your steps…', fr: 'Enregistrement de vos étapes…' }
		},
		/** A button beside "Use these steps", in a narrow card on phones: keep it short */
		keepMeeting: { en: 'Keep the meeting alone', fr: 'Garder le rendez-vous seul' },
		/** The journey leads to a meeting without asking for a job first */
		noGate: {
			en: 'No job is asked for first. To ask for it:',
			fr: "Aucune offre n'est demandée avant. Pour la demander d'abord :"
		},
		/** A job is asked for before the meeting, but no job match scores it before the meeting */
		notScored: {
			en: 'A job is asked for, but it is not scored against what you want before the meeting. To score it first:',
			fr: "Une offre est demandée, mais elle n'est pas notée au regard de ce que vous voulez avant le rendez-vous. Pour la noter d'abord :"
		},
		open: { en: 'Change my steps', fr: 'Modifier mes étapes' },
		/** Asked before replacing a journey the owner saved, or one they are changing */
		replace: {
			title: { en: 'Replace your steps?', fr: 'Remplacer vos étapes ?' },
			description: {
				en: (summary: string) =>
					`Your current steps are replaced. ${summary} What recruiters did on a step that goes is lost with it.`,
				fr: (summary: string) =>
					`Vos étapes actuelles sont remplacées. ${summary} Ce que les recruteurs ont fait sur une étape retirée est perdu avec elle.`
			},
			unsaved: {
				en: 'The changes you have not saved in the Hiring journey tab are lost too.',
				fr: "Les modifications non enregistrées de l'onglet Parcours de recrutement sont perdues aussi."
			},
			confirm: { en: 'Replace my steps', fr: 'Remplacer mes étapes' }
		},
		saved: { en: 'Steps saved', fr: 'Étapes enregistrées' },
		saveFailed: {
			en: 'Could not save your steps. Try again.',
			fr: "Impossible d'enregistrer vos étapes. Réessayez."
		},
		sessionExpired: {
			en: 'Your session expired. Sign in again in another tab, then try again.',
			fr: 'Votre session a expiré. Reconnectez-vous dans un autre onglet, puis réessayez.'
		}
	},

	calendar: {
		title: { en: 'Your calendar', fr: 'Votre agenda' },
		unavailable: {
			en: 'Online booking is not available on this site for now.',
			fr: "La réservation en ligne n'est pas disponible sur ce site pour le moment."
		},
		reconnect: {
			en: 'Google refused the access to your calendar: connect it again, so recruiters can book.',
			fr: "Google a refusé l'accès à votre agenda : connectez-le de nouveau, pour que les recruteurs puissent réserver."
		},
		connect: {
			en: 'Connect Google Calendar, then create an appointment schedule in the Appointments tab (its length and your hours), so recruiters can book a slot.',
			fr: "Connectez Google Agenda, puis créez un agenda de rendez-vous dans l'onglet Rendez-vous (sa durée et vos horaires), pour que les recruteurs puissent réserver un créneau."
		},
		schedule: {
			en: 'Connected. In the Appointments tab, create an appointment schedule (its length and your hours), or turn one on and give it your hours, so recruiters can book a slot.',
			fr: "Connecté. Dans l'onglet Rendez-vous, créez un agenda de rendez-vous (sa durée et vos horaires), ou activez-en un et donnez-lui vos horaires, pour que les recruteurs puissent réserver un créneau."
		},
		done: {
			en: (count: number) =>
				`Recruiters can book: ${count} ${plural(count, 'appointment schedule', 'appointment schedules')} turned on.`,
			fr: (count: number) =>
				`Les recruteurs peuvent réserver : ${count} ${plural(count, 'agenda de rendez-vous activé', 'agendas de rendez-vous activés')}.`
		},
		/** The calendar is open, but the steps never lead recruiters to the meeting */
		noMeeting: {
			en: (count: number) =>
				`${count} ${plural(count, 'appointment schedule', 'appointment schedules')} turned on, but your steps never lead recruiters to a meeting: they cannot book one.`,
			fr: (count: number) =>
				`${count} ${plural(count, 'agenda de rendez-vous activé', 'agendas de rendez-vous activés')}, mais vos étapes ne mènent jamais les recruteurs à un rendez-vous : ils ne peuvent pas en réserver.`
		},
		open: { en: 'Open my calendar settings', fr: "Ouvrir mes réglages d'agenda" }
	},

	share: {
		title: { en: 'Your link', fr: 'Votre lien' },
		text: {
			en: 'Send it to the recruiters who write to you, or put it on your profiles: it opens your portfolio, from which recruiters reach your page for recruiters.',
			fr: "Envoyez-le aux recruteurs qui vous écrivent, ou ajoutez-le à vos profils : il ouvre votre portfolio, d'où les recruteurs rejoignent votre page recruteurs."
		},
		see: { en: 'See your page for recruiters', fr: 'Voir votre page recruteurs' },
		/** The Share tab: a reply to recruiters, a LinkedIn text (as the page for recruiters calls it) */
		more: { en: 'More ways to share', fr: 'Plus de façons de partager' }
	},

	/**
	 * Being proposed to recruiters (Path 2), shown only while matching is available (GET /discovery
	 * answered): optional, never counted in the checklist the link needs. Its settings are in the
	 * Perfect job tab (#discovery)
	 */
	discovery: {
		title: { en: 'Be found by recruiters', fr: 'Être visible des recruteurs' },
		optional: { en: 'Optional', fr: 'Facultatif' },
		/**
		 * Backed by: server/services/matchFeeds.ts (the anonymous card proposed for the open jobs that
		 * meet the candidate's criteria), server/services/matches.ts (the portfolio revealed once both
		 * are interested)
		 */
		off: {
			en: 'Let Portfolio propose your anonymous card to the recruiters whose open jobs meet your criteria. Your name and your portfolio stay hidden until you are both interested.',
			fr: "Laissez Portfolio proposer votre fiche anonyme aux recruteurs dont les offres ouvertes répondent à vos critères. Votre nom et votre portfolio restent masqués jusqu'à un intérêt réciproque."
		},
		/** `since`: '12 Nov 2026' */
		on: {
			en: (since: string) => `Your anonymous card has been proposed to recruiters since ${since}.`,
			fr: (since: string) => `Votre fiche anonyme est proposée aux recruteurs depuis le ${since}.`
		},
		/** `until`: the day the consent ends, within DISCOVERY_CONSENT_RENEWAL_DAYS */
		renew: {
			en: (until: string) => `Your consent ends on ${until}: confirm it again to stay visible.`,
			fr: (until: string) =>
				`Votre consentement prend fin le ${until} : confirmez-le de nouveau pour rester visible.`
		},
		paused: {
			en: 'Paused: something it needs is missing, so you are proposed to no recruiter.',
			fr: 'En pause : il manque quelque chose, aucun recruteur ne voit donc votre fiche.'
		},
		/** Paused, and the consent in its last DISCOVERY_CONSENT_RENEWAL_DAYS days: `until` the day */
		pausedRenew: {
			en: (until: string) =>
				`Paused: something it needs is missing, so you are proposed to no recruiter. Your consent also ends on ${until}: confirm it again to stay visible.`,
			fr: (until: string) =>
				`En pause : il manque quelque chose, aucun recruteur ne voit donc votre fiche. Votre consentement prend aussi fin le ${until} : confirmez-le de nouveau pour rester visible.`
		},
		lapsed: {
			en: 'Your consent ended: give it again so that recruiters see your card.',
			fr: 'Votre consentement a pris fin : donnez-le de nouveau pour que les recruteurs voient votre fiche.'
		},
		open: { en: 'Open the settings', fr: 'Ouvrir les réglages' },
		/** While on or paused. Backed by: routes/(app)/opportunities (the candidate's inbox) */
		opportunities: {
			en: 'See the jobs proposed to you',
			fr: 'Voir les offres proposées'
		}
	}
});
