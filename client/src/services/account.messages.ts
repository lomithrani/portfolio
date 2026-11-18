// Texts of the account service (account.ts), and the words its forms share: the claim forms
// (the landing card, the space chooser, the apply panel, the 404 page), the forms that open the
// recruiter space (the recruiter page, the job step of a hiring journey), the account menu and the
// account page.
import { defineMessages } from 'portfolio-common';

export const accountMessages = defineMessages({
	sessionExpired: {
		en: 'Your session expired. Sign in again.',
		fr: 'Votre session a expiré. Reconnectez-vous.'
	},
	networkError: {
		en: 'Could not reach the server. Check your connection and try again.',
		fr: 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.'
	},
	/** The name shown for an account that has neither a name nor an email address */
	yourAccount: { en: 'Your account', fr: 'Votre compte' },
	/** The account page's name, in the account menu and as the page's title */
	accountPrivacy: { en: 'Account & privacy', fr: 'Compte et confidentialité' },
	deleteMyAccount: { en: 'Delete my account', fr: 'Supprimer mon compte' },
	/** Why a portfolio name cannot be claimed (domainNameProblem, claimErrorMessage) */
	name: {
		empty: { en: 'Enter a name for your portfolio.', fr: 'Saisissez un nom pour votre portfolio.' },
		reserved: {
			en: (name: string) => `“${name}” is reserved. Choose another name.`,
			fr: (name: string) => `« ${name} » est un nom réservé au site. Choisissez un autre nom.`
		},
		tooLong: {
			en: (max: number) => `Use at most ${max} characters.`,
			fr: (max: number) => `Utilisez ${max} caractères au maximum.`
		},
		characters: {
			en: 'Use only lowercase letters, digits, dots and hyphens.',
			fr: 'Utilisez uniquement des lettres minuscules, des chiffres, des points et des tirets.'
		},
		edges: {
			en: 'Start and end with a letter or a digit.',
			fr: 'Commencez et terminez par une lettre ou un chiffre.'
		},
		doubleDot: {
			en: 'Do not use two dots in a row.',
			fr: "N'utilisez pas deux points (.) de suite."
		},
		fileLike: {
			en: 'This name looks like a file name. Choose another one.',
			fr: 'Ce nom ressemble à un nom de fichier. Choisissez-en un autre.'
		},
		unusable: {
			en: 'This name cannot be used. Choose another one.',
			fr: 'Ce nom ne peut pas être utilisé. Choisissez-en un autre.'
		},
		taken: {
			en: 'This name is already taken. Choose another one.',
			fr: 'Ce nom est déjà pris. Choisissez-en un autre.'
		},
		tooManyChecks: {
			en: 'Too many checks for now: the name will be checked when you claim it.',
			fr: 'Trop de vérifications pour le moment : le nom sera vérifié quand vous le réserverez.'
		},
		notChecked: {
			en: 'Could not check this name: it will be checked when you claim it.',
			fr: 'Impossible de vérifier ce nom : il sera vérifié quand vous le réserverez.'
		}
	},
	claim: {
		/** The claim form's message when the API asks for the age and terms confirmation */
		consent: {
			en: 'Confirm your age and accept the terms of use to create your portfolio.',
			fr: "Confirmez votre âge et acceptez les conditions d'utilisation pour créer votre portfolio."
		},
		ownsPortfolio: {
			en: 'Your account already has its portfolio.',
			fr: 'Votre compte a déjà son portfolio.'
		},
		failed: {
			en: 'Could not claim this portfolio. Try again.',
			fr: 'Impossible de réserver ce portfolio. Réessayez.'
		},
		/** The age and terms checkbox was left unticked */
		tickTheBox: {
			en: 'Tick the box to confirm your age and accept the terms.',
			fr: 'Cochez la case pour confirmer votre âge et accepter les conditions.'
		},
		portfolioName: { en: 'Portfolio name', fr: 'Nom du portfolio' },
		/** Under the name field; `<address>` is where the form puts the address the portfolio gets */
		nameHint: {
			en: 'Lowercase letters, digits, dots and hyphens. Your portfolio will be at <address></address>.',
			fr: "Lettres minuscules, chiffres, points et tirets. Votre portfolio sera à l'adresse <address></address>."
		},
		claiming: { en: 'Claiming…', fr: 'Réservation…' },
		claimed: { en: 'Portfolio claimed', fr: 'Portfolio réservé' },
		claimedFirstExperience: {
			en: (name: string) => `${name} is yours. Add your first experience to it.`,
			fr: (name: string) => `${name} est à vous. Ajoutez-y votre première expérience.`
		}
	},
	recruiter: {
		/** Opening the recruiter space when the API asks for the age and terms confirmation */
		consent: {
			en: 'Confirm your age and accept the terms of use to open your recruiter space.',
			fr: "Confirmez votre âge et acceptez les conditions d'utilisation pour ouvrir votre espace recruteur."
		}
	},
	/** What a screen reader hears while a space opens */
	opening: {
		recruiter: {
			en: 'Opening your recruiter space…',
			fr: 'Ouverture de votre espace recruteur…'
		},
		candidate: { en: 'Opening your portfolio…', fr: 'Ouverture de votre portfolio…' }
	},
	/** Choosing a space failed for another reason than the session or the network */
	switchFailed: {
		recruiter: {
			en: 'Could not open your recruiter space. Try again.',
			fr: "Impossible d'ouvrir votre espace recruteur. Réessayez."
		},
		candidate: {
			en: 'Could not switch to your candidate space. Try again.',
			fr: 'Impossible de passer à votre espace candidat. Réessayez.'
		}
	},
	loadFailed: { en: 'Could not load your account.', fr: 'Impossible de charger votre compte.' },
	acceptanceFailed: {
		en: 'Could not record your acceptance. Try again.',
		fr: "Impossible d'enregistrer votre acceptation. Réessayez."
	},
	deleteFailed: {
		en: 'Could not delete your account. Try again.',
		fr: 'Impossible de supprimer votre compte. Réessayez.'
	}
});
