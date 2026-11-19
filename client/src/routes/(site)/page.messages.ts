// The landing page (/), for talent: a career tool they keep, whose page for recruiters asks for
// the job and its pay before the call. Every claim must be true of the code: the messages that
// promise something name what backs them (`Backed by:`), so whoever changes or removes that code
// finds the claim to change with it (CLAUDE.md, "Landing page and onboarding"). Nothing here may
// promise a feature that is not shipped. The share images (static/og-image*.png,
// client/scripts/og-image/) carry the hero's headline and three promise titles in each language.
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	meta: {
		title: {
			en: 'Your career, on your terms | Portfolio',
			fr: 'Votre carrière, à vos conditions | Portfolio'
		},
		/**
		 * Backed by: the Terms of use (#service: candidates never pay), the gate journey
		 * (journeyTemplate('gate') of common/models/workflow.ts, one click in the admin's Get started
		 * tab: client/src/lib/components/admin/StartTab.svelte), the job match step
		 * (server/services/workflowSteps/jobMatch.ts) and the meeting locked until the steps before it
		 * succeed (openStepOfType of server/services/workflows.ts). "Can": the default journey is the
		 * meeting alone (DEFAULT_WORKFLOW_STEPS)
		 */
		description: {
			en: 'Free for talent, always. Send recruiters your link: your page can ask for the job and its pay first, score it against what you want, and only then open your calendar.',
			fr: "Gratuit pour les talents, toujours. Envoyez votre lien aux recruteurs : votre page peut demander d'abord l'offre et sa rémunération, la noter selon ce que vous voulez, et seulement ensuite ouvrir votre agenda."
		},
		/** What the share image shows (client/scripts/og-image/render.mjs, its `landing` picture) */
		imageAlt: {
			en: 'Your career, on your terms. The pay first. The call after. The steps of a hiring journey: note, job, match 86 out of 100, book a meeting. You never pay. The pay first, if you ask. Your steps, your order.',
			fr: "Votre carrière, à vos conditions. La rémunération d'abord. L'appel ensuite. Les étapes d'un parcours de recrutement : note, offre, correspondance 86 sur 100, rendez-vous. Vous ne payez jamais. La rémunération d'abord, si vous le demandez. Vos étapes, dans votre ordre."
		}
	},
	hero: {
		badge: { en: 'Built for talent', fr: 'Pensé pour les talents' },
		headline: { en: 'Your career, on your terms.', fr: 'Votre carrière, à vos conditions.' },
		/**
		 * The coloured line; `nowrap` keeps its last words together. Backed by: the gate journey
		 * (journeyTemplate('gate'): a job step, then the job match, then the meeting), every job
		 * description stating its pay range (validateJobPosting, `pay.min` and `pay.max`, of
		 * common/models/jobPosting.ts) and the meeting locked until the steps before it succeed
		 * (openStepOfType of server/services/workflows.ts). The lead says it takes asking for the job
		 */
		headlineAccent: {
			en: 'The pay first. <nowrap>The call after.</nowrap>',
			fr: "La rémunération d'abord. <nowrap>L'appel ensuite.</nowrap>"
		},
		/**
		 * Backed by: the admin's Get started tab, whose "Ask for the job first" saves the gate journey
		 * in one click (client/src/lib/components/admin/StartTab.svelte, journeyTemplate('gate') of
		 * common/models/workflow.ts), the job step (server/services/workflowSteps/job.ts: an open job
		 * description, with its pay range), the job match step (jobMatch.ts: the minimum the owner
		 * set) and openStepOfType of server/services/workflows.ts (no slot before the steps before
		 * the meeting succeeded)
		 */
		lead: {
			en: 'Reply to the recruiters who write to you with your link. Ask for the job first, in one click: they share it with its pay, it is scored against what you want, and only a job that passes gets a slot in your calendar.',
			fr: "Répondez aux recruteurs qui vous écrivent avec votre lien. Demandez d'abord l'offre, en un clic : ils la partagent avec sa rémunération, elle est notée selon ce que vous voulez, et seule une offre qui passe obtient un créneau dans votre agenda."
		},
		create: { en: 'Create your portfolio', fr: 'Créer mon portfolio' },
		open: { en: 'Open my portfolio', fr: 'Ouvrir mon portfolio' },
		example: { en: 'See an example', fr: 'Voir un exemple' },
		/**
		 * Backed by: the Terms of use (#service: candidates never pay, article L5321-3 of the Labour
		 * Code); every page under [domain] answering `x-robots-tag: noindex` (client/src/lib/robots.ts,
		 * client/src/hooks.server.ts) with a robots meta (PortfolioHead.svelte): asked, never "cannot
		 * be found"; DELETE /me (server/services/accountDeletion.ts), from the account page
		 */
		points: {
			en: [
				'You never pay',
				'Search engines are asked not to list your portfolio',
				'Delete your account at any time'
			],
			fr: [
				'Vous ne payez jamais',
				'Les moteurs de recherche sont priés de ne pas référencer votre portfolio',
				'Compte supprimable à tout moment'
			]
		}
	},
	/** "Send your link": the hiring journey a recruiter goes through, with its recording */
	link: {
		kicker: { en: 'Recruiters write to you?', fr: 'Des recruteurs vous écrivent ?' },
		title: { en: 'Send your link', fr: 'Envoyez votre lien' },
		/**
		 * Backed by: openWorkflowSteps of common/models/workflow.ts (a step opens once every step
		 * before it succeeded) and openStepOfType of server/services/workflows.ts (no slot, no
		 * booking before that)
		 */
		intro: {
			en: 'Reply with your link. Every recruiter goes through the steps you chose, in your order, before a meeting lands in your calendar.',
			fr: "Répondez avec votre lien. Chaque recruteur suit les étapes que vous avez choisies, dans votre ordre, avant qu'un rendez-vous n'arrive dans votre agenda."
		},
		/** The step types of a hiring journey, in the order of the gate journey */
		steps: {
			/** Backed by: the note step (server/services/workflowSteps/note.ts) */
			note: {
				title: { en: 'They read your note', fr: 'Ils lisent votre note' },
				text: {
					en: 'What you are looking for and your conditions, confirmed before going further.',
					fr: "Ce que vous cherchez et vos conditions, à confirmer avant d'aller plus loin."
				}
			},
			/**
			 * Backed by: the job step (server/services/workflowSteps/job.ts: one of the recruiter's open
			 * job descriptions, or one written from the page) and its line in the meeting invitation,
			 * which links the job's private page (opportunityPath of common/models/jobPosting.ts)
			 */
			job: {
				title: { en: 'They share the job', fr: 'Ils partagent leur offre' },
				text: {
					en: 'One of their job descriptions, picked or written here, with its pay, contract, remote days, location and skills. You find it in the meeting invitation.',
					fr: "L'une de leurs offres d'emploi, choisie ou rédigée ici, avec sa rémunération, son contrat, son télétravail, son lieu et ses compétences. Vous la retrouvez dans l'invitation au rendez-vous."
				}
			},
			/**
			 * Backed by: the job match step (server/services/workflowSteps/jobMatch.ts: `failed` under
			 * the minimum) and scorePerfectJob of common/models/perfectJob.ts
			 */
			score: {
				title: { en: 'The job gets a score', fr: "L'offre est notée" },
				text: {
					en: 'Out of 100, against what you rated: pay, remote days, commute, skills and more, with your deal-breakers. Under your minimum, it stops there.',
					fr: "Sur 100, selon ce que vous avez noté : rémunération, télétravail, trajet, compétences et plus encore, avec vos critères éliminatoires. Sous votre minimum, cela s'arrête là."
				}
			},
			/**
			 * Backed by: the meeting step (client/src/lib/components/hire/MeetingBooking.svelte,
			 * POST /appointments/book: a free slot of the owner's appointment schedule)
			 */
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
		/**
		 * Backed by: DEFAULT_WORKFLOW_STEPS (the meeting alone) and journeyTemplate('gate') of
		 * common/models/workflow.ts, saved in one click from the admin's Get started tab
		 * (StartTab.svelte); any other journey in the Hiring journey tab (WorkflowsTab.svelte)
		 */
		keep: {
			en: 'A new portfolio starts with the meeting alone. Ask for the job first in one click, from your settings, or choose your own steps.',
			fr: "Un nouveau portfolio commence avec le rendez-vous seul. Demandez d'abord l'offre en un clic, depuis vos réglages, ou choisissez vos propres étapes."
		},
		/** client/static/landing/demo-journey.*, recorded with client/scripts/landing-demos/ */
		demo: {
			label: {
				en: "Recording: on a candidate's page for recruiters, a recruiter confirms the candidate's note and picks a job on site in Grenoble. The job scores 0 out of 100: every criterion matches except the commute, a deal-breaker for this candidate.",
				fr: "Enregistrement : sur la page recruteurs d'un candidat, un recruteur confirme la note du candidat et choisit une offre sur site à Grenoble. L'offre obtient 0 sur 100 : tous les critères correspondent sauf le trajet, un critère éliminatoire pour ce candidat."
			},
			caption: {
				en: 'A job in Grenoble, for a candidate who made a short commute from Lyon a deal-breaker.',
				fr: "Une offre à Grenoble, pour un candidat qui a fait d'un trajet court depuis Lyon un critère éliminatoire."
			}
		}
	},
	/** "Our promises to you": what a candidate can count on, each tied to the code that keeps it */
	promises: {
		title: { en: 'Our promises to you', fr: 'Nos engagements envers vous' },
		intro: {
			en: "Hiring usually runs on the recruiter's terms: you guess the pay, and the first call tells you the job was never a fit. On Portfolio, it runs on yours.",
			fr: "Le recrutement se fait d'habitude aux conditions du recruteur : vous devinez la rémunération, et le premier appel vous apprend que le poste ne vous convenait pas. Sur Portfolio, il se fait aux vôtres."
		},
		/**
		 * Backed by: the Terms of use (#service: "Candidates never pay", article L5321-3 of the Labour
		 * Code; client/src/lib/components/legal/content/TermsEn.svelte, TermsFr.svelte); no route of
		 * the API charges anyone
		 */
		free: {
			title: { en: 'You never pay', fr: 'Vous ne payez jamais' },
			text: {
				en: 'Not for your portfolio, not for your steps or your meetings, not later: French law forbids charging people for help finding a job.',
				fr: "Ni pour votre portfolio, ni pour vos étapes ou vos rendez-vous, ni plus tard : la loi interdit de faire payer les personnes qu'on aide à trouver un emploi."
			}
		},
		/**
		 * Backed by: journeyTemplate('gate') of common/models/workflow.ts, saved in one click from the
		 * admin's Get started tab (StartTab.svelte); validateJobPosting of common/models/jobPosting.ts
		 * (every job description states `pay.min` and `pay.max`, the top at most
		 * JOB_LIMITS.pay.maxRangeRatio times the bottom, `ratio` here); the job step's line in the
		 * meeting invitation (`describe` of server/services/workflowSteps/job.ts, opportunityPath).
		 * "If you ask": the default journey is the meeting alone (DEFAULT_WORKFLOW_STEPS)
		 */
		pay: {
			title: {
				en: 'The pay first, if you ask',
				fr: "La rémunération d'abord, si vous le demandez"
			},
			text: {
				en: (ratio: number) =>
					`In one click, your page asks recruiters for the job before anything else. Every job description on Portfolio states its pay range, its top at most ${ratio.toLocaleString('en-GB')} times its bottom, and the meeting invitation links it.`,
				fr: (ratio: number) =>
					`En un clic, votre page demande l'offre aux recruteurs avant tout le reste. Chaque offre sur Portfolio indique sa fourchette de rémunération, dont le haut ne dépasse pas ${ratio.toLocaleString('fr-FR')} fois le bas, et l'invitation au rendez-vous y mène.`
			}
		},
		/**
		 * Backed by: server/plugins/perfectJob.ts (the perfect job is read by its owner only) and the
		 * job match step's view (server/services/workflowSteps/jobMatch.ts: the score, the minimum
		 * and, with showDetails, each criterion's name and outcome, never what is asked); a job is
		 * scored only by that step. The pay outcome is a band (PAY_MATCH of
		 * common/models/perfectJob.ts), never a figure
		 */
		private: {
			title: {
				en: 'The pay you ask for stays private',
				fr: 'La rémunération que vous demandez reste privée'
			},
			text: {
				en: 'When your steps score their job, recruiters see the score and, if you allow it, whether it matches each of your criteria. Never the figures behind them, starting with the pay you ask for.',
				fr: "Lorsque vos étapes notent leur offre, les recruteurs voient son résultat et, si vous l'autorisez, si elle correspond à chacun de vos critères. Jamais les chiffres qui sont derrière, à commencer par la rémunération que vous demandez."
			}
		},
		/**
		 * Backed by: the Hiring journey tab (client/src/lib/components/admin/WorkflowsTab.svelte,
		 * PUT /workflow through parseWorkflow), openWorkflowSteps of common/models/workflow.ts and
		 * openStepOfType of server/services/workflows.ts (the owner's order, for every visitor)
		 */
		steps: {
			title: { en: 'Your steps, your order', fr: 'Vos étapes, dans votre ordre' },
			text: {
				en: 'A note to read, the job to share, a score to reach, then a slot in your calendar: you choose which, and every recruiter follows them.',
				fr: 'Une note à lire, une offre à partager, un résultat à atteindre, puis un créneau dans votre agenda : vous choisissez lesquelles, et chaque recruteur les suit.'
			}
		},
		/**
		 * Backed by: no route lists portfolios or searches candidates (server/plugins/domain.ts reads
		 * a portfolio by its name only; its availability check never names the owner); every page
		 * under [domain] answers `x-robots-tag: noindex` (client/src/lib/robots.ts,
		 * client/src/hooks.server.ts) with a robots meta (PortfolioHead.svelte), and so does every API
		 * answer (ROBOTS_NOINDEX, server/app.ts): asked, never "cannot be found"
		 */
		link: {
			title: {
				en: 'Recruiters come through your link',
				fr: 'Les recruteurs passent par votre lien'
			},
			text: {
				en: 'Portfolio has no directory and no search of candidates, and search engines are asked not to list your portfolio. Anyone with its address can open it, so write only what you are happy to share.',
				fr: "Portfolio n'a ni annuaire ni recherche de candidats, et les moteurs de recherche sont priés de ne pas référencer votre portfolio. Toute personne qui a son adresse peut l'ouvrir : n'y écrivez que ce que vous voulez bien partager."
			}
		},
		/**
		 * Backed by: the Privacy policy (#summary and #tracking: no advertising, no analytics, no sale
		 * of data; #rights: a copy, and the data as JSON on request) and DELETE /me
		 * (server/services/accountDeletion.ts: the portfolio, the journey, the perfect job, the
		 * calendar's settings and grant)
		 */
		data: {
			title: { en: 'Your data stays yours', fr: 'Vos données restent les vôtres' },
			text: {
				en: 'No ads, no analytics, nothing sold. Ask for a copy whenever you like; delete your account, and your portfolio, your steps and your settings go with it.',
				fr: "Ni publicité, ni mesure d'audience, ni revente. Demandez-en une copie quand vous voulez ; supprimez votre compte, et votre portfolio, vos étapes et vos réglages partent avec lui."
			}
		},
		/**
		 * Backed by: the Terms of use (#service: candidates never pay, no exclusivity, not a party to
		 * any contract between candidates and recruiters; #recruiters: placement within the meaning
		 * of article L5321-1, no part in hiring decisions, not a party to the employment contract)
		 */
		hire: {
			title: {
				en: 'The terms of your hire are yours',
				fr: 'Les conditions de votre embauche vous appartiennent'
			},
			text: {
				en: 'Portfolio takes nothing from your pay, asks for no exclusivity and is not a party to your contract: you negotiate directly with the employer.',
				fr: "Portfolio ne prend rien sur votre rémunération, ne demande aucune exclusivité et n'est pas partie à votre contrat : vous négociez directement avec l'employeur."
			}
		}
	},
	/**
	 * The calls a candidate no longer takes: what the perfect job's criteria stop. Backed by:
	 * PERFECT_JOB_CRITERIA and scorePerfectJob of common/models/perfectJob.ts (importance,
	 * deal-breakers, the pay bands of PAY_MATCH, the commute where travel times are computed)
	 */
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
		/** Backed by: the Terms of use (#service: candidates never pay) */
		intro: {
			en: 'A few minutes from here to your portfolio, ready to send. You never pay.',
			fr: 'Quelques minutes suffisent pour avoir votre portfolio, prêt à envoyer. Vous ne payez jamais.'
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
		/**
		 * Backed by: the noindex of every page under [domain] (client/src/lib/robots.ts) and the
		 * Terms of use (#account: one address per account, kept while the account follows them)
		 */
		claim: {
			title: { en: 'Claim your address', fr: 'Réservez votre adresse' },
			text: {
				en: "Pick the name in your portfolio's link. Search engines are asked not to list it. It stays yours as long as you keep your account and follow the terms.",
				fr: "Choisissez le nom qui figure dans le lien de votre portfolio. Les moteurs de recherche sont priés de ne pas le référencer. Il reste à vous tant que vous gardez votre compte et respectez les conditions d'utilisation."
			}
		},
		resume: {
			title: { en: 'Add your résumé', fr: 'Ajoutez votre CV' },
			text: {
				en: 'Import your PDF résumé and review the drafts, or write your experiences yourself.',
				fr: 'Importez votre CV en PDF et relisez les brouillons, ou rédigez vos expériences vous-même.'
			}
		},
		/** Backed by: the admin's "Get started" tab (client/src/lib/components/admin/StartTab.svelte) */
		terms: {
			title: { en: 'Set your terms', fr: 'Fixez vos conditions' },
			text: {
				en: 'Say what you want in a job, choose the steps recruiters go through and open your calendar, then copy your link.',
				fr: "Dites ce que vous voulez d'un poste, choisissez les étapes que suivent les recruteurs et ouvrez votre agenda, puis copiez votre lien."
			}
		}
	},
	faq: {
		title: { en: 'Questions', fr: 'Questions' },
		/**
		 * Backed by: the Terms of use (#service: "Candidates never pay", article L5321-3 of the Labour
		 * Code), the résumé import's quota (RESUME_IMPORT_MONTHLY_LIMIT, server/services/resumeImport.ts)
		 */
		pay: {
			question: { en: 'Do I ever pay?', fr: 'Devrai-je payer un jour ?' },
			answer: {
				en: 'No, never. Your portfolio, your hiring journey and your meetings are free, and so is the résumé import, within a monthly limit. French law forbids charging people looking for a job for placement services (article L5321-3 of the Labour Code), and the <terms>terms of use</terms> say so.',
				fr: "Non, jamais. Votre portfolio, votre parcours de recrutement et vos rendez-vous sont gratuits, tout comme l'import de CV, dans une limite mensuelle. La loi interdit de faire payer les personnes qui cherchent un emploi pour des services de placement (article L5321-3 du code du travail), et les <terms>conditions d'utilisation</terms> le disent."
			}
		},
		/**
		 * Backed by: what visitors read is neutral (the floating corner's and the rail's "Propose a
		 * role": routes/[domain]/experiences/page.messages.ts `proposeRole`, LeftBar.messages.ts; the
		 * page's title "Propose a role to …": routes/[domain]/hire/page.messages.ts), and nothing
		 * on a portfolio says its owner is looking but what they write themselves
		 */
		looking: {
			question: {
				en: "Does having a portfolio mean I'm looking?",
				fr: 'Avoir un portfolio, est-ce chercher un emploi ?'
			},
			answer: {
				en: 'No. Like a professional profile, it is a career tool you keep whether you are looking or not, and nothing on it says you are, unless you write it. It is how recruiters reach you on your terms, whenever they come: your page for recruiters reads “Propose a role”, never “Hire me”.',
				fr: "Non. Comme un profil professionnel, c'est un outil de carrière que vous gardez, que vous cherchiez ou non, et rien n'y dit que vous cherchez, sauf si vous l'écrivez. C'est par là que les recruteurs vous contactent à vos conditions, quand ils se présentent : votre page recruteurs dit « Proposer un poste », jamais « Me recruter »."
			}
		},
		resume: {
			question: { en: 'What happens to my résumé PDF?', fr: 'Que devient le PDF de mon CV ?' },
			answer: {
				en: 'To be read, it is sent to Anthropic, in the United States, whose model Claude turns it into drafts of your experiences. It is not stored here, and Anthropic does not use it to train its models. You review each draft: nothing is published until you add it.',
				fr: "Pour être lu, il est envoyé à Anthropic, aux États-Unis, dont le modèle Claude le transforme en brouillons de vos expériences. Il n'est pas conservé ici, et Anthropic ne l'utilise pas pour entraîner ses modèles. Vous relisez chaque brouillon : rien n'est publié tant que vous ne l'ajoutez pas."
			}
		},
		/**
		 * Backed by: the noindex of every page under [domain] (client/src/lib/robots.ts,
		 * client/src/hooks.server.ts, PortfolioHead.svelte) and of every API answer (server/app.ts);
		 * the owner's email only in the invitation of a meeting booked (POST /appointments/book)
		 */
		visibility: {
			question: { en: 'Who can see my portfolio?', fr: 'Qui peut voir mon portfolio ?' },
			answer: {
				en: 'Anyone with its address can open it. We ask search engines not to list it, and the main ones, such as Google and Bing, do as asked (a page they had already listed can take a few weeks to disappear). It is public all the same, and an address can be passed on: write only what you want to be public. Your email address is not shown on it, but someone who books a meeting with you sees it in the invitation.',
				fr: "Toute personne qui a son adresse peut l'ouvrir. Nous demandons aux moteurs de recherche de ne pas le référencer, et les principaux, comme Google et Bing, respectent cette demande (une page qu'ils avaient déjà référencée peut mettre quelques semaines à disparaître). Il reste public pour autant, et une adresse peut circuler : n'y écrivez que ce que vous voulez rendre public. Votre adresse e-mail n'y figure pas, mais une personne qui réserve un rendez-vous avec vous la voit dans l'invitation."
			}
		},
		recruiters: {
			question: {
				en: 'What do recruiters see of what I am looking for?',
				fr: 'Que voient les recruteurs de ce que je recherche ?'
			},
			/**
			 * Backed by: the job match step's view (server/services/workflowSteps/jobMatch.ts: the
			 * score, the minimum and, with showDetails, each criterion's name and outcome, the
			 * deal-breakers missed); a job is scored only by that step
			 */
			score: {
				en: 'When your steps score their job: its score and the minimum you set. If you allow it, they also see how the job does on each criterion (it matches, partly, or not) and which of your deal-breakers it misses, never what you asked for or how much the other criteria matter to you. A recruiter who tries several jobs could still guess part of it from the scores.',
				fr: "Lorsque vos étapes notent leur offre : son résultat et le minimum que vous avez fixé. Si vous l'autorisez, ils voient aussi le résultat de l'offre sur chaque critère (elle correspond, en partie, ou non) et ceux de vos critères éliminatoires qu'elle ne remplit pas, jamais ce que vous avez demandé ni l'importance que vous accordez aux autres critères. Un recruteur qui essaie plusieurs offres pourrait toutefois en deviner une partie à partir des notes."
			},
			address: {
				en: "Recruiters never see the address you give for your commute. To find it and compute travel times, it is sent to the Géoplateforme of IGN, the French state's map service, and, for public transport times, its position to a journey planner, without your name or your account. Details in the <privacy>privacy policy</privacy>.",
				fr: "Les recruteurs ne voient jamais l'adresse que vous indiquez pour votre trajet. Pour la localiser et calculer les temps de trajet, elle est envoyée à la Géoplateforme de l'IGN, le service cartographique de l'État français, et, pour les temps en transports en commun, sa position à un calculateur d'itinéraires, sans votre nom ni votre compte. Détails dans la <privacy>politique de confidentialité</privacy>."
			}
		},
		/** Backed by: MINIMUM_AGE of common/models/legal.ts; the hiring journey (Send your link) */
		audience: {
			question: {
				en: 'Is Portfolio only for senior profiles?',
				fr: 'Portfolio est-il réservé aux profils expérimentés ?'
			},
			answer: {
				en: 'No: anyone who can work can use it, for free. It helps most when recruiters already write to you: reply with your link, and they go through your steps before they book a call.',
				fr: "Non : toute personne qui peut travailler peut l'utiliser, gratuitement. Il sert surtout quand des recruteurs vous écrivent déjà : répondez avec votre lien, et ils suivent vos étapes avant de réserver un appel."
			}
		},
		/**
		 * Backed by: the Terms of use (#service: candidates never pay; free for recruiters for now,
		 * told before any paid feature applies to them, charged nothing they did not agree to). The
		 * site has no payment of any kind
		 */
		money: {
			question: {
				en: 'How does Portfolio make money?',
				fr: "Comment Portfolio gagne-t-il de l'argent ?"
			},
			answer: {
				en: 'Not from you, ever: candidates never pay. Today it makes no money at all, as recruiters use it for free too. If a paid feature ever comes for recruiters, they will be told first and pay only for what they agreed to, as the <terms>terms of use</terms> say.',
				fr: "Pas grâce à vous, jamais : les candidats ne paient pas. Aujourd'hui, il ne gagne rien du tout, car les recruteurs l'utilisent gratuitement eux aussi. Si une fonction payante leur est un jour proposée, ils en seront informés d'abord et ne paieront que ce qu'ils auront accepté, comme le disent les <terms>conditions d'utilisation</terms>."
			}
		},
		deletion: {
			question: { en: 'Can I delete my account?', fr: 'Puis-je supprimer mon compte ?' },
			/** Backed by: deleteAccount of server/services/accountDeletion.ts (DELETE /me) */
			everything: {
				en: 'Yes. Your <account>account page</account> deletes your account and everything tied to it at once: portfolio, hiring journey, perfect job and Google Calendar access. Your address becomes free for someone else.',
				fr: "Oui. Votre <account>page de compte</account> supprime d'un coup votre compte et tout ce qui y est lié : portfolio, parcours de recrutement, poste idéal et accès à Google Agenda. Votre adresse redevient libre pour quelqu'un d'autre."
			},
			remains: {
				en: "Meetings already in someone's calendar, and the step suggestions and feedback already on GitHub (which do not name you), stay; server logs expire on their own. Details in the <privacy>privacy policy</privacy>.",
				fr: "Les rendez-vous déjà inscrits dans l'agenda de quelqu'un, ainsi que les suggestions d'étapes et les avis déjà publiés sur GitHub (qui ne vous nomment pas), restent ; les journaux du serveur expirent d'eux-mêmes. Détails dans la <privacy>politique de confidentialité</privacy>."
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
				en: 'Your Google account id and email address, what you publish, and what the features you use need, such as your criteria, your hiring journey or your meeting settings. The <privacy>privacy policy</privacy> lists everything, how long it is kept, and your rights.',
				fr: "L'identifiant et l'adresse e-mail de votre compte Google, ce que vous publiez, et ce dont ont besoin les fonctions que vous utilisez, comme vos critères, votre parcours de recrutement ou vos réglages de rendez-vous. La <privacy>politique de confidentialité</privacy> détaille tout, les durées de conservation et vos droits."
			}
		}
	},
	cta: {
		title: { en: 'Set your terms once', fr: 'Fixez vos conditions une fois' },
		text: {
			en: 'Import your résumé, say what you want, choose your steps. Recruiters do the rest, and you can change everything later.',
			fr: 'Importez votre CV, dites ce que vous voulez, choisissez vos étapes. Les recruteurs font le reste, et vous pourrez tout modifier ensuite.'
		}
	}
});
