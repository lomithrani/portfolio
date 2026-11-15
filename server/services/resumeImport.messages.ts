import { defineMessages, plural } from 'portfolio-common'

/** `date`: an instant as claudePdfExtraction's utcText gives it */
export const m = defineMessages({
  disabled: {
    en: 'Résumé import is not enabled on this server',
    fr: "L'import de CV n'est pas activé sur ce serveur"
  },
  unavailable: {
    en: 'Résumé import is temporarily unavailable, try again later',
    fr: "L'import de CV est momentanément indisponible, réessayez plus tard"
  },
  interrupted: {
    en: 'The import did not finish. It still counts toward your imports (the résumé may already have been read): try again later, or with a shorter résumé',
    fr: "L'import n'a pas abouti. Il compte tout de même dans vos imports (le CV a peut-être déjà été lu) : réessayez plus tard, ou avec un CV plus court"
  },
  fileTooLarge: {
    en: 'The file is too large: résumé import takes PDFs of up to 4 MB',
    fr: "Le fichier est trop volumineux : l'import de CV accepte les PDF jusqu'à 4 Mo"
  },
  importsUsed: {
    en: (limit: number, date: string) =>
      `You have used your ${limit} ${plural(limit, 'résumé import', 'résumé imports')} for this period. You can import again from ${date}`,
    fr: (limit: number, date: string) =>
      `Vous avez utilisé ${plural(limit, 'votre', 'vos')} ${limit} ${plural(limit, 'import', 'imports')} de CV pour cette période. Vous pourrez de nouveau importer à partir du ${date}`
  },
  dailyLimitReached: {
    en: (date: string) => `Résumé import has reached its daily limit on this site. Try again after ${date}`,
    fr: (date: string) =>
      `L'import de CV a atteint sa limite quotidienne sur ce site. Réessayez après le ${date}`
  },
  attemptsUsed: {
    en: (limit: number, date: string) =>
      `You have used your ${limit} ${plural(limit, 'résumé import attempt', 'résumé import attempts')} for today. Try again after ${date}`,
    fr: (limit: number, date: string) =>
      `Vous avez utilisé ${plural(limit, 'votre', 'vos')} ${limit} ${plural(limit, "tentative d'import", "tentatives d'import")} de CV pour aujourd'hui. Réessayez après le ${date}`
  },
  notAResume: {
    en: 'This file could not be read as a résumé',
    fr: "Ce fichier n'a pas pu être lu comme un CV"
  },
  tooMuchContent: {
    en: 'This résumé has too much content to import at once. Try a shorter version',
    fr: 'Ce CV a trop de contenu pour être importé en une fois. Essayez avec une version plus courte'
  }
})
