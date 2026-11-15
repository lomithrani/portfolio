import { defineMessages, plural } from 'portfolio-common'

/**
 * What the résumé import tells the owner reviewing the drafts: what was dropped or changed
 * (never what is sent to the model: the prompt and the schema stay as they are)
 */
export const m = defineMessages({
  malformedEntries: {
    en: (count: number) =>
      `Skipped ${count} ${plural(count, 'entry', 'entries')} that came back in an unexpected shape`,
    fr: (count: number) =>
      `${count} ${plural(count, 'entrée ignorée : sa forme était inattendue', 'entrées ignorées : leur forme était inattendue')}`
  },
  untitledEntries: {
    en: (count: number) => `Skipped ${count} ${plural(count, 'entry', 'entries')} without a title`,
    fr: (count: number) => `${count} ${plural(count, 'entrée sans titre ignorée', 'entrées sans titre ignorées')}`
  },
  experiencesOverCap: {
    en: (max: number) => `Only the first ${max} experiences were kept`,
    fr: (max: number) => `Seules les ${max} premières expériences ont été conservées`
  },
  projectsOverCap: {
    en: (count: number, max: number) =>
      `${count} ${plural(count, 'experience has', 'experiences have')} more than ${max} projects: only the first ${max} of each were kept`,
    fr: (count: number, max: number) =>
      `${count} ${plural(count, 'expérience a', 'expériences ont')} plus de ${max} projets : seuls les ${max} premiers de chacune ont été conservés`
  },
  skillListsOverCap: {
    en: (count: number, max: number) =>
      `${count} ${plural(count, 'skill list has', 'skill lists have')} more than ${max} skills: only the first ${max} of each were kept`,
    fr: (count: number, max: number) =>
      `${count} ${plural(count, 'liste de compétences a', 'listes de compétences ont')} plus de ${max} compétences : seules les ${max} premières de chacune ont été conservées`
  },
  truncatedTexts: {
    en: (count: number) => `Shortened ${count} ${plural(count, 'text that was', 'texts that were')} too long`,
    fr: (count: number) => `${count} ${plural(count, 'texte trop long raccourci', 'textes trop longs raccourcis')}`
  },
  invalidDates: {
    en: (count: number) =>
      `Left out ${count} ${plural(count, 'date that is', 'dates that are')} not a valid month (YYYY-MM)`,
    fr: (count: number) =>
      `${count} ${plural(count, 'date ignorée', 'dates ignorées')} : mois invalide (AAAA-MM)`
  },
  endsBeforeStart: {
    en: (count: number) => `Left out ${count} ${plural(count, 'end date', 'end dates')} before the start date`,
    fr: (count: number) =>
      `${count} ${plural(count, 'date de fin ignorée', 'dates de fin ignorées')} : avant la date de début`
  },
  longSkillNames: {
    en: (count: number, max: number) =>
      `Left out ${count} ${plural(count, 'skill name', 'skill names')} longer than ${max} characters`,
    fr: (count: number, max: number) =>
      `${count} ${plural(count, 'nom de compétence ignoré', 'noms de compétences ignorés')} : plus de ${max} caractères`
  },
  /** `listed`: the names, separated by commas; `more`: how many others are not named */
  unplacedSkills: {
    en: (listed: string, more: number) =>
      `Skills listed on the résumé but not tied to any experience were left out: ${listed}${more > 0 ? ` and ${more} more` : ''}`,
    fr: (listed: string, more: number) =>
      `Les compétences du CV qui ne sont rattachées à aucune expérience ont été laissées de côté : ${listed}${more > 0 ? ` et ${more} ${plural(more, 'autre', 'autres')}` : ''}`
  },
  noExperiences: {
    en: 'No experiences were found in this file',
    fr: "Aucune expérience n'a été trouvée dans ce fichier"
  }
})
