import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	title: {
		en: (domain: string) => `Claim ${domain}`,
		fr: (domain: string) => `Réserver ${domain}`
	},
	/** `<name>` is where the modal puts the name being claimed */
	intro: {
		en: 'By signing in with your Google account, you will become the owner of <name></name>.',
		fr: 'En vous connectant avec votre compte Google, vous deviendrez propriétaire de <name></name>.'
	},
	onePerAccount: {
		en: 'Each Google account can only own one domain.',
		fr: "Un compte Google ne peut posséder qu'une seule adresse."
	},
	signInFailed: {
		en: 'Sign-in failed. Please try again.',
		fr: 'La connexion a échoué. Veuillez réessayer.'
	},
	ownsPortfolio: {
		en: 'Your Google account already has its portfolio.',
		fr: 'Votre compte Google a déjà son portfolio.'
	},
	nameGone: { en: 'This name is no longer available.', fr: "Ce nom n'est plus disponible." },
	claiming: { en: 'Claiming domain...', fr: "Réservation de l'adresse…" },
	tickToShow: {
		en: 'Tick the box to show the Google sign-in button.',
		fr: 'Cochez la case pour afficher le bouton de connexion Google.'
	},
	googleUnavailable: {
		en: 'Google sign-in could not load. Check your connection (or allow accounts.google.com) and try again.',
		fr: "La connexion avec Google n'a pas pu se charger. Vérifiez votre connexion internet (ou autorisez accounts.google.com) et réessayez."
	}
});
