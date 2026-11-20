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
	 * the age of discovery (MINIMUM_DISCOVERY_AGE, written out: legal.ts imports this file), what is
	 * matched (their criteria, both ways: the jobs shown to them, their card proposed to those
	 * jobs' recruiters), everything the anonymous card shows before both sides are interested (the
	 * headline, the role titles with their time and whether each is held now, the total time of
	 * professional experience, the skills and their time, and, when their job match shows details,
	 * the outcome of each criterion but the commute and the location: every field of the card,
	 * server/services/candidateCard.ts), and how to stop. The API records which wording it was (DISCOVERY_CONSENT_KEYS, one key per language):
	 * changing a text here means a new key, which server/tests/matching.test.ts pins.
	 */
	discoveryConsent: {
		en: 'I confirm that I am at least 18 years old. I want Portfolio to show me the open jobs that meet my criteria, and to propose my anonymous card to their recruiters. My card shows the headline I write, my role titles with the time spent in each and whether I still hold it, my total time of professional experience, and my skills with how long I used each. If my page for recruiters shows them how their job does on each of my criteria, my card shows it too, except for my commute and where I want to work. A recruiter sees my name and my portfolio only once we are both interested. I can turn this off at any time.',
		fr: "Je confirme avoir au moins 18 ans. Je souhaite que Portfolio me montre les offres ouvertes qui répondent à mes critères et propose ma fiche anonyme à leurs recruteurs. Ma fiche montre l'accroche que j'écris, mes intitulés de poste avec le temps passé à chacun et si je l'occupe encore, ma durée totale d'expérience professionnelle, ainsi que mes compétences et leur durée d'utilisation. Si ma page recruteurs leur montre le résultat de leur offre sur chacun de mes critères, ma fiche le montre aussi, sauf pour mon trajet et le lieu où je veux travailler. Un recruteur ne voit mon nom et mon portfolio qu'en cas d'intérêt réciproque. Je peux désactiver cela à tout moment."
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
