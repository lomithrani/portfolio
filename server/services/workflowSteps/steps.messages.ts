import { defineMessages } from 'portfolio-common';

/** What the step types of the hiring journey say: refusals of a submit, lines of the meeting invitation */
export const m = defineMessages({
  job: {
    pickOne: {
      en: 'Pick one of your job descriptions',
      fr: "Choisissez l'une de vos offres d'emploi"
    },
    /** Invitation line: the job picked, with the hiring company when the posting names it */
    invitation: {
      en: (title: string, company?: string) => `Job: ${company ? `${title} — ${company}` : title}`,
      fr: (title: string, company?: string) => `Offre : ${company ? `${title} — ${company}` : title}`
    }
  },
  jobMatch: {
    /** Invitation line: the job's score against the owner's perfect job */
    invitation: {
      en: (score: number) => `Job match: ${score}/100`,
      fr: (score: number) => `Correspondance avec le poste idéal : ${score}/100`
    }
  },
  note: {
    confirmRead: {
      en: 'Confirm that you have read the note',
      fr: 'Confirmez que vous avez lu la note'
    }
  }
});
