// The texts around the legal documents: the footer of the site's pages, the links to the legal
// pages, the shell of a legal page and the notice under the age and terms checkbox. The
// documents themselves are components, one per document and language (content/).
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	footer: {
		label: { en: 'Site', fr: 'Site' },
		jobs: { en: 'Browse jobs', fr: "Offres d'emploi" },
		recruiters: { en: 'For recruiters', fr: 'Pour les recruteurs' }
	},
	links: {
		label: { en: 'Legal', fr: 'Informations légales' }
	},
	document: {
		language: { en: 'Language', fr: 'Langue' },
		lastUpdated: { en: 'Last updated:', fr: 'Dernière mise à jour :' },
		contents: { en: 'Contents', fr: 'Sommaire' },
		others: { en: 'Other legal documents', fr: 'Autres documents légaux' },
		/** og:locale */
		locale: { en: 'en_GB', fr: 'fr_FR' }
	},
	consent: {
		notice: {
			en: 'By continuing you agree to the <terms>Terms of use</terms> and acknowledge the <privacy>Privacy policy</privacy>.',
			fr: "En continuant, vous acceptez les <terms>conditions d'utilisation</terms> et prenez acte de la <privacy>politique de confidentialité</privacy>."
		},
		newTab: { en: '(opens in a new tab)', fr: '(nouvel onglet)' }
	}
});
