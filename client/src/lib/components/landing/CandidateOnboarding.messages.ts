import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	title: {
		create: { en: 'Create your portfolio', fr: 'Créez votre portfolio' },
		online: { en: 'Your portfolio is online', fr: 'Votre portfolio est en ligne' }
	},
	subtitle: {
		create: {
			en: 'Three steps, a few minutes, free.',
			fr: 'Trois étapes, quelques minutes, gratuit.'
		},
		online: {
			en: 'Fill it with your experiences, then share its address.',
			fr: 'Ajoutez-y vos expériences, puis partagez son adresse.'
		}
	},
	address: {
		/** Before the address in the "browser bar", for screen readers */
		preview: { en: 'Your portfolio address:', fr: 'Adresse de votre portfolio :' },
		/** The badge of an address the account owns */
		yours: { en: 'Yours', fr: 'À vous' },
		label: { en: 'Choose your address', fr: 'Choisissez votre adresse' },
		hint: {
			en: (example: string) =>
				`Lowercase letters, digits, dots and hyphens. Your name works well: ${example}.`,
			fr: (example: string) =>
				`Lettres minuscules, chiffres, points et tirets. Votre nom convient très bien : ${example}.`
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
			en: 'Already on Portfolio? Sign in the same way: you go straight to your portfolio.',
			fr: 'Déjà sur Portfolio ? Connectez-vous de la même façon : vous arrivez directement sur votre portfolio.'
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
			en: 'One address per account. It stays yours until you delete your account.',
			fr: 'Une seule adresse par compte. Elle reste la vôtre tant que vous ne supprimez pas votre compte.'
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
		open: { en: 'Open my portfolio', fr: 'Ouvrir mon portfolio' }
	}
});
