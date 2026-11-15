import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	loadFailed: {
		en: 'Could not load your perfect job.',
		fr: 'Impossible de charger votre poste idéal.'
	},
	saveFailed: {
		en: 'Could not save your perfect job. Try again.',
		fr: "Impossible d'enregistrer votre poste idéal. Réessayez."
	},
	/** A save refused for an expired session: the page stays as it is, with what was typed */
	sessionExpired: {
		en: 'Your session expired. Your changes are still here: sign in again in another tab, then save.',
		fr: 'Votre session a expiré. Vos modifications sont toujours là : reconnectez-vous dans un autre onglet, puis enregistrez.'
	},
	leaveUnsaved: {
		en: 'Leave without saving your perfect job? Your changes will be lost.',
		fr: 'Quitter sans enregistrer votre poste idéal ? Vos modifications seront perdues.'
	},
	saved: { en: 'Perfect job saved', fr: 'Poste idéal enregistré' },
	title: { en: 'Perfect job', fr: 'Poste idéal' },
	intro: {
		en: 'Say what you look for in a job and how much each point matters. The job a recruiter picks in your hiring journey is scored against it, out of 100.',
		fr: "Dites ce que vous attendez d'un poste et l'importance de chaque point. L'offre qu'un recruteur choisit dans votre parcours de recrutement est notée sur 100 par rapport à votre poste idéal."
	},
	loading: { en: 'Loading your perfect job...', fr: 'Chargement de votre poste idéal…' },

	// --- How a job is scored ---
	scoring: {
		title: { en: 'How a job is scored', fr: 'Comment une offre est notée' },
		importance: {
			en: 'Each criterion you switch on counts for its importance, from 1 to 5. The score is what the job matches out of the total, on 100.',
			fr: "Chaque critère activé compte selon son importance, de 1 à 5. La note est la part du total à laquelle l'offre correspond, sur 100."
		},
		partly: {
			en: 'Some criteria can match partly: a pay a little under yours, fewer remote days.',
			fr: 'Certains critères peuvent correspondre en partie : une rémunération un peu inférieure à la vôtre, moins de jours de télétravail.'
		},
		notStated: {
			en: 'What a job description does not state (its seniority, its skills, its travel…) counts as not matching.',
			fr: "Ce qu'une offre ne précise pas (son niveau d'expérience, ses compétences, ses déplacements…) compte comme ne correspondant pas."
		},
		dealBreaker: {
			en: 'A deal-breaker the job does not match at all brings the score to 0.',
			fr: "Un critère éliminatoire auquel l'offre ne correspond pas du tout ramène la note à 0."
		},
		/** `step`: the label of the journey's step that uses the score */
		use: {
			en: (step: string) =>
				`Recruiters never see your criteria. To use the score, add the step “${step}” to your <journey>hiring journey</journey> and set the minimum there.`,
			fr: (step: string) =>
				`Les recruteurs ne voient jamais vos critères. Pour utiliser la note, ajoutez l'étape « ${step} » à votre <journey>parcours de recrutement</journey> et fixez-y la note minimale.`
		}
	},

	groups: {
		role: { en: 'The role', fr: 'Le poste' },
		place: { en: 'The place', fr: 'Le lieu' },
		contract: { en: 'The contract and the time', fr: 'Le contrat et le temps de travail' },
		pay: { en: 'The pay', fr: 'La rémunération' },
		skills: { en: 'The skills', fr: 'Les compétences' },
		conditions: { en: 'The conditions', fr: 'Les conditions' }
	},

	// --- The role ---
	titles: {
		description: {
			en: 'The job titles you are after. A job matches when its title has one of them, as whole words.',
			fr: "Les intitulés de poste que vous visez. Une offre correspond quand son intitulé contient l'un d'eux, en mots entiers."
		},
		label: { en: 'Job titles', fr: 'Intitulés de poste' },
		placeholder: { en: 'e.g. Staff Engineer', fr: 'ex. : Staff Engineer' }
	},
	seniority: {
		description: { en: 'The levels you would take.', fr: 'Les niveaux que vous accepteriez.' },
		legend: { en: 'Levels', fr: 'Niveaux' }
	},
	management: {
		description: {
			en: "Whether you want people reporting to you (the job's direct reports).",
			fr: 'Si vous voulez encadrer une équipe (les personnes directement rattachées au poste).'
		},
		legend: { en: 'You want', fr: 'Vous voulez' }
	},

	// --- The place ---
	workMode: {
		description: {
			en: 'How you want to work: at the office, partly or fully remote.',
			fr: 'Comment vous voulez travailler : au bureau, en partie ou entièrement en télétravail.'
		},
		legend: { en: 'Work modes you accept', fr: 'Modes de travail que vous acceptez' },
		minRemoteDays: {
			en: 'Remote days a week in a hybrid job, at least',
			fr: 'Jours de télétravail par semaine en hybride, au moins'
		},
		anyNumber: { en: 'Any number', fr: 'Peu importe' },
		minRemoteDaysHelp: {
			en: 'A hybrid job with fewer remote days matches in proportion.',
			fr: 'Une offre hybride avec moins de jours de télétravail correspond en proportion.'
		}
	},
	cities: {
		description: {
			en: 'Where the office can be. A fully remote job has no office: it always matches.',
			fr: "Où le bureau peut se trouver. Une offre entièrement en télétravail n'a pas de bureau : elle correspond toujours."
		},
		label: { en: 'Cities or postal codes', fr: 'Villes ou codes postaux' },
		placeholder: { en: 'e.g. Lyon, or 69', fr: 'ex. : Lyon, ou 69' },
		hint: {
			en: "A city's name, or the first digits of a postal code (69 for the Rhône).",
			fr: "Le nom d'une ville, ou les premiers chiffres d'un code postal (69 pour le Rhône)."
		}
	},
	commute: {
		description: {
			en: 'The time you accept on the way to work and back, over a week. A job you go to once a week can be further away than one you go to every day; a fully remote job has no commute.',
			fr: "Le temps que vous acceptez de passer à aller au travail et en revenir, sur une semaine. Un poste où vous allez une fois par semaine peut être plus loin qu'un poste où vous allez tous les jours ; en télétravail complet, il n'y a pas de trajet."
		},
		/** On a site that does not compute travel times */
		descriptionOff: {
			en: 'The time you accept on the way to work and back, over a week. This site does not compute travel times: the criterion cannot be used here.',
			fr: 'Le temps que vous acceptez de passer à aller au travail et en revenir, sur une semaine. Ce site ne calcule pas les temps de trajet : ce critère ne peut pas être utilisé ici.'
		},
		off: {
			en: "This site does not compute travel times right now: the commute does not count in a job's score, and its address cannot be changed.",
			fr: "Ce site ne calcule pas les temps de trajet pour le moment : le trajet ne compte pas dans la note d'une offre, et son adresse ne peut pas être modifiée."
		},
		from: { en: 'Where you travel from', fr: "D'où vous partez" },
		fromPlaceholder: {
			en: 'e.g. 10 rue de la République, 69001 Lyon',
			fr: 'ex. : 10 rue de la République, 69001 Lyon'
		},
		/** `place`: the address the map service found for what was typed */
		found: {
			en: (place: string) => `Found: ${place}.`,
			fr: (place: string) => `Trouvé : ${place}.`
		},
		fromHelp: {
			en: 'Your address, or a street nearby if you prefer. Start typing, then pick it in the list: it is the address travel times are counted from.',
			fr: "Votre adresse, ou une rue proche si vous préférez. Commencez à saisir, puis choisissez-la dans la liste : c'est de cette adresse que les temps de trajet sont comptés."
		},
		modes: { en: 'How you would travel', fr: 'Comment vous vous déplaceriez' },
		modesHelp: {
			en: 'The fastest of them counts. By bike, the time is estimated at 15 km/h.',
			fr: 'Le plus rapide compte. À vélo, le temps est estimé à 15 km/h.'
		},
		time: {
			en: 'Travel time you accept a week, there and back',
			fr: 'Temps de trajet accepté par semaine, aller-retour'
		},
		hours: { en: 'Hours a week', fr: 'Heures par semaine' },
		minutes: { en: 'Minutes a week', fr: 'Minutes par semaine' },
		/** Shown until a time is typed; then what that time means for a job is */
		eachDay: {
			en: 'Each day at the office counts the way there and back.',
			fr: "Chaque jour au bureau compte l'aller et le retour."
		},
		over: {
			en: 'A job over it matches less, and not at all 50% over.',
			fr: "Au-delà, l'offre correspond moins, et plus du tout à 50 % de plus."
		},
		/** Who the address goes to: on a site without public transport, then with each service it can ask */
		privacy: {
			none: {
				en: 'Only you see this address. To find it as you type and to compute travel times, it is sent, without your name, to the map service of the French state (<ign>Géoplateforme, IGN</ign>). Recruiters learn whether their job matches, never where you are.',
				fr: "Vous seul voyez cette adresse. Pour la trouver pendant la saisie et calculer les temps de trajet, elle est envoyée, sans votre nom, au service cartographique de l'État français (<ign>Géoplateforme, IGN</ign>). Les recruteurs savent si leur offre correspond, jamais où vous êtes."
			},
			here: {
				en: 'Only you see this address. To find it as you type and to compute travel times, it is sent, without your name, to the map service of the French state (<ign>Géoplateforme, IGN</ign>), and its position to <here>HERE</here>, a journey planner, for public transport. Recruiters learn whether their job matches, never where you are.',
				fr: "Vous seul voyez cette adresse. Pour la trouver pendant la saisie et calculer les temps de trajet, elle est envoyée, sans votre nom, au service cartographique de l'État français (<ign>Géoplateforme, IGN</ign>), et sa position à <here>HERE</here>, un calculateur d'itinéraires, pour les transports en commun. Les recruteurs savent si leur offre correspond, jamais où vous êtes."
			},
			transitous: {
				en: 'Only you see this address. To find it as you type and to compute travel times, it is sent, without your name, to the map service of the French state (<ign>Géoplateforme, IGN</ign>), and its position to <transitous>Transitous</transitous>, a community journey planner. Recruiters learn whether their job matches, never where you are.',
				fr: "Vous seul voyez cette adresse. Pour la trouver pendant la saisie et calculer les temps de trajet, elle est envoyée, sans votre nom, au service cartographique de l'État français (<ign>Géoplateforme, IGN</ign>), et sa position à <transitous>Transitous</transitous>, un calculateur d'itinéraires communautaire. Les recruteurs savent si leur offre correspond, jamais où vous êtes."
			}
		}
	},

	// --- The contract and the time ---
	contractTypes: {
		description: { en: 'The contracts you would sign.', fr: 'Les contrats que vous signeriez.' },
		legend: { en: 'Contracts', fr: 'Contrats' }
	},
	workingTime: {
		description: {
			en: 'How your working time is counted, and how many hours a week at most.',
			fr: "Comment votre temps de travail est décompté, et combien d'heures par semaine au plus."
		},
		legend: {
			en: 'Working time you accept, counted in',
			fr: 'Temps de travail accepté, décompté en'
		},
		maxHours: {
			en: 'Hours a week, at most <note>(optional)</note>',
			fr: 'Heures par semaine, au plus <note>(facultatif)</note>'
		},
		maxHoursPlaceholder: { en: 'e.g. 35', fr: 'ex. : 35' },
		maxHoursHelp: {
			en: (tolerance: number) =>
				`A job over it matches less with each hour, and not at all ${tolerance} hours over.`,
			fr: (tolerance: number) =>
				`Au-delà, l'offre correspond un peu moins pour chaque heure supplémentaire, et plus du tout à ${tolerance} heures de plus.`
		}
	},
	rttDays: {
		description: {
			en: 'The reduced working time days (RTT) you want a year. A job with fewer matches in proportion.',
			fr: 'Les jours de réduction du temps de travail (RTT) que vous voulez par an. Une offre qui en propose moins correspond en proportion.'
		},
		min: { en: 'RTT days a year, at least', fr: 'Jours de RTT par an, au moins' },
		minPlaceholder: { en: 'e.g. 10', fr: 'ex. : 10' }
	},

	// --- The pay ---
	pay: {
		/** `percent`: how far under the pay asked a job stops matching */
		description: {
			en: (percent: number) =>
				`The gross pay (brut) you ask for, in euros. A job matches when the middle of its range reaches it, partly when it is under, and not at all ${percent}% under.`,
			fr: (percent: number) =>
				`La rémunération brute que vous demandez, en euros. Une offre correspond quand le milieu de sa fourchette l'atteint, en partie quand il est en dessous, et plus du tout à ${percent} % en dessous.`
		},
		perYear: { en: 'Per year', fr: 'Par an' },
		perYearPlaceholder: { en: 'e.g. 70 000', fr: 'ex. : 70 000' },
		perDay: {
			en: 'Per day <note>(day rates)</note>',
			fr: 'Par jour <note>(tarif journalier)</note>'
		},
		perDayPlaceholder: { en: 'e.g. 600', fr: 'ex. : 600' },
		/** `days`: the working days of a year, to convert a day rate */
		help: {
			en: (days: number) =>
				`Give one or both. With one only, the other kind of job is converted (${days} days a year); a monthly pay counts 12 months.`,
			fr: (days: number) =>
				`Indiquez l'un, l'autre ou les deux. Avec un seul, l'autre type d'offre est converti (${days} jours par an) ; une rémunération mensuelle compte 12 mois.`
		}
	},

	// --- The skills ---
	skills: {
		description: {
			en: 'What you want to work with. A job scores by the share of the skills it asks for that are in your list.',
			fr: "Ce avec quoi vous voulez travailler. Une offre est notée selon la part des compétences qu'elle demande qui figurent dans votre liste."
		},
		label: { en: 'Skills you want to use', fr: 'Compétences que vous voulez utiliser' },
		placeholder: { en: 'e.g. TypeScript', fr: 'ex. : TypeScript' }
	},
	avoidedSkills: {
		description: {
			en: 'What you do not want to work with. A job asking for one of them does not match.',
			fr: 'Ce avec quoi vous ne voulez pas travailler. Une offre qui en demande une ne correspond pas.'
		},
		label: { en: 'Skills you want to avoid', fr: 'Compétences que vous voulez éviter' },
		placeholder: { en: 'e.g. PHP', fr: 'ex. : PHP' }
	},

	// --- The conditions ---
	travel: {
		description: {
			en: 'How much the job can make you travel.',
			fr: 'À quel point le poste peut vous amener à vous déplacer.'
		},
		max: { en: 'The most you accept', fr: 'Le maximum que vous acceptez' },
		pickOne: { en: 'Pick one', fr: 'Choisissez' },
		choices: {
			none: { en: 'No travel', fr: 'Aucun déplacement' },
			occasional: {
				en: 'Occasional travel at most',
				fr: 'Des déplacements occasionnels au plus'
			},
			frequent: {
				en: 'Frequent travel is fine',
				fr: 'Des déplacements fréquents, sans problème'
			}
		}
	},

	// --- Saving ---
	complete: {
		en: 'Complete the criteria you switched on:',
		fr: 'Complétez les critères que vous avez activés :'
	},
	/** A problem with the name of the criterion it is about */
	problemOf: {
		en: (criterion: string, message: string) => `${criterion}: ${message}`,
		fr: (criterion: string, message: string) => `${criterion} : ${message}`
	},
	saving: { en: 'Saving...', fr: 'Enregistrement…' },
	save: { en: 'Save perfect job', fr: 'Enregistrer le poste idéal' },
	undo: { en: 'Undo changes', fr: 'Annuler les modifications' }
});
