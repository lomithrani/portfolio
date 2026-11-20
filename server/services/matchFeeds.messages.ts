import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
  /**
   * GET /opportunities and GET /recruiter/jobs/:id/candidates over MATCHING_FEED_READS (429): one
   * counter for both, the jobs proposed to a candidate and the candidates proposed for a
   * recruiter's job
   */
  tooManyReads: {
    en: (limit: number) =>
      `You can read what is proposed to you ${limit} ${plural(limit, 'time', 'times')} an hour. Try again later.`,
    fr: (limit: number) =>
      `Vous pouvez consulter ce qui vous est proposé ${limit} ${plural(limit, 'fois', 'fois')} par heure. Réessayez plus tard.`
  }
});
