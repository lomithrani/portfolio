import { defineMessages } from '../i18n';

export const legalMessages = defineMessages({
	/**
	 * The exact wording of the age confirmation a person ticks. The API records which wording it
	 * was (AGE_CONFIRMATION_KEYS, one key per language): changing a text here means a new key.
	 */
	ageConfirmation: {
		en: 'I confirm that I am at least 16 years old and have reached the minimum legal working age in my country.',
		fr: "Je confirme avoir au moins 16 ans et avoir atteint l'âge minimum légal pour travailler dans mon pays."
	},
	/** No confirmation at all (no object, or not ticked) */
	consentRequired: {
		en: 'Confirm your age and accept the terms of use to continue.',
		fr: "Confirmez votre âge et acceptez les conditions d'utilisation pour continuer."
	},
	/**
	 * The exact wording of the discovery consent a person ticks (Path 2, apart from the terms):
	 * the age of discovery (MINIMUM_DISCOVERY_AGE), what recruiters see before both sides are
	 * interested, and how to stop. The API records which wording it was (DISCOVERY_CONSENT_KEYS,
	 * one key per language): changing a text here means a new key.
	 */
	discoveryConsent: {
		en: 'I confirm that I am at least 18 years old. I want Portfolio to propose my anonymous card (my role titles, the time spent in each, my skills) to recruiters whose open jobs meet my criteria. A recruiter sees my name and my portfolio only once we are both interested. I can turn this off at any time.',
		fr: "Je confirme avoir au moins 18 ans. Je souhaite que Portfolio propose ma fiche anonyme (mes intitulés de poste, le temps passé à chacun, mes compétences) aux recruteurs dont les offres ouvertes répondent à mes critères. Un recruteur ne voit mon nom et mon portfolio qu'en cas d'intérêt réciproque. Je peux désactiver cela à tout moment."
	},
	/** No discovery consent (no object, or not ticked) */
	discoveryConsentRequired: {
		en: 'Confirm that you are at least 18 and want to be proposed to recruiters.',
		fr: 'Confirmez avoir au moins 18 ans et vouloir être proposé aux recruteurs.'
	},
	/** The confirmation was given for an older version of the terms (a page loaded before they changed) */
	staleTerms: {
		en: 'The terms of use have changed since this page was loaded. Reload the page and accept them again.',
		fr: "Les conditions d'utilisation ont changé depuis le chargement de cette page. Rechargez la page et acceptez-les de nouveau."
	}
});
