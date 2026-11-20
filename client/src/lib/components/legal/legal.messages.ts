// The texts around the legal documents: the footer of the site's pages, the links to the legal
// pages, the shell of a legal page, the notice under the age and terms checkbox and what the terms
// ask of recruiters where the recruiter space is opened. The
// documents themselves are components, one per document and language (content/).
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	footer: {
		label: { en: 'Site', fr: 'Site' },
		recruiters: { en: 'For recruiters', fr: 'Pour les recruteurs' }
	},
	links: {
		label: { en: 'Legal', fr: 'Informations légales' }
	},
	document: {
		language: { en: 'Language', fr: 'Langue' },
		lastUpdated: { en: 'Last updated:', fr: 'Dernière mise à jour :' },
		contents: { en: 'Contents', fr: 'Sommaire' },
		others: { en: 'Other legal documents', fr: 'Autres documents légaux' }
	},
	consent: {
		notice: {
			en: 'By continuing you agree to the <terms>Terms of use</terms> and acknowledge the <privacy>Privacy policy</privacy>.',
			fr: "En continuant, vous acceptez les <terms>conditions d'utilisation</terms> et prenez acte de la <privacy>politique de confidentialité</privacy>."
		},
		/** The same where the recruiter space is opened: what the terms ask of recruiters, in short */
		recruiterNotice: {
			en: 'By continuing you agree to the <terms>Terms of use</terms>, including <recruiters>what they ask of recruiters</recruiters> (a real position, the pay actually offered, no maximum age, the right to act for the employer), and acknowledge the <privacy>Privacy policy</privacy>.',
			fr: "En continuant, vous acceptez les <terms>conditions d'utilisation</terms>, dont <recruiters>ce qu'elles demandent aux recruteurs</recruiters> (un poste réel, la rémunération réellement proposée, aucune limite d'âge supérieure, le droit d'agir pour l'employeur), et prenez acte de la <privacy>politique de confidentialité</privacy>."
		},
		newTab: { en: '(opens in a new tab)', fr: '(nouvel onglet)' }
	},
	/**
	 * Where the recruiter space is opened by an account that already accepted the terms in force
	 * (no checkbox): what the terms ask of recruiters, in short
	 */
	recruiterRules: {
		en: 'As a recruiter, you follow <recruiters>what the Terms of use ask of recruiters</recruiters>: a real position, the pay actually offered, no maximum age, the right to act for the employer.',
		fr: "En tant que recruteur, vous respectez <recruiters>ce que les conditions d'utilisation demandent aux recruteurs</recruiters> : un poste réel, la rémunération réellement proposée, aucune limite d'âge supérieure, le droit d'agir pour l'employeur."
	}
});
