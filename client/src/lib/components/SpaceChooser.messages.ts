import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	title: {
		claim: { en: 'Claim your portfolio', fr: 'Réserver votre portfolio' },
		choose: { en: 'How do you want to continue?', fr: 'Comment souhaitez-vous continuer ?' }
	},
	description: {
		claim: {
			en: 'Choose the address of your portfolio. Each account owns one.',
			fr: "Choisissez l'adresse de votre portfolio. Une seule adresse par compte."
		},
		choose: {
			en: 'You can switch spaces at any time from your account menu.',
			fr: "Vous pouvez changer d'espace à tout moment depuis le menu de votre compte."
		}
	},
	candidate: {
		title: { en: 'Candidate', fr: 'Candidat' },
		openPortfolio: {
			en: (domain: string) => `Go to your portfolio ${domain}.`,
			fr: (domain: string) => `Accédez à votre portfolio ${domain}.`
		},
		claimPortfolio: {
			en: 'Claim your portfolio to show your experience to recruiters.',
			fr: 'Réservez votre portfolio pour présenter votre expérience aux recruteurs.'
		}
	},
	recruiter: {
		title: { en: 'Recruiter', fr: 'Recruteur' },
		description: {
			en: "Write job descriptions and bring them to candidates' Hire pages.",
			fr: "Rédigez des offres d'emploi et présentez-les sur la page Recruter des candidats."
		}
	},
	lastUsed: { en: 'Last used', fr: 'Dernier utilisé' },
	/** What a screen reader hears while the claim is sent */
	claimingPortfolio: { en: 'Claiming your portfolio…', fr: 'Réservation de votre portfolio…' },
	/** Under the toast that says the session expired */
	choiceNotSaved: { en: 'Your choice was not saved.', fr: "Votre choix n'a pas été enregistré." },
	/** The account already owns a portfolio: `message` says so, then where to find it */
	ownsPortfolio: {
		en: (message: string, domain: string) => `${message} Choose Candidate to open ${domain}.`,
		fr: (message: string, domain: string) => `${message} Choisissez Candidat pour ouvrir ${domain}.`
	},
	claim: { en: 'Claim your portfolio', fr: 'Réserver mon portfolio' },
	notNow: { en: 'Not now', fr: 'Plus tard' }
});
