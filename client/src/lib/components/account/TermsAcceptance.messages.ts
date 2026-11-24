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
				`You accepted the version of <date>${accepted}</date>. The terms changed on <date>${current}</date>: read the <terms>Terms of use</terms> and accept them to create your portfolio.`,
			fr: (accepted: string, current: string) =>
				`Vous avez accepté la version du <date>${accepted}</date>. Les conditions ont changé le <date>${current}</date> : lisez les <terms>conditions d'utilisation</terms> et acceptez-les pour créer votre portfolio.`
		},
		/** On the account page, for an account with a portfolio and a recruiter space */
		withBoth: {
			en: (accepted: string, current: string) =>
				`You accepted the version of <date>${accepted}</date>. The terms changed on <date>${current}</date>: read the <terms>Terms of use</terms> and accept them to keep using your recruiter space. This also records your confirmation for your portfolio.`,
			fr: (accepted: string, current: string) =>
				`Vous avez accepté la version du <date>${accepted}</date>. Les conditions ont changé le <date>${current}</date> : lisez les <terms>conditions d'utilisation</terms> et acceptez-les pour continuer à utiliser votre espace recruteur. Cela enregistre aussi votre confirmation pour votre portfolio.`
		}
	},
	notAccepted: {
		withPortfolio: {
			en: 'You have not accepted the current Terms of use yet. Accepting them records your confirmation for your portfolio.',
			fr: "Vous n'avez pas encore accepté les conditions d'utilisation en vigueur. Les accepter enregistre votre confirmation pour votre portfolio."
		},
		withoutPortfolio: {
			en: 'You have not accepted the Terms of use yet. You need to before you create your portfolio.',
			fr: "Vous n'avez pas encore accepté les conditions d'utilisation. Vous devez le faire avant de créer votre portfolio."
		},
		/** On the account page, for an account with a portfolio and a recruiter space */
		withBoth: {
			en: 'Read the <terms>Terms of use</terms> and accept them to keep using your recruiter space: they say what is asked of recruiters. This also records your confirmation for your portfolio.',
			fr: "Lisez les <terms>conditions d'utilisation</terms> et acceptez-les pour continuer à utiliser votre espace recruteur : elles disent ce qui est demandé aux recruteurs. Cela enregistre aussi votre confirmation pour votre portfolio."
		}
	},
	/**
	 * In the recruiter space, whose routes need the terms in force (`source` 'recruiter'), and on
	 * the account page of an account with a recruiter space and no portfolio
	 */
	recruiter: {
		/** The account accepted an older version (`accepted`); the terms in force are dated `current` */
		outdated: {
			en: (accepted: string, current: string) =>
				`You accepted the version of <date>${accepted}</date>. The terms changed on <date>${current}</date>: read the <terms>Terms of use</terms> and accept them to keep using your recruiter space.`,
			fr: (accepted: string, current: string) =>
				`Vous avez accepté la version du <date>${accepted}</date>. Les conditions ont changé le <date>${current}</date> : lisez les <terms>conditions d'utilisation</terms> et acceptez-les pour continuer à utiliser votre espace recruteur.`
		},
		/** A recruiter space opened before recruiters accepted the terms */
		notAccepted: {
			en: 'Read the <terms>Terms of use</terms> and accept them to keep using your recruiter space: they say what is asked of recruiters.',
			fr: "Lisez les <terms>conditions d'utilisation</terms> et acceptez-les pour continuer à utiliser votre espace recruteur : elles disent ce qui est demandé aux recruteurs."
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
