import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
  /** The account has no portfolio (also POST /experiences/import, which follows the same rule) */
  noDomain: { en: 'You do not own a domain', fr: "Vous n'avez pas encore réservé votre portfolio" },
  experienceNotInDomain: {
    en: 'Experience not found in your domain',
    fr: 'Expérience introuvable dans votre portfolio'
  },
  experienceNotFound: { en: 'Experience not found', fr: 'Expérience introuvable' }
});
