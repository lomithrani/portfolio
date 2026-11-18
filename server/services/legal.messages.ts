import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
  /** The message of a claim refused because the account never accepted the terms in force */
  claimConsentRequired: {
    en: 'Confirm your age and accept the terms of use to create your portfolio.',
    fr: "Confirmez votre âge et acceptez les conditions d'utilisation pour créer votre portfolio."
  },
  /** Opening the recruiter space refused because the account never accepted the terms in force */
  recruiterConsentRequired: {
    en: 'Confirm your age and accept the terms of use to open your recruiter space.',
    fr: "Confirmez votre âge et acceptez les conditions d'utilisation pour ouvrir votre espace recruteur."
  },
  /**
   * A recruiter route refused because the account has a recruiter space but has not accepted
   * the terms in force (an older version, or none: a space opened before recruiters accepted them)
   */
  recruiterTermsRequired: {
    en: 'Accept the terms of use in force to use your recruiter space.',
    fr: "Acceptez les conditions d'utilisation en vigueur pour utiliser votre espace recruteur."
  }
});
