import { defineMessages } from 'portfolio-common';

/** What the error handler says itself (the other texts come with the errors it is given) */
export const m = defineMessages({
  invalidRequest: { en: 'Invalid request', fr: 'Requête invalide' },
  invalidFileType: { en: 'Invalid file type', fr: 'Type de fichier invalide' },
  /** `path`: the field's name, or several separated by commas */
  invalidValueFor: {
    en: (path: string) => `Invalid value for ${path}`,
    fr: (path: string) => `Valeur invalide pour ${path}`
  },
  /** No field to name */
  invalidValueForRequest: { en: 'Invalid value for request', fr: 'Valeur invalide dans la requête' }
});
