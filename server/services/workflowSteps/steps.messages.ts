import { defineMessages } from 'portfolio-common';

/** What the step types of the hiring journey say: refusals of a submit, lines of the meeting invitation */
export const m = defineMessages({
  job: {
    pickOne: {
      en: 'Pick one of your job descriptions',
      fr: "Choisissez l'une de vos offres d'emploi"
    },
    /**
     * 422: a posting saved under older rules that today's refuse: shared as it is, it would not
     * hold. It was opened (only an open posting is shared), so what breaks a rule may be one of its
     * terms, locked: then only a copy of it can be corrected
     */
    cannotShare: {
      en: 'This job description cannot be shared as it is: correct it in your recruiter space, or duplicate it if what needs correcting is locked, then pick the corrected one here',
      fr: "Cette offre ne peut pas être partagée telle quelle : corrigez-la dans votre espace recruteur, ou dupliquez-la si ce qu'il faut corriger est verrouillé, puis choisissez ici l'offre corrigée"
    },
    /**
     * 429: the recruiter shared as many jobs on this journey, which scores each one, as a day allows
     * (counted per owner and recruiter, whatever the job)
     */
    tooManyShares: {
      en: (limit: number) =>
        `You can share at most ${limit} jobs a day on this page, where each one is scored: try again tomorrow`,
      fr: (limit: number) =>
        `Vous pouvez partager au plus ${limit} offres par jour sur cette page, où chacune est notée : réessayez demain`
    },
    /** Invitation line: the job shared, with the hiring company when the version shared names it */
    invitation: {
      en: (title: string, company?: string) => `Job: ${company ? `${title} — ${company}` : title}`,
      fr: (title: string, company?: string) => `Offre : ${company ? `${title} — ${company}` : title}`
    },
    /**
     * Invitation line, after the job's: the owner and the recruiter are both interested in it
     * (matching): how the meeting came about. Never a bare "match", which names the score
     */
    mutualInterest: {
      en: 'Mutual interest on Portfolio',
      fr: 'Intérêt réciproque sur Portfolio'
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
