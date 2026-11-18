import { defineMessages } from 'portfolio-common';

// The texts of the step types of the hiring journey: what index.ts says of each on the Hire page,
// what its component shows the visitor, and its settings form in the owner's editor.
export const m = defineMessages({
	note: {
		read: { en: 'You have read this note.', fr: 'Vous avez lu cette note.' },
		ask: { en: 'Read the note, then confirm it.', fr: 'Lisez la note, puis confirmez-la.' },
		signIn: {
			en: 'Sign in to confirm that you have read this.',
			fr: 'Connectez-vous pour confirmer que vous avez lu ceci.'
		},
		confirm: { en: 'I have read this', fr: "J'ai lu ceci" },
		settings: {
			title: { en: 'Title', fr: 'Titre' },
			titlePlaceholder: { en: 'e.g. Before you book', fr: 'ex. : Avant de réserver' },
			titleHelp: {
				en: "The step's name on your Hire page.",
				fr: "Le nom de l'étape sur votre page Recruter."
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
		ask: {
			en: (ownerName: string) =>
				`The job you pick is scored out of 100 against what ${ownerName} is looking for.`,
			fr: (ownerName: string) =>
				`L'offre que vous choisissez est notée sur 100 par rapport à ce que recherche ${ownerName}.`
		},
		askMin: {
			en: (ownerName: string, minScore: number) =>
				`The job you pick is scored out of 100 against what ${ownerName} is looking for: at least ${minScore} opens the next step.`,
			fr: (ownerName: string, minScore: number) =>
				`L'offre que vous choisissez est notée sur 100 par rapport à ce que recherche ${ownerName} : il faut au moins ${minScore} pour ouvrir l'étape suivante.`
		},
		/** Before and after the score, for screen readers: "Score: 62 out of 100" */
		score: { en: 'Score:', fr: 'Note :' },
		outOf100: { en: 'out of 100', fr: 'sur 100' },
		closeEnough: {
			en: (title: string, ownerName: string) =>
				`${title} is close enough to what ${ownerName} is looking for.`,
			fr: (title: string, ownerName: string) =>
				`${title} est assez proche de ce que recherche ${ownerName}.`
		},
		notCloseEnough: {
			en: (title: string, ownerName: string) =>
				`${title} is not close enough to what ${ownerName} is looking for.`,
			fr: (title: string, ownerName: string) =>
				`${title} n'est pas assez proche de ce que recherche ${ownerName}.`
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
		raiseWithDetails: {
			en: 'What your job description does not state counts as not matching: completing it can raise the score.',
			fr: 'Ce que votre offre ne précise pas compte comme ne correspondant pas : la compléter peut augmenter la note.'
		},
		raiseWithoutDetails: {
			en: (ownerName: string) =>
				`${ownerName} does not share what they are looking for here. A job description that says more (seniority, skills, remote days, travel…) can score higher: what it leaves out counts as not matching.`,
			fr: (ownerName: string) =>
				`${ownerName} ne partage pas ses critères ici. Une offre qui en dit plus (niveau d'expérience, compétences, jours de télétravail, déplacements…) peut obtenir une meilleure note : ce qu'elle ne précise pas compte comme ne correspondant pas.`
		},
		pickAnother: {
			en: 'You can also pick another job in the step above.',
			fr: "Vous pouvez aussi choisir une autre offre à l'étape ci-dessus."
		},
		edit: { en: 'Edit this job description', fr: 'Modifier cette offre' },
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
		/** How the Hire page presents itself when the journey leads to a meeting (StepGoal) */
		goal: {
			heading: {
				en: (ownerName: string) => `Book a meeting with ${ownerName}`,
				fr: (ownerName: string) => `Réserver un rendez-vous avec ${ownerName}`
			},
			alone: {
				en: "Pick a time slot that suits you — you'll receive a calendar invitation by email.",
				fr: 'Choisissez un créneau qui vous convient : vous recevrez une invitation par e-mail.'
			},
			after: {
				en: "Then pick a time slot: you'll receive a calendar invitation by email.",
				fr: 'Choisissez ensuite un créneau : vous recevrez une invitation par e-mail.'
			}
		}
	}
});
