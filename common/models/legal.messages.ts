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
	/** The confirmation was given for an older version of the terms (a page loaded before they changed) */
	staleTerms: {
		en: 'The terms of use have changed since this page was loaded. Reload the page and accept them again.',
		fr: "Les conditions d'utilisation ont changé depuis le chargement de cette page. Rechargez la page et acceptez-les de nouveau."
	}
});
