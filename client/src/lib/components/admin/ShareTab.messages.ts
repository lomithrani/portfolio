import { defineMessages } from 'portfolio-common';

// The texts of the admin's Share tab. The texts it writes for the owner to copy (the reply, the
// LinkedIn text) are in services/shareKit.messages.ts: in the language the owner picks for them.
export const m = defineMessages({
	title: { en: 'Share your link', fr: 'Partager votre lien' },
	intro: {
		en: 'Your portfolio is a career page you keep, like a professional profile: put your link where recruiters find you and, from here, answer the ones who write to you. Nothing on this tab is saved or sent: you copy what you want.',
		fr: "Votre portfolio est une page de carrière que vous gardez, comme un profil professionnel : mettez votre lien là où les recruteurs vous trouvent et, d'ici, répondez à ceux qui vous écrivent. Rien n'est enregistré ni envoyé depuis cet onglet : vous copiez ce que vous voulez."
	},
	link: {
		title: { en: 'Your link', fr: 'Votre lien' },
		see: { en: 'See your page for recruiters', fr: 'Voir votre page recruteurs' }
	},
	/** The language of the reply and of the LinkedIn text: the recruiter's, whatever the page's */
	language: {
		legend: { en: 'Language of the texts', fr: 'Langue des textes' },
		hint: {
			en: 'The one the recruiter wrote in, whatever the language of this page.',
			fr: 'Celle dans laquelle le recruteur vous a écrit, quelle que soit la langue de cette page.'
		},
		/** A language, inside a sentence: "Your reply, in English" */
		name: {
			english: { en: 'English', fr: 'anglais' },
			french: { en: 'French', fr: 'français' }
		}
	},
	/**
	 * What the account set up (GET /me/readiness) could not be read, or read again: the texts then
	 * promise nothing of the page for recruiters, whatever was read before
	 */
	readinessFailed: {
		'session-expired': {
			en: 'Your session expired, so what your steps ask of recruiters could not be read. Sign in again in another tab, then try again.',
			fr: "Votre session a expiré : ce que vos étapes demandent aux recruteurs n'a pas pu être lu. Reconnectez-vous dans un autre onglet, puis réessayez."
		},
		network: {
			en: 'Could not reach the server to read what your steps ask of recruiters. Check your connection and try again.',
			fr: 'Impossible de joindre le serveur pour lire ce que vos étapes demandent aux recruteurs. Vérifiez votre connexion et réessayez.'
		},
		error: {
			en: 'What your steps ask of recruiters could not be read. Try again.',
			fr: "Ce que vos étapes demandent aux recruteurs n'a pas pu être lu. Réessayez."
		}
	},
	reply: {
		title: { en: 'Reply to a recruiter', fr: 'Répondre à un recruteur' },
		/** The journey has a job step */
		asksThere: {
			en: 'It asks them to share the role on your page for recruiters, with its pay range, and says what comes next there.',
			fr: 'Elle lui demande de présenter le poste sur votre page recruteurs, avec sa fourchette de rémunération, et dit ce qui suit sur cette page.'
		},
		/** The journey asks for no job */
		asksBack: {
			en: 'It asks them to send you the job description, with its pay range. Your page for recruiters does not ask for the job: to have them share it there first, ask for it in your steps.',
			fr: "Elle lui demande de vous envoyer l'offre d'emploi, avec sa fourchette de rémunération. Votre page recruteurs ne demande pas l'offre : pour qu'il l'y présente d'abord, demandez-la dans vos étapes."
		},
		/**
		 * After asksThere, for the gate with a perfect job that has no criterion: the texts do not say
		 * the job is scored
		 */
		nothingToScore: {
			en: 'Your perfect job has no criterion yet: every job would score 100, so the texts do not say the job is scored. Say what you want first.',
			fr: "Votre poste idéal n'a encore aucun critère : toute offre obtiendrait 100, les textes ne disent donc pas que l'offre est notée. Dites d'abord ce que vous voulez."
		},
		/** After nothingToScore: the admin's Perfect job tab */
		setPerfectJob: { en: 'Set my perfect job', fr: 'Définir mon poste idéal' },
		/**
		 * A step before the meeting can never be passed (a journey saved by an older version): the
		 * reply sends recruiters nowhere on the page for recruiters
		 */
		blocked: {
			en: 'A step of your page for recruiters is not available anymore: recruiters cannot get past it. Until you remove it from your steps, the reply asks for the job description, with its pay range, and gives your portfolio.',
			fr: "L'une des étapes de votre page recruteurs n'est plus disponible : les recruteurs ne peuvent pas la franchir. Tant que vous ne l'avez pas retirée de vos étapes, la réponse demande l'offre d'emploi, avec sa fourchette de rémunération, et donne votre portfolio."
		},
		/** After blocked: the admin's Hiring journey tab, where a step is removed */
		changeSteps: { en: 'Change my steps', fr: 'Modifier mes étapes' },
		/** What the account set up could not be read (yet): the reply promises nothing of the page */
		asksUnknown: {
			en: 'It asks them to send you the job description, with its pay range, and gives your portfolio.',
			fr: "Elle lui demande de vous envoyer l'offre d'emploi, avec sa fourchette de rémunération, et donne votre portfolio."
		},
		/**
		 * The steps lead to a meeting, but the calendar is not open: nobody can book, so the reply
		 * does not send recruiters to the page for recruiters
		 */
		calendarClosed: {
			en: 'Until your calendar is open, recruiters cannot book on your page for recruiters, so the reply asks for the job description, with its pay range, and gives your portfolio.',
			fr: "Tant que votre agenda n'est pas ouvert, les recruteurs ne peuvent pas réserver sur votre page recruteurs : la réponse demande donc l'offre d'emploi, avec sa fourchette de rémunération, et donne votre portfolio."
		},
		/** The same, on a site that takes no Google Calendar connection: nothing the owner can do */
		bookingUnavailable: {
			en: 'Online booking is not available on this site for now: the reply asks for the job description, with its pay range, and gives your portfolio.',
			fr: "La réservation en ligne n'est pas disponible sur ce site pour le moment : la réponse demande l'offre d'emploi, avec sa fourchette de rémunération, et donne votre portfolio."
		},
		setSteps: { en: 'Set my steps', fr: 'Régler mes étapes' },
		/** After calendarClosed: the admin's Appointments tab */
		openCalendar: { en: 'Open my calendar settings', fr: "Ouvrir mes réglages d'agenda" },
		label: {
			en: (language: string) => `Your reply, in ${language}`,
			fr: (language: string) => `Votre réponse, en ${language}`
		},
		copy: { en: 'Copy the reply', fr: 'Copier la réponse' },
		/**
		 * Under the reply, which ends with its closing ("Best regards,"): the owner signs it where
		 * they send it (the text carries no name, nor a placeholder to fill in)
		 */
		sign: {
			en: 'Add your name at the end before you send it.',
			fr: "Ajoutez votre nom à la fin avant de l'envoyer."
		}
	},
	facts: {
		legend: {
			en: 'Add what you ask for (optional)',
			fr: 'Ajouter ce que vous demandez (facultatif)'
		},
		hint: {
			en: 'Left unticked, the reply says nothing of it. Once ticked, it is filled in from your perfect job: change it as you like, nothing is saved.',
			fr: "Non coché, la réponse n'en dit rien. Une fois coché, il est rempli depuis votre poste idéal : modifiez-le à votre guise, rien n'est enregistré."
		},
		pay: { en: 'The pay I ask for', fr: 'La rémunération que je demande' },
		amount: { en: 'Gross amount, in euros', fr: 'Montant brut, en euros' },
		/** Under the amount, when it is not a whole number above 0: the reply leaves the pay out */
		amountInvalid: {
			en: 'Write a whole number of euros, such as 65000: until then, the reply leaves the pay out.',
			fr: "Écrivez un nombre entier d'euros, par exemple 65000 : d'ici là, la réponse ne dit rien de la rémunération."
		},
		per: { en: 'Per', fr: 'Par' },
		perYear: { en: 'a year', fr: 'an' },
		perDay: { en: 'a day', fr: 'jour' },
		remoteDays: { en: 'Remote days a week', fr: 'Jours de télétravail par semaine' },
		/** The remote days left to choose */
		remoteDaysNone: { en: 'Choose', fr: 'Choisir' },
		/** Five remote days a week */
		fullyRemote: { en: 'Fully remote', fr: 'Télétravail complet' },
		places: { en: 'Where', fr: 'Où' },
		placesExample: { en: 'Paris, Lyon', fr: 'Paris, Lyon' },
		contracts: { en: 'Contracts', fr: 'Contrats' },
		loading: {
			en: 'Filling it in from your perfect job…',
			fr: 'Remplissage depuis votre poste idéal…'
		},
		failed: {
			en: 'Could not read your perfect job: fill it in yourself.',
			fr: 'Impossible de lire votre poste idéal : remplissez-le vous-même.'
		}
	},
	linkedIn: {
		title: { en: 'On LinkedIn', fr: 'Sur LinkedIn' },
		hint: {
			en: 'Paste it in the About section of your profile, and add your link to its contact info as a website.',
			fr: 'Collez-le dans la section Infos de votre profil, et ajoutez votre lien à ses coordonnées comme site web.'
		},
		/**
		 * Why the text gives only the portfolio, as the reply's hint says it of the reply: the page for
		 * recruiters is left out while recruiters cannot book there or get through it, or while
		 * what the steps ask could not be read
		 */
		portfolioOnly: {
			calendarClosed: {
				en: 'Until your calendar is open, this text gives only your portfolio: recruiters cannot book on your page for recruiters yet.',
				fr: "Tant que votre agenda n'est pas ouvert, ce texte ne donne que votre portfolio : les recruteurs ne peuvent pas encore réserver sur votre page recruteurs."
			},
			bookingUnavailable: {
				en: 'Online booking is not available on this site for now, so this text gives only your portfolio.',
				fr: "La réservation en ligne n'est pas disponible sur ce site pour le moment : ce texte ne donne donc que votre portfolio."
			},
			blocked: {
				en: 'Until you remove the step recruiters cannot get past, this text gives only your portfolio.',
				fr: "Tant que vous n'avez pas retiré l'étape que les recruteurs ne peuvent pas franchir, ce texte ne donne que votre portfolio."
			},
			unread: {
				en: 'What your steps ask of recruiters could not be read, so this text gives only your portfolio.',
				fr: "Ce que vos étapes demandent aux recruteurs n'a pas pu être lu : ce texte ne donne donc que votre portfolio."
			},
			/** Steps that lead to no meeting (none at all) */
			noMeeting: {
				en: 'Your steps lead to no meeting, so this text gives only your portfolio.',
				fr: 'Vos étapes ne mènent à aucun rendez-vous : ce texte ne donne donc que votre portfolio.'
			}
		},
		label: {
			en: (language: string) => `Your LinkedIn text, in ${language}`,
			fr: (language: string) => `Votre texte LinkedIn, en ${language}`
		},
		copy: { en: 'Copy the text', fr: 'Copier le texte' }
	}
});
