// The landing page (/), for talent: a portfolio that screens jobs for them. Keep the copy to
// what the code does (CLAUDE.md, "Landing page and onboarding"); the share images
// (static/og-image*.png, client/scripts/og-image/) carry the hero's headline in each language.
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	meta: {
		title: {
			en: 'Your portfolio screens jobs for you | Portfolio',
			fr: 'Votre portfolio trie les offres pour vous | Portfolio'
		},
		description: {
			en: 'Portfolio is free and works as your job matchmaker: say what you want (pay, remote days, commute, skills) and set the steps recruiters follow. The job they bring is scored against what you want before they can book a meeting with you.',
			fr: "Portfolio est gratuit et vous met en relation avec les bons postes : dites ce que vous cherchez (rémunération, télétravail, trajet, compétences), définissez les étapes que suivent les recruteurs, et l'offre qu'ils apportent est notée avant qu'ils puissent réserver un rendez-vous avec vous."
		},
		imageAlt: {
			en: 'Your portfolio, your way. No more calls about the wrong job. The steps of a hiring journey: note, job, match 86 out of 100, book a meeting.',
			fr: "Votre portfolio, à votre image. Fini les appels pour le mauvais poste. Les étapes d'un parcours de recrutement : note, offre, correspondance 86 sur 100, rendez-vous."
		}
	},
	hero: {
		badge: { en: 'Built for talent · Free', fr: 'Pensé pour les talents · Gratuit' },
		headline: { en: 'Your portfolio, your way.', fr: 'Votre portfolio, à votre image.' },
		/** The coloured line; `nowrap` keeps its last words together */
		headlineAccent: {
			en: 'No more calls about the <nowrap>wrong job.</nowrap>',
			fr: 'Fini les appels pour le <nowrap>mauvais poste.</nowrap>'
		},
		lead: {
			en: 'Say what you are looking for (pay, remote days, commute, skills) and choose the steps recruiters follow: the job they bring is scored against what you want, and only a match gets time in your calendar.',
			fr: "Dites ce que vous cherchez (rémunération, télétravail, trajet, compétences) et choisissez les étapes que suivent les recruteurs : l'offre qu'ils apportent est notée, et seule une offre qui correspond obtient un créneau dans votre agenda."
		},
		create: { en: 'Create your portfolio', fr: 'Créer mon portfolio' },
		open: { en: 'Open my portfolio', fr: 'Ouvrir mon portfolio' },
		example: { en: 'See an example', fr: 'Voir un exemple' },
		points: {
			en: ['Free, no card', 'Sign in with Google', 'Delete your account at any time'],
			fr: [
				'Gratuit, sans carte bancaire',
				'Connexion avec Google',
				'Compte supprimable à tout moment'
			]
		}
	},
	match: {
		title: { en: 'First the match, then the call', fr: "D'abord le bon poste, ensuite l'appel" },
		intro: {
			en: 'Your portfolio is your job matchmaker. Set your steps once: every recruiter goes through them, in the order you chose, before a meeting lands in your calendar.',
			fr: "Votre portfolio vous met en relation avec les bons postes, pas avec tous. Définissez vos étapes une fois : chaque recruteur les suit, dans l'ordre choisi, avant qu'un rendez-vous n'arrive dans votre agenda."
		},
		/** The calls a candidate no longer takes: what the perfect job's criteria stop */
		spared: {
			title: { en: 'Calls you can stop taking', fr: "Les appels que vous n'aurez plus à prendre" },
			commute: {
				title: { en: 'The job two hours from home', fr: 'Le poste à deux heures de chez vous' },
				text: {
					en: 'Set the travel time you accept each week. A job too far away scores lower, down to zero when it is a deal-breaker.',
					fr: "Indiquez le temps de trajet que vous acceptez par semaine. Une offre trop éloignée perd des points, jusqu'à zéro si c'est un critère éliminatoire."
				}
			},
			pay: {
				title: { en: 'The pay under your minimum', fr: 'La rémunération sous votre minimum' },
				text: {
					en: 'Say what you expect to earn and how much it matters. A job that falls short scores lower, down to zero when it is a deal-breaker.',
					fr: "Indiquez la rémunération attendue et son importance. Une offre en dessous perd des points, jusqu'à zéro si c'est un critère éliminatoire."
				}
			},
			remote: {
				title: {
					en: 'Five days on site when you want remote',
					fr: 'Cinq jours sur site quand vous voulez du télétravail'
				},
				text: {
					en: 'Work mode and remote days count too, like the contract, the working time, the seniority or the skills you want to use.',
					fr: "Le mode de travail et les jours de télétravail comptent aussi, comme le contrat, le temps de travail, le niveau d'expérience ou les compétences que vous voulez utiliser."
				}
			}
		},
		/** The step types of a hiring journey, in the order most owners would put them */
		steps: {
			note: {
				title: { en: 'They read your note', fr: 'Ils lisent votre note' },
				text: {
					en: 'What you are looking for and your conditions, confirmed before going further.',
					fr: "Ce que vous cherchez et vos conditions, à confirmer avant d'aller plus loin."
				}
			},
			job: {
				title: { en: 'They share the job', fr: 'Ils partagent leur offre' },
				text: {
					en: 'One of their job descriptions, picked or written here, with its pay, contract, remote days, location and skills. You find it in the meeting invitation.',
					fr: "L'une de leurs offres d'emploi, choisie ou rédigée ici, avec sa rémunération, son contrat, son télétravail, son lieu et ses compétences. Vous la retrouvez dans l'invitation au rendez-vous."
				}
			},
			score: {
				title: { en: 'The job gets a score', fr: "L'offre est notée" },
				text: {
					en: 'Out of 100, against what you rated: pay, remote days, commute, skills and more, with your deal-breakers. Under your minimum, it stops there.',
					fr: "Sur 100, selon ce que vous avez noté : rémunération, télétravail, trajet, compétences et plus encore, avec vos critères éliminatoires. Sous votre minimum, cela s'arrête là."
				}
			},
			meeting: {
				title: {
					en: 'Only then, they book a meeting',
					fr: 'Alors seulement, ils réservent un rendez-vous'
				},
				text: {
					en: 'In a free slot of your Google Calendar. No emails to find a time.',
					fr: 'Dans un créneau libre de votre Google Agenda. Aucun e-mail pour trouver un horaire.'
				}
			}
		},
		keep: {
			en: 'Choose the steps you want: your portfolio starts with the meeting alone.',
			fr: 'Choisissez les étapes que vous voulez : votre portfolio commence avec le rendez-vous seul.'
		},
		demo: {
			label: {
				en: "Recording: a recruiter confirms the candidate's note and picks a job on site in Grenoble. The job scores 0 out of 100: every criterion matches except the commute, a deal-breaker for this candidate.",
				fr: "Enregistrement : un recruteur confirme la note du candidat et choisit une offre sur site à Grenoble. L'offre obtient 0 sur 100 : tous les critères correspondent sauf le trajet, un critère éliminatoire pour ce candidat."
			},
			caption: {
				en: 'A job in Grenoble, for a candidate who made a short commute from Lyon a deal-breaker.',
				fr: "Une offre à Grenoble, pour un candidat qui a fait d'un trajet court depuis Lyon un critère éliminatoire."
			}
		},
		private: {
			title: { en: 'What you ask stays private', fr: 'Ce que vous demandez reste privé' },
			text: {
				en: 'A recruiter sees the score of their job and, if you allow it, how it does on each criterion. Never what you asked for.',
				fr: "Un recruteur voit la note de son offre et, si vous l'autorisez, son résultat sur chaque critère. Jamais ce que vous avez demandé."
			}
		},
		apply: {
			title: { en: 'Apply with your portfolio', fr: 'Postulez avec votre portfolio' },
			text: {
				en: 'Apply to the job descriptions published here in one step: the recruiter opens your portfolio.',
				fr: 'Postulez en une étape aux offres publiées ici : le recruteur ouvre votre portfolio.'
			}
		}
	},
	yours: {
		title: { en: 'Make it yours', fr: 'Personnalisez votre portfolio' },
		intro: {
			en: "Your portfolio does not have to look like everyone else's. You choose how your career is shown, and you can change it whenever you like.",
			fr: "Votre portfolio n'a pas à ressembler à celui des autres. Vous choisissez comment montrer votre parcours, et vous pouvez en changer quand vous voulez."
		},
		look: {
			title: { en: 'Your look', fr: 'Votre style' },
			text: {
				en: 'Pick one of more than twenty themes, your title and your tagline, and whether visitors first see it light or dark.',
				fr: "Choisissez un thème parmi plus de vingt, votre titre et votre accroche, ainsi que l'affichage clair ou sombre que vos visiteurs voient en premier."
			}
		},
		views: {
			title: { en: 'A list or a timeline', fr: 'Une liste ou une frise' },
			text: {
				en: 'The same experiences as cards to read or as a timeline to scan. Visitors switch in one tap.',
				fr: "Les mêmes expériences en cartes à lire ou en frise chronologique à parcourir. Vos visiteurs passent de l'une à l'autre d'un geste."
			}
		},
		skills: {
			title: {
				en: 'Skills backed by your projects',
				fr: 'Des compétences étayées par vos projets'
			},
			text: {
				en: 'Visitors pick a skill and see the projects where you used it, and for how long.',
				fr: "Vos visiteurs choisissent une compétence et voient les projets où vous l'avez utilisée, et pendant combien de temps."
			}
		},
		example: {
			en: 'Want to see a real one? <example>Open an example</example>.',
			fr: "Envie d'en voir un vrai ? <example>Ouvrez un exemple</example>."
		},
		demo: {
			label: {
				en: 'Recording: an experiences page on Portfolio, shown in five colour themes, light and dark, first as a list of cards, then as a timeline.',
				fr: "Enregistrement : une page d'expériences sur Portfolio, dans cinq thèmes de couleurs, clairs et sombres, d'abord en liste de cartes, puis en frise chronologique."
			},
			caption: {
				en: 'The same page in five themes, as a list and as a timeline.',
				fr: 'La même page dans cinq thèmes, en liste et en frise.'
			}
		}
	},
	how: {
		title: { en: 'How it works', fr: 'Comment ça marche' },
		intro: {
			en: 'A few minutes from here to your portfolio, ready to share. Free to use.',
			fr: "Quelques minutes suffisent pour avoir votre portfolio, prêt à partager. C'est gratuit."
		},
		step: {
			en: (number: number) => `Step ${number}:`,
			fr: (number: number) => `Étape ${number} :`
		},
		signIn: {
			title: { en: 'Sign in with Google', fr: 'Connectez-vous avec Google' },
			text: {
				en: 'Confirm your age, accept the terms, and sign in. No password to create.',
				fr: 'Confirmez votre âge, acceptez les conditions et connectez-vous. Aucun mot de passe à créer.'
			}
		},
		claim: {
			title: { en: 'Claim your address', fr: 'Réservez votre adresse' },
			text: {
				en: "Pick the name in your portfolio's link. It stays yours until you delete your account.",
				fr: "Choisissez le nom qui figure dans le lien de votre portfolio. Il reste à vous jusqu'à la suppression de votre compte."
			}
		},
		resume: {
			title: { en: 'Add your résumé', fr: 'Ajoutez votre CV' },
			text: {
				en: 'Import your PDF résumé and review the drafts, or write your experiences yourself.',
				fr: 'Importez votre CV en PDF et relisez les brouillons, ou rédigez vos expériences vous-même.'
			}
		}
	},
	faq: {
		title: { en: 'Questions', fr: 'Questions' },
		free: {
			question: { en: 'Is it free?', fr: 'Est-ce gratuit ?' },
			answer: {
				en: 'Yes. Creating and keeping your portfolio is free, and so is the résumé import, within a monthly limit.',
				fr: "Oui. Créer et conserver votre portfolio est gratuit, tout comme l'import de CV, dans une limite mensuelle."
			}
		},
		resume: {
			question: { en: 'What happens to my résumé PDF?', fr: 'Que devient le PDF de mon CV ?' },
			answer: {
				en: 'To be read, it is sent to Anthropic, in the United States, whose model Claude turns it into drafts of your experiences. It is not stored here, and Anthropic does not use it to train its models. You review each draft: nothing is published until you add it.',
				fr: "Pour être lu, il est envoyé à Anthropic, aux États-Unis, dont le modèle Claude le transforme en brouillons de vos expériences. Il n'est pas conservé ici, et Anthropic ne l'utilise pas pour entraîner ses modèles. Vous relisez chaque brouillon : rien n'est publié tant que vous ne l'ajoutez pas."
			}
		},
		visibility: {
			question: { en: 'Who can see my portfolio?', fr: 'Qui peut voir mon portfolio ?' },
			answer: {
				en: 'Anyone with its address can open it. We ask search engines not to list it, and the main ones, such as Google and Bing, do as asked (a page they had already listed can take a few weeks to disappear). It is public all the same, and an address can be passed on: write only what you want to be public. Your email address is not shown on it.',
				fr: "Toute personne qui a son adresse peut l'ouvrir. Nous demandons aux moteurs de recherche de ne pas le référencer, et les principaux, comme Google et Bing, respectent cette demande (une page qu'ils avaient déjà référencée peut mettre quelques semaines à disparaître). Il reste public pour autant, et une adresse peut circuler : n'y écrivez que ce que vous voulez rendre public. Votre adresse e-mail n'y figure pas."
			}
		},
		recruiters: {
			question: {
				en: 'What do recruiters see of what I am looking for?',
				fr: 'Que voient les recruteurs de ce que je recherche ?'
			},
			score: {
				en: 'The score of their job and the minimum you set. If you allow it, they also see how the job does on each criterion (it matches, partly, or not) and which of your deal-breakers it misses, never what you asked for or how much the other criteria matter to you.',
				fr: "La note de leur offre et le minimum que vous avez fixé. Si vous l'autorisez, ils voient aussi le résultat de l'offre sur chaque critère (elle correspond, en partie, ou non) et ceux de vos critères éliminatoires qu'elle ne remplit pas, jamais ce que vous avez demandé ni l'importance que vous accordez aux autres critères."
			},
			address: {
				en: "Recruiters never see the address you give for your commute. To find it and compute travel times, it is sent to the Géoplateforme of IGN, the French state's map service, without your name or your account. Details in the <privacy>privacy policy</privacy>.",
				fr: "Les recruteurs ne voient jamais l'adresse que vous indiquez pour votre trajet. Pour la localiser et calculer les temps de trajet, elle est envoyée à la Géoplateforme de l'IGN, le service cartographique de l'État français, sans votre nom ni votre compte. Détails dans la <privacy>politique de confidentialité</privacy>."
			}
		},
		deletion: {
			question: { en: 'Can I delete my account?', fr: 'Puis-je supprimer mon compte ?' },
			everything: {
				en: 'Yes. Your <account>account page</account> deletes your account and everything tied to it at once: portfolio, hiring journey, applications and Google Calendar access. Your address becomes free for someone else.',
				fr: "Oui. Votre <account>page de compte</account> supprime d'un coup votre compte et tout ce qui y est lié : portfolio, parcours de recrutement, candidatures et accès à Google Agenda. Votre adresse redevient libre pour quelqu'un d'autre."
			},
			remains: {
				en: "Meetings already in someone's calendar and step suggestions already on GitHub (which do not name you) stay; server logs expire on their own. Details in the <privacy>privacy policy</privacy>.",
				fr: "Les rendez-vous déjà inscrits dans l'agenda de quelqu'un et les suggestions d'étapes déjà publiées sur GitHub (qui ne vous nomment pas) restent ; les journaux du serveur expirent d'eux-mêmes. Détails dans la <privacy>politique de confidentialité</privacy>."
			}
		},
		age: {
			question: { en: 'Why do you ask my age?', fr: 'Pourquoi demandez-vous mon âge ?' },
			answer: {
				en: 'Portfolio is for people who can work: you must be at least 16 and have reached the minimum legal working age in your country. We record that you confirmed it, with the date and the version of the terms, never your date of birth.',
				fr: "Portfolio s'adresse aux personnes qui peuvent travailler : vous devez avoir au moins 16 ans et avoir atteint l'âge minimum légal pour travailler dans votre pays. Nous enregistrons que vous l'avez confirmé, avec la date et la version des conditions, jamais votre date de naissance."
			}
		},
		data: {
			question: { en: 'Which data do you keep?', fr: 'Quelles données conservez-vous ?' },
			answer: {
				en: 'Your Google account id and email address, what you publish, and what the features you use need, such as your applications or your meeting settings. The <privacy>privacy policy</privacy> lists everything, how long it is kept, and your rights.',
				fr: "L'identifiant et l'adresse e-mail de votre compte Google, ce que vous publiez, et ce dont ont besoin les fonctions que vous utilisez, comme vos candidatures ou vos réglages de rendez-vous. La <privacy>politique de confidentialité</privacy> détaille tout, les durées de conservation et vos droits."
			}
		}
	},
	cta: {
		title: {
			en: 'Set it up once, share one link',
			fr: 'Configurez-le une fois, partagez un seul lien'
		},
		text: {
			en: 'Import your résumé, pick a theme, say what you want. You can change all of it later.',
			fr: 'Importez votre CV, choisissez un thème, dites ce que vous cherchez. Vous pourrez tout modifier ensuite.'
		}
	}
});
