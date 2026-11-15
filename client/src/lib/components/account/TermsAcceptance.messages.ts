import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	title: { en: 'Terms of use', fr: "Conditions d'utilisation" },
	/** The account accepted the terms in force, dated `date` */
	accepted: {
		en: (date: string) =>
			`You accepted the <terms>Terms of use</terms> and the <privacy>Privacy policy</privacy> of <date>${date}</date>, the version in force, and confirmed your age.`,
		fr: (date: string) =>
			`Vous avez accepté les <terms>conditions d'utilisation</terms> et la <privacy>politique de confidentialité</privacy> du <date>${date}</date>, la version en vigueur, et confirmé votre âge.`
	},
	/** The account accepted an older version (`accepted`); the terms in force are dated `current` */
	outdated: {
		withPortfolio: {
			en: (accepted: string, current: string) =>
				`You accepted the version of <date>${accepted}</date>. The terms changed on <date>${current}</date>: read the <terms>Terms of use</terms> and accept them: this records your confirmation for your portfolio.`,
			fr: (accepted: string, current: string) =>
				`Vous avez accepté la version du <date>${accepted}</date>. Les conditions ont changé le <date>${current}</date> : lisez les <terms>conditions d'utilisation</terms> et acceptez-les : cela enregistre votre confirmation pour votre portfolio.`
		},
		withoutPortfolio: {
			en: (accepted: string, current: string) =>
				`You accepted the version of <date>${accepted}</date>. The terms changed on <date>${current}</date>: read the <terms>Terms of use</terms> and accept them to create a portfolio.`,
			fr: (accepted: string, current: string) =>
				`Vous avez accepté la version du <date>${accepted}</date>. Les conditions ont changé le <date>${current}</date> : lisez les <terms>conditions d'utilisation</terms> et acceptez-les pour créer un portfolio.`
		}
	},
	notAccepted: {
		withPortfolio: {
			en: 'You have not accepted the current Terms of use yet. Accepting them records your confirmation for your portfolio.',
			fr: "Vous n'avez pas encore accepté les conditions d'utilisation en vigueur. Les accepter enregistre votre confirmation pour votre portfolio."
		},
		withoutPortfolio: {
			en: 'You have not accepted the Terms of use yet. You need to before you create a portfolio.',
			fr: "Vous n'avez pas encore accepté les conditions d'utilisation. Vous devez le faire avant de créer un portfolio."
		}
	},
	accept: { en: 'Accept the terms', fr: 'Accepter les conditions' },
	done: {
		title: { en: 'Terms accepted', fr: 'Conditions acceptées' },
		description: {
			en: (date: string) => `You accepted the Terms of use of ${date}.`,
			fr: (date: string) => `Vous avez accepté les conditions d'utilisation du ${date}.`
		}
	},
	/** Under the toast that says the session expired */
	notSaved: {
		en: 'Your acceptance was not saved.',
		fr: "Votre acceptation n'a pas été enregistrée."
	}
});
