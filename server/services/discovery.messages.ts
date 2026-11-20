import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
  /** POST /discovery/consent over DISCOVERY_GRANTS_PER_DAY (429) */
  tooManyGrants: {
    en: (limit: number) =>
      `You can make yourself visible to recruiters ${limit} ${plural(limit, 'time', 'times')} a day. Try again tomorrow.`,
    fr: (limit: number) =>
      `Vous pouvez vous rendre visible des recruteurs ${limit} ${plural(limit, 'fois', 'fois')} par jour. Réessayez demain.`
  }
});
