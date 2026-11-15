import { defineMessages } from 'portfolio-common';

/** What the address search says when it cannot answer (GET /addresses/search, GET /addresses/office) */
export const m = defineMessages({
  /** `wait`: a wait of rateLimit.messages.ts */
  tooManySearches: {
    en: (wait: string) => `Too many address searches. Try again in ${wait}.`,
    fr: (wait: string) => `Trop de recherches d'adresse. Réessayez dans ${wait}.`
  },
  searchUnavailable: {
    en: 'Addresses cannot be searched right now. Try again in a moment.',
    fr: 'Impossible de rechercher une adresse pour le moment. Réessayez dans un instant.'
  }
});
