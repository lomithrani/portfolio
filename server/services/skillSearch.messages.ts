import { defineMessages } from 'portfolio-common';

/** What the skill search says when it refuses a request (GET /skills/search) */
export const m = defineMessages({
  /** `max`: the longest text it takes, in characters */
  invalidQuery: {
    en: (max: number) => `Type between 1 and ${max} characters to search for a skill.`,
    fr: (max: number) => `Saisissez entre 1 et ${max} caractères pour rechercher une compétence.`
  },
  /** `wait`: a wait of rateLimit.messages.ts */
  tooManySearches: {
    en: (wait: string) => `Too many skill searches. Try again in ${wait}.`,
    fr: (wait: string) => `Trop de recherches de compétences. Réessayez dans ${wait}.`
  }
});
