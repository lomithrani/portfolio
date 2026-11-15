import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
  tooManyJobs: {
    en: (max: number) => `You can keep at most ${max} job postings: delete one to add another`,
    fr: (max: number) =>
      `Vous pouvez garder ${max} offres d'emploi au plus : supprimez-en une pour en ajouter une autre`
  },
  applicantNotFound: { en: 'Applicant not found', fr: 'Candidat introuvable' }
});
