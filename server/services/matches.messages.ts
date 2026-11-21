import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
  /**
   * A decision of matching over MATCHING_DECISIONS (429): what a candidate says of a job proposed
   * to them, what a recruiter says of a candidate's anonymous card, or undoing either; one counter
   * for both sides
   */
  tooManyDecisions: {
    en: (limit: number) =>
      `You can answer what is proposed to you ${limit} ${plural(limit, 'time', 'times')} a day. Try again tomorrow.`,
    fr: (limit: number) =>
      `Vous pouvez répondre à ce qui vous est proposé ${limit} ${plural(limit, 'fois', 'fois')} par jour. Réessayez demain.`
  }
});
