import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	title: { en: 'Get started', fr: 'Pour commencer' },
	intro: {
		en: 'What to set before you share your link. Each item can wait, in any order: your link works from now on.',
		fr: "Ce qu'il reste à régler avant de partager votre lien. Chaque point peut attendre, dans l'ordre que vous voulez : votre lien fonctionne dès maintenant."
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
		open: { en: 'Open my experiences', fr: 'Ouvrir mes expériences' }
	},

	perfectJob: {
		title: { en: 'What you want', fr: 'Ce que vous voulez' },
		toDo: {
			en: 'Rate the pay first, then what else matters to you. Recruiters never see what you ask: only how their job scores against it.',
			fr: "Notez d'abord la rémunération, puis ce qui compte aussi pour vous. Les recruteurs ne voient jamais ce que vous demandez : seulement la note de leur offre."
		},
		done: {
			en: (count: number) =>
				`The pay is rated, with ${count} ${plural(count, 'criterion', 'criteria')} in all.`,
			fr: (count: number) =>
				`La rémunération est notée, avec ${count} ${plural(count, 'critère', 'critères')} en tout.`
		},
		/** `essentials`: the essentials not rated yet, lowercased */
		suggest: {
			en: (essentials: readonly string[]) => `You could also rate: ${essentials.join(', ')}.`,
			fr: (essentials: readonly string[]) => `Vous pouvez aussi noter : ${essentials.join(', ')}.`
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
			en: 'Today anyone books a meeting from your page for recruiters. Ask for the job first, or keep the meeting alone.',
			fr: "Aujourd'hui, n'importe qui réserve un rendez-vous depuis votre page recruteurs. Demandez d'abord le poste, ou gardez seulement le rendez-vous."
		},
		/** A journey was saved, but it leads to no meeting */
		noMeeting: {
			en: 'Your steps lead to no meeting: recruiters cannot book one. Ask for the job first, or add a meeting step.',
			fr: "Vos étapes ne mènent à aucun rendez-vous : les recruteurs ne peuvent pas en réserver. Demandez d'abord le poste, ou ajoutez une étape de rendez-vous."
		},
		gate: {
			title: { en: 'Ask for the job first', fr: "Demander d'abord le poste" },
			text: {
				en: (minScore: number) =>
					`Recruiters read your note, share one of their job descriptions, and see it scored against what you want, criterion by criterion. They book a meeting only once it scores at least ${minScore} out of 100.`,
				fr: (minScore: number) =>
					`Les recruteurs lisent votre note, présentent l'une de leurs offres d'emploi et voient sa note au regard de ce que vous voulez, critère par critère. Ils ne réservent un rendez-vous qu'une fois la note de ${minScore} sur 100 atteinte.`
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
		keepMeeting: { en: 'Keep the meeting alone', fr: 'Garder seulement le rendez-vous' },
		/** The journey leads to a meeting without asking for a job first */
		noGate: {
			en: 'No job is asked for first. To ask for it:',
			fr: "Aucune offre n'est demandée avant. Pour la demander d'abord :"
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
			en: 'Connect Google Calendar and create an appointment schedule (its length and your hours), so recruiters can book a slot.',
			fr: 'Connectez Google Agenda et créez un agenda de rendez-vous (sa durée et vos horaires), pour que les recruteurs puissent réserver un créneau.'
		},
		schedule: {
			en: 'Connected. Create an appointment schedule (its length and your hours), or turn one on, so recruiters can book a slot.',
			fr: 'Connecté. Créez un agenda de rendez-vous (sa durée et vos horaires), ou activez-en un, pour que les recruteurs puissent réserver un créneau.'
		},
		done: {
			en: (count: number) =>
				`Recruiters can book: ${count} ${plural(count, 'appointment schedule', 'appointment schedules')} turned on.`,
			fr: (count: number) =>
				`Les recruteurs peuvent réserver : ${count} ${plural(count, 'agenda de rendez-vous activé', 'agendas de rendez-vous activés')}.`
		},
		open: { en: 'Open my calendar settings', fr: "Ouvrir mes réglages d'agenda" }
	},

	share: {
		title: { en: 'Your link', fr: 'Votre lien' },
		text: {
			en: 'Send it to the recruiters who write to you, or put it on your profiles: it opens your portfolio, from which recruiters reach your page for recruiters.',
			fr: "Envoyez-le aux recruteurs qui vous écrivent, ou ajoutez-le à vos profils : il ouvre votre portfolio, d'où les recruteurs rejoignent votre page recruteurs."
		},
		see: { en: 'See your page for recruiters', fr: 'Voir votre page recruteurs' }
	}
});
