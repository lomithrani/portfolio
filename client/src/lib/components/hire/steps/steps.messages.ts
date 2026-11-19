import { defineMessages } from 'portfolio-common';

// The texts of the step types of the hiring journey: what index.ts says of each on the Hire page,
// what its component shows the visitor, and its settings form in the owner's editor.
export const m = defineMessages({
	note: {
		read: { en: 'You have read this note.', fr: 'Vous avez lu cette note.' },
		ask: { en: 'Read the note, then confirm it.', fr: 'Lisez la note, puis confirmez-la.' },
		/** What the step asks, before the visitor starts ("Before you start") */
		asks: {
			en: (ownerName: string) => `Read ${ownerName}'s note, then confirm that you have read it.`,
			fr: (ownerName: string) =>
				`Lisez la note que ${ownerName} a écrite, puis confirmez l'avoir lue.`
		},
		signIn: {
			en: 'Sign in to confirm that you have read this.',
			fr: 'Connectez-vous pour confirmer que vous avez lu ceci.'
		},
		confirm: { en: 'I have read this', fr: "J'ai lu ceci" },
		settings: {
			title: { en: 'Title', fr: 'Titre' },
			titlePlaceholder: { en: 'e.g. Before you book', fr: 'ex. : Avant de réserver' },
			titleHelp: {
				en: "The step's name on your page for recruiters.",
				fr: "Le nom de l'étape sur votre page recruteurs."
			},
			text: { en: 'Note', fr: 'Note' },
			textPlaceholder: {
				en: 'What you are looking for, your conditions…',
				fr: 'Ce que vous recherchez, vos conditions…'
			},
			textHelp: {
				en: 'Recruiters read it and confirm before going further. Markdown is supported.',
				fr: "Les recruteurs la lisent et confirment avant d'aller plus loin. Markdown est pris en charge."
			}
		}
	},

	job: {
		/** The button unfolding the step once a job is picked */
		reopen: { en: 'Change', fr: 'Modifier' },
		/**
		 * What the step asks, before the visitor starts ("Before you start"). The minutes counted are a
		 * pick's: writing a job description on the way takes longer
		 */
		asks: {
			en: (ownerName: string) =>
				`Pick one of your open job descriptions, or write a new one (that takes longer). ${ownerName} sees it in the meeting invitation.`,
			fr: (ownerName: string) =>
				`Choisissez l'une de vos offres d'emploi ouvertes, ou rédigez-en une nouvelle (cela prend plus de temps). ${ownerName} la voit dans l'invitation au rendez-vous.`
		},
		jobsFailed: {
			en: 'Could not load your job descriptions.',
			fr: "Impossible de charger vos offres d'emploi."
		},
		imported: { en: 'Job description imported', fr: "Offre d'emploi importée" },
		picked: { en: 'Job picked', fr: 'Offre choisie' },
		signIn: {
			en: 'Sign in to pick the job you are hiring for. Your job descriptions are kept in a free recruiter space: you create it next if your account has none.',
			fr: "Connectez-vous pour choisir l'offre pour laquelle vous recrutez. Vos offres d'emploi sont conservées dans un espace recruteur gratuit : vous le créez ensuite si votre compte n'en a pas."
		},
		noSpace: {
			en: 'Your job descriptions live in a recruiter space. Create yours (it is free) to pick one or write a new one.',
			fr: "Vos offres d'emploi se trouvent dans un espace recruteur. Créez le vôtre (c'est gratuit) pour en choisir une ou en rédiger une nouvelle."
		},
		/** Create was pressed with the age and terms box unticked */
		tickTheBox: {
			en: 'Tick the box to confirm your age and accept the terms before you create your recruiter space.',
			fr: 'Cochez la case pour confirmer votre âge et accepter les conditions avant de créer votre espace recruteur.'
		},
		creatingSpace: { en: 'Creating…', fr: 'Création…' },
		createSpace: { en: 'Create my recruiter space', fr: 'Créer mon espace recruteur' },
		loadingJobs: {
			en: 'Loading your job descriptions…',
			fr: "Chargement de vos offres d'emploi…"
		},
		noJob: {
			en: 'You have no job description yet. Write the one you are hiring for: you come back here to pick it.',
			fr: "Vous n'avez pas encore d'offre d'emploi. Rédigez celle pour laquelle vous recrutez : vous revenez ici pour la choisir."
		},
		yourJobs: { en: 'Your job descriptions', fr: "Vos offres d'emploi" },
		/**
		 * Under a job to pick, the day it first left the draft status (`day`: '3 Nov 2026', shown as a
		 * <time>): a duplicate keeps its source's title, this tells them apart
		 */
		opened: {
			en: (day: string) => `Opened <time>${day}</time>`,
			fr: (day: string) => `Ouverte le <time>${day}</time>`
		},
		notPickable: {
			en: 'Only an open job description can be picked. <status>Change its status</status>',
			fr: 'Seule une offre ouverte peut être choisie. <status>Changer son statut</status>'
		},
		ownerSees: {
			en: (ownerName: string) => `${ownerName} sees the job you pick in the meeting invitation.`,
			fr: (ownerName: string) =>
				`${ownerName} voit l'offre que vous choisissez dans l'invitation au rendez-vous.`
		},
		continueWith: { en: 'Continue with this job', fr: 'Continuer avec cette offre' },
		write: { en: 'Write a new job description', fr: 'Rédiger une nouvelle offre' },
		importPdf: { en: 'Import from PDF', fr: 'Importer un PDF' },
		/** `quota`: how many imports the recruiter's plan has left, as jobImportQuotaText says it */
		importHelp: {
			en: (quota: string) =>
				`Import from PDF: Claude reads your job description into the form. ${quota}.`,
			fr: (quota: string) =>
				`Importer un PDF : Claude lit votre offre et remplit le formulaire. ${quota}.`
		}
	},

	jobMatch: {
		/**
		 * What the step asks, before the visitor starts ("Before you start"): with the minimum its
		 * settings show visitors, then without one. Next to a note step, the score is « résultat ».
		 * Neutral, like every text of this step: the job is scored against the owner's criteria,
		 * never "what they are looking for" (having a portfolio says nothing about looking for a job,
		 * as the landing's FAQ says)
		 */
		asks: {
			en: (ownerName: string, minScore: number) =>
				`Your job is scored out of 100 against ${ownerName}'s criteria: you see your score, never what they ask for. At least ${minScore} opens the next step.`,
			fr: (ownerName: string, minScore: number) =>
				`Votre offre est notée sur 100 selon les critères de ${ownerName} : vous voyez son résultat, jamais ce qui est demandé. Il faut au moins ${minScore} pour ouvrir l'étape suivante.`
		},
		asksNoMin: {
			en: (ownerName: string) =>
				`Your job is scored out of 100 against ${ownerName}'s criteria: you see your score, never what they ask for.`,
			fr: (ownerName: string) =>
				`Votre offre est notée sur 100 selon les critères de ${ownerName} : vous voyez son résultat, jamais ce qui est demandé.`
		},
		ask: {
			en: (ownerName: string) =>
				`The job you pick is scored out of 100 against ${ownerName}'s criteria.`,
			fr: (ownerName: string) =>
				`L'offre que vous choisissez est notée sur 100 selon les critères de ${ownerName}.`
		},
		askMin: {
			en: (ownerName: string, minScore: number) =>
				`The job you pick is scored out of 100 against ${ownerName}'s criteria: at least ${minScore} opens the next step.`,
			fr: (ownerName: string, minScore: number) =>
				`L'offre que vous choisissez est notée sur 100 selon les critères de ${ownerName} : il faut au moins ${minScore} pour ouvrir l'étape suivante.`
		},
		/** Before and after the score, for screen readers: "Score: 62 out of 100" */
		score: { en: 'Score:', fr: 'Note :' },
		outOf100: { en: 'out of 100', fr: 'sur 100' },
		closeEnough: {
			en: (title: string, ownerName: string) =>
				`${title} matches ${ownerName}'s criteria closely enough.`,
			fr: (title: string, ownerName: string) =>
				`${title} correspond assez aux critères de ${ownerName}.`
		},
		notCloseEnough: {
			en: (title: string, ownerName: string) =>
				`${title} does not match ${ownerName}'s criteria closely enough.`,
			fr: (title: string, ownerName: string) =>
				`${title} ne correspond pas assez aux critères de ${ownerName}.`
		},
		asksFor: {
			en: (ownerName: string, minScore: number) =>
				`${ownerName} asks for at least ${minScore} out of 100.`,
			fr: (ownerName: string, minScore: number) =>
				`${ownerName} demande au moins ${minScore} sur 100.`
		},
		minimum: {
			en: (minScore: number) => `Minimum ${minScore}`,
			fr: (minScore: number) => `Minimum ${minScore}`
		},
		criteria: {
			en: (ownerName: string) => `How your job does on what matters to ${ownerName}`,
			fr: (ownerName: string) => `Votre offre face à ce qui compte pour ${ownerName}`
		},
		dealBreaker: { en: 'Deal-breaker', fr: 'Éliminatoire' },
		commute: {
			en: (ownerName: string) =>
				`The commute is ${ownerName}'s travel time to your job's address, there and back, over a week.`,
			fr: (ownerName: string) =>
				`Le trajet est le temps que met ${ownerName} pour aller à l'adresse de votre offre et en revenir, sur une semaine.`
		},
		/** Who the travel times come from: on a site without public transport, then with each service it can ask */
		commuteSources: {
			none: {
				en: 'Travel times: <ign>Géoplateforme (IGN)</ign>.',
				fr: 'Temps de trajet : <ign>Géoplateforme (IGN)</ign>.'
			},
			here: {
				en: 'Travel times: <ign>Géoplateforme (IGN)</ign> and, by public transport, <here>HERE</here>.',
				fr: 'Temps de trajet : <ign>Géoplateforme (IGN)</ign> et, en transports en commun, <here>HERE</here>.'
			},
			transitous: {
				en: 'Travel times: <ign>Géoplateforme (IGN)</ign>, <transitous>Transitous</transitous> and <osm>OpenStreetMap contributors</osm>.',
				fr: "Temps de trajet : <ign>Géoplateforme (IGN)</ign>, <transitous>Transitous</transitous> et <osm>les contributeurs d'OpenStreetMap</osm>."
			}
		},
		dealBreakerMissed: {
			en: (ownerName: string) =>
				`A job that does not match a deal-breaker of ${ownerName}'s scores 0, whatever the rest.`,
			fr: (ownerName: string) =>
				`Une offre qui ne correspond pas à un critère éliminatoire pour ${ownerName} obtient 0, quel que soit le reste.`
		},
		/**
		 * Under the minimum, with the criteria shown. The job was opened to be picked: its terms are
		 * locked, a new version of them is a new job description (Duplicate)
		 */
		raiseWithDetails: {
			en: 'What your job description does not state counts as not matching. Its pay and conditions have been locked since it was opened, but a new job description that states more can score higher: duplicate this one, complete the copy and open it, then pick it above.',
			fr: "Ce que votre offre ne précise pas compte comme ne correspondant pas. Sa rémunération et ses conditions sont verrouillées depuis son ouverture, mais une nouvelle offre qui en précise davantage peut obtenir une meilleure note : dupliquez celle-ci, complétez la copie et ouvrez-la, puis choisissez-la à l'étape ci-dessus."
		},
		/** The same, the owner not sharing the criteria */
		raiseWithoutDetails: {
			en: (ownerName: string) =>
				`${ownerName} does not share their criteria here. A job description that says more (seniority, skills, remote days, travel…) can score higher: what it leaves out counts as not matching. Its pay and conditions have been locked since it was opened: duplicate it, complete the copy and open it, then pick it above.`,
			fr: (ownerName: string) =>
				`${ownerName} ne partage pas ses critères ici. Une offre qui en dit plus (niveau d'expérience, compétences, jours de télétravail, déplacements…) peut obtenir une meilleure note : ce qu'elle ne précise pas compte comme ne correspondant pas. Sa rémunération et ses conditions sont verrouillées depuis son ouverture : dupliquez-la, complétez la copie et ouvrez-la, puis choisissez-la à l'étape ci-dessus.`
		},
		pickAnother: {
			en: 'You can also pick another job in the step above.',
			fr: "Vous pouvez aussi choisir une autre offre à l'étape ci-dessus."
		},
		/** A new job description copied from the one scored (its terms are locked) */
		duplicate: { en: 'Duplicate this job description', fr: 'Dupliquer cette offre' },
		checkAgain: { en: 'Check again', fr: 'Vérifier de nouveau' },
		settings: {
			minScore: { en: 'Minimum score', fr: 'Note minimale' },
			/** `min`: the lowest minimum, which stops no job */
			minScoreHelp: {
				en: (min: number) =>
					`A job that scores less cannot go further. ${min} lets every job through.`,
				fr: (min: number) =>
					`Une offre moins bien notée ne peut pas aller plus loin. ${min} laisse passer toutes les offres.`
			},
			showDetails: {
				en: 'Show recruiters how their job does on each criterion',
				fr: 'Montrer aux recruteurs le résultat de leur offre sur chaque critère'
			},
			showDetailsHelp: {
				en: "They see each criterion's name and whether their job matches it, never what you ask for or how much it matters. Without it, they see their score and your minimum only.",
				fr: 'Ils voient le nom de chaque critère et si leur offre y correspond, jamais ce que vous demandez ni son importance. Sinon, ils ne voient que leur note et votre minimum.'
			},
			noCriterion: {
				en: 'Your perfect job has no criterion yet: every job scores 100 until you rate some in the Perfect job tab.',
				fr: "Votre poste idéal n'a encore aucun critère : toutes les offres obtiennent 100 tant que vous n'en avez renseigné aucun dans l'onglet Poste idéal."
			},
			scoredOn: {
				en: (count: number) =>
					`Scored on the ${count === 1 ? 'criterion' : `${count} criteria`} of your perfect job (the Perfect job tab).`,
				fr: (count: number) =>
					`Notée sur ${count === 1 ? 'le critère' : `les ${count} critères`} de votre poste idéal (onglet Poste idéal).`
			}
		}
	},

	meeting: {
		booked: {
			en: 'You booked a meeting. You can book another slot.',
			fr: 'Vous avez réservé un rendez-vous. Vous pouvez réserver un autre créneau.'
		},
		ask: { en: 'Pick a time slot that suits you.', fr: 'Choisissez un créneau qui vous convient.' },
		/** What the step asks, before the visitor starts ("Before you start") */
		asks: {
			en: 'Pick a time slot, then give your name and email address.',
			fr: 'Choisissez un créneau, puis indiquez votre nom et votre adresse e-mail.'
		},
		/** What the Hire page says under its title when the journey leads to a meeting (StepGoal) */
		goal: {
			alone: {
				en: "Pick a time slot that suits you — you'll receive a calendar invitation by email.",
				fr: 'Choisissez un créneau qui vous convient : vous recevrez une invitation par e-mail.'
			},
			after: {
				en: "Then pick a time slot: you'll receive a calendar invitation by email.",
				fr: 'Choisissez ensuite un créneau : vous recevrez une invitation par e-mail.'
			},
			/**
			 * What happens once the meeting is booked ("Before you start"), and that the owner learns who
			 * the recruiter is only then.
			 * Backed by: POST /appointments/book (server/plugins/appointments.ts), which invites the name
			 * and address typed in the booking form and puts the job picked in the invitation
			 * (`describe` of server/services/workflowSteps/job.ts); before it, nothing shows the owner
			 * who went through their steps: no route lists a journey's visitors (WorkflowInstance is read
			 * only for the visitor's own progress, server/services/workflows.ts), and a posting's DTO
			 * never names its recruiter (server/services/jobPostings.ts)
			 */
			next: {
				en: (ownerName: string) =>
					`Once you book, you receive a calendar invitation by email, and the meeting goes into ${ownerName}'s calendar: only then do they get your name and email address.`,
				fr: (ownerName: string) =>
					`Une fois le créneau réservé, vous recevez une invitation par e-mail, et ${ownerName} retrouve le rendez-vous dans son agenda : ce n'est qu'à ce moment-là que votre nom et votre adresse e-mail lui parviennent.`
			}
		}
	},

	/**
	 * What a visitor needs at hand for the steps (StepNeed), each said once in "Before you start".
	 * The job description: every posting states its pay range (validateJobPosting); the PDF
	 * import is offered only where the API has it on (GET /jobs/import), which a visitor signed out
	 * cannot know
	 */
	needs: {
		googleAccount: {
			en: 'A Google account, to sign in',
			fr: 'Un compte Google, pour vous connecter'
		},
		jobDescription: {
			en: 'The job description and its pay range, or its PDF where import is offered',
			fr: "L'offre d'emploi et sa fourchette de rémunération, ou son PDF lorsque l'import est proposé"
		}
	}
});
