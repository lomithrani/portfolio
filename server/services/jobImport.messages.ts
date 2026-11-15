import { defineMessages, plural } from 'portfolio-common'

/** `date`: an instant as claudePdfExtraction's utcText gives it */
export const m = defineMessages({
  disabled: {
    en: 'Job description import is not enabled on this server',
    fr: "L'import d'offre n'est pas activé sur ce serveur"
  },
  unavailable: {
    en: 'Job description import is temporarily unavailable, try again later',
    fr: "L'import d'offre est momentanément indisponible, réessayez plus tard"
  },
  interrupted: {
    en: 'The import did not finish. It still counts toward your imports (the job description may already have been read): try again later, or with a shorter document',
    fr: "L'import n'a pas abouti. Il compte tout de même dans vos imports (l'offre a peut-être déjà été lue) : réessayez plus tard, ou avec un document plus court"
  },
  fileTooLarge: {
    en: 'The file is too large: job description import takes PDFs of up to 4 MB',
    fr: "Le fichier est trop volumineux : l'import d'offre accepte les PDF jusqu'à 4 Mo"
  },
  /** The recruiter plans (portfolio-common's RECRUITER_PLANS), as planLimitReached names them */
  plans: {
    free: { en: 'free', fr: 'gratuite' }
  },
  /** `plan`: one of the plans above */
  planLimitReached: {
    en: (limit: number, plan: string) =>
      `You have used the ${limit} ${plural(limit, 'job description import', 'job description imports')} included in the ${plan} plan. Paid plans are coming soon.`,
    fr: (limit: number, plan: string) =>
      `Vous avez utilisé ${plural(limit, "l'import d'offre inclus", `les ${limit} imports d'offre inclus`)} dans la formule ${plan}. Des formules payantes arrivent bientôt.`
  },
  dailyLimitReached: {
    en: (date: string) =>
      `Job description import has reached its daily limit on this site. Try again after ${date}`,
    fr: (date: string) =>
      `L'import d'offre a atteint sa limite quotidienne sur ce site. Réessayez après le ${date}`
  },
  attemptsUsed: {
    en: (limit: number, date: string) =>
      `You have used your ${limit} ${plural(limit, 'job description import attempt', 'job description import attempts')} for today. Try again after ${date}`,
    fr: (limit: number, date: string) =>
      `Vous avez utilisé ${plural(limit, 'votre', 'vos')} ${limit} ${plural(limit, "tentative d'import", "tentatives d'import")} d'offre pour aujourd'hui. Réessayez après le ${date}`
  },
  notAJobDescription: {
    en: 'This file could not be read as a job description',
    fr: "Ce fichier n'a pas pu être lu comme une offre d'emploi"
  },
  tooMuchContent: {
    en: 'This job description has too much content to import at once. Try a shorter version',
    fr: "Cette offre a trop de contenu pour être importée en une fois. Essayez avec une version plus courte"
  }
})
