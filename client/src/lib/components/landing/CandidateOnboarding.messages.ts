import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	title: {
		create: { en: 'Create your portfolio', fr: 'Créez votre portfolio' },
		online: { en: 'Your portfolio is online', fr: 'Votre portfolio est en ligne' }
	},
	subtitle: {
		/**
		 * Backed by: the Terms of use (#service: candidates never pay, article L5321-3 of the Labour
		 * Code; client/src/lib/components/legal/content/TermsEn.svelte, TermsFr.svelte), and no
		 * route of the API charges anyone
		 */
		create: {
			en: 'Four steps, a few minutes. You never pay.',
			fr: 'Quatre étapes, quelques minutes. Vous ne payez jamais.'
		},
		/** An owner at step 3 (or while their setup is read) */
		online: {
			en: 'Add your experiences and set your terms, then share your link.',
			fr: 'Ajoutez vos expériences et fixez vos conditions, puis partagez votre lien.'
		},
		/** An owner at step 4: the experiences are there */
		terms: {
			en: 'Set your terms, then share your link.',
			fr: 'Fixez vos conditions, puis partagez votre lien.'
		},
		/** Every step is done */
		ready: {
			en: 'Send your link to the next recruiter who writes to you.',
			fr: 'Envoyez votre lien au prochain recruteur qui vous écrit.'
		}
	},
	address: {
		/** Before the address in the "browser bar", for screen readers */
		preview: { en: 'Your portfolio address:', fr: 'Adresse de votre portfolio :' },
		/** The badge of an address the account owns */
		yours: { en: 'Yours', fr: 'À vous' },
		label: { en: 'Choose your address', fr: 'Choisissez votre adresse' },
		/**
		 * Backed by: client/src/lib/robots.ts and client/src/hooks.server.ts (every page under
		 * [domain] answers `x-robots-tag: noindex`), PortfolioHead.svelte (its robots meta): asked,
		 * never "cannot be found"
		 */
		hint: {
			en: (example: string) =>
				`Lowercase letters, digits, dots and hyphens. Your name works (${example}), or any name you like: search engines are asked not to list your portfolio.`,
			fr: (example: string) =>
				`Lettres minuscules, chiffres, points et tirets. Votre nom convient (${example}), ou tout autre nom : les moteurs de recherche sont priés de ne pas référencer votre portfolio.`
		},
		/** The availability of the address typed, next to the field's label */
		pill: {
			checking: { en: 'Checking…', fr: 'Vérification…' },
			available: { en: 'Available', fr: 'Disponible' },
			taken: { en: 'Taken', fr: 'Déjà prise' },
			invalid: { en: 'Not valid', fr: 'Non valide' },
			reserved: { en: 'Reserved', fr: 'Indisponible' },
			notChecked: { en: 'Not checked', fr: 'Non vérifiée' }
		},
		/** What a screen reader hears once the address was checked: the address, then its pill */
		announcement: {
			en: (address: string, pill: string) => `${address}: ${pill}.`,
			fr: (address: string, pill: string) => `${address} : ${pill}.`
		}
	},
	steps: {
		label: { en: 'Steps', fr: 'Étapes' },
		/** Before a step's title, for screen readers */
		number: { en: (n: number) => `Step ${n}:`, fr: (n: number) => `Étape ${n} :` },
		/** After a step's title, in brackets, for screen readers */
		state: {
			done: { en: 'done', fr: 'terminée' },
			current: { en: 'current step', fr: 'étape en cours' },
			upcoming: { en: 'to do', fr: 'à faire' }
		}
	},
	signIn: {
		signedInAs: {
			en: (email: string) => `Signed in as ${email}.`,
			fr: (email: string) => `Connecté en tant que ${email}.`
		},
		signedIn: { en: 'Signed in.', fr: 'Connecté.' },
		returning: {
			en: 'Already have your portfolio? Sign in the same way: you go straight to it.',
			fr: 'Vous avez déjà votre portfolio ? Connectez-vous de la même façon : vous y arrivez directement.'
		},
		tickToSignIn: { en: 'Tick the box to sign in.', fr: 'Cochez la case pour vous connecter.' },
		tickToContinue: { en: 'Tick the box to continue', fr: 'Cochez la case pour continuer' },
		googleUnavailable: {
			en: 'Google sign-in could not load. Check your connection (or allow accounts.google.com if a blocker is on), then reload the page.',
			fr: "La connexion avec Google n'a pas pu se charger. Vérifiez votre connexion internet (ou autorisez accounts.google.com si un bloqueur est actif), puis rechargez la page."
		},
		dataKept: {
			en: 'From your Google account we keep its id and your email address, nothing else.',
			fr: "De votre compte Google, nous conservons son identifiant et votre adresse e-mail, rien d'autre."
		},
		/** Toast of a sign-in by an account that already owns a portfolio */
		welcomeBack: {
			title: { en: 'Welcome back', fr: 'Bon retour' },
			description: {
				en: (domain: string) => `${domain} is your portfolio.`,
				fr: (domain: string) => `${domain} est votre portfolio.`
			}
		},
		/** Toast of a sign-in by an account without a portfolio */
		done: {
			title: { en: 'Signed in', fr: 'Vous êtes connecté' },
			description: { en: 'Now claim your address.', fr: 'Réservez maintenant votre adresse.' }
		}
	},
	claim: {
		title: { en: 'Claim your address', fr: 'Réserver votre adresse' },
		yours: {
			en: (address: string) => `${address} is yours.`,
			fr: (address: string) => `${address} est à vous.`
		},
		reserveChosen: {
			en: 'Reserve the address you choose above.',
			fr: "Réservez l'adresse que vous choisissez ci-dessus."
		},
		reserve: {
			en: (address: string) => `Reserve ${address} for your portfolio.`,
			fr: (address: string) => `Réservez ${address} pour votre portfolio.`
		},
		submit: { en: 'Claim this address', fr: 'Réserver cette adresse' },
		onePerAccount: {
			en: 'One address per account. It stays yours as long as you keep your account and follow the terms.',
			fr: "Une seule adresse par compte. Elle reste la vôtre tant que vous gardez votre compte et respectez les conditions d'utilisation."
		},
		/** Under the toast that says the portfolio was claimed */
		claimed: {
			en: (name: string) => `${name} is yours. Add your résumé next.`,
			fr: (name: string) => `${name} est à vous. Ajoutez maintenant votre CV.`
		}
	},
	resume: {
		title: { en: 'Add your résumé', fr: 'Ajouter votre CV' },
		upcoming: {
			en: 'Import your résumé (PDF), or add your experiences by hand.',
			fr: 'Importez votre CV (PDF), ou ajoutez vos expériences à la main.'
		},
		importIntro: {
			en: 'Upload your résumé as a PDF, up to 4 MB. Claude, an AI model by Anthropic, reads it and proposes your experiences as drafts. You review each one: nothing is published until you add it, and the PDF is not stored.',
			fr: "Envoyez votre CV au format PDF, jusqu'à 4 Mo. Claude, un modèle d'IA d'Anthropic, le lit et propose vos expériences sous forme de brouillons. Vous relisez chacune : rien n'est publié tant que vous ne l'ajoutez pas, et le PDF n'est pas conservé."
		},
		importNotice: {
			en: 'To be read, your PDF is sent to Anthropic, in the United States, which does not use it to train its models. Details in the <privacy>privacy policy</privacy>.',
			fr: "Pour être lu, votre PDF est envoyé à Anthropic, aux États-Unis, qui ne l'utilise pas pour entraîner ses modèles. Détails dans la <privacy>politique de confidentialité</privacy>."
		},
		upload: { en: 'Upload my résumé (PDF)', fr: 'Importer mon CV (PDF)' },
		byHandIntro: {
			en: 'Add your jobs, studies and projects. Visitors see them as a list or a timeline, the most recent first.',
			fr: 'Ajoutez vos emplois, vos études et vos projets. Les visiteurs les voient en liste ou en frise chronologique, les plus récents en premier.'
		},
		importsUsed: {
			en: 'You used this month’s résumé imports: add your experiences by hand for now.',
			fr: "Vous avez utilisé les imports de CV de ce mois-ci : ajoutez vos expériences à la main pour l'instant."
		},
		byHand: { en: 'Add my experiences', fr: 'Ajouter mes expériences' },
		open: { en: 'Open my portfolio', fr: 'Ouvrir mon portfolio' },
		done: {
			en: (count: number) =>
				`${count} ${plural(count, 'experience', 'experiences')} on your portfolio.`,
			fr: (count: number) =>
				`${count} ${plural(count, 'expérience', 'expériences')} sur votre portfolio.`
		}
	},
	/** Step 4: what the owner wants, their steps and their calendar, set in the admin's "Get started" */
	terms: {
		title: { en: 'Set your terms', fr: 'Fixer vos conditions' },
		upcoming: {
			en: 'Say what you want, choose your steps and open your calendar.',
			fr: 'Dites ce que vous voulez, choisissez vos étapes et ouvrez votre agenda.'
		},
		/**
		 * Backed by: server/services/workflowSteps/jobMatch.ts (a visitor's view: their score, the
		 * step's minimum and, with showDetails, each criterion's name and outcome, never what is
		 * asked; a job is scored only by that step, which the default journey has not),
		 * server/plugins/perfectJob.ts (the perfect job is read by its owner only)
		 */
		intro: {
			en: 'Say what you want in a job, choose the steps recruiters go through, and open your calendar. Recruiters never see what you ask for: only how their job does against your criteria, and the minimum you set, when your steps score it.',
			fr: "Dites ce que vous voulez d'un poste, choisissez les étapes que suivent les recruteurs et ouvrez votre agenda. Les recruteurs ne voient jamais ce que vous demandez : seulement le résultat de leur offre face à vos critères, et le minimum que vous fixez, lorsque vos étapes la notent."
		},
		open: { en: 'Set my terms', fr: 'Fixer mes conditions' },
		/** Next to the button: how many of the three are set */
		progress: {
			en: (done: number, total: number) => `${done} of ${total} set`,
			fr: (done: number, total: number) => `${done} sur ${total} ${plural(done, 'réglé', 'réglés')}`
		},
		done: { en: 'Your terms are set.', fr: 'Vos conditions sont fixées.' },
		/** Under the link and its "Copy your link" */
		copyCaption: {
			en: 'Send it to the recruiters who write to you.',
			fr: 'Envoyez-le aux recruteurs qui vous écrivent.'
		}
	},
	/** Past the last step */
	ready: {
		title: { en: 'Your link is ready', fr: 'Votre lien est prêt' },
		review: { en: 'Review my settings', fr: 'Revoir mes réglages' }
	}
});
