import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
  /** POST /discovery/consent over DISCOVERY_GRANTS_PER_DAY (429) */
  tooManyGrants: {
    en: (limit: number) =>
      `You can make yourself visible to recruiters ${limit} ${plural(limit, 'time', 'times')} a day. Try again tomorrow.`,
    fr: (limit: number) =>
      `Vous pouvez vous rendre visible des recruteurs ${limit} ${plural(limit, 'fois', 'fois')} par jour. Réessayez demain.`
  },
  /** POST /discovery/consent within DISCOVERY_REJOIN_DAYS of a withdrawal (429) */
  rejoinTooSoon: {
    en: (days: number) =>
      `You can make yourself visible to recruiters again ${days} ${plural(days, 'day', 'days')} after you stopped. Try again later.`,
    fr: (days: number) =>
      `Vous pourrez vous rendre de nouveau visible des recruteurs ${days} ${plural(days, 'jour', 'jours')} après avoir cessé de l'être. Réessayez plus tard.`
  }
});
