import { defineMessages } from 'portfolio-common'

/** What the PDF imports (résumé, job description) say alike */
export const m = defineMessages({
  notBase64: { en: 'The file is not valid base64', fr: "Le fichier n'est pas du base64 valide" },
  onlyPdf: { en: 'Only PDF files can be imported', fr: 'Seuls les fichiers PDF peuvent être importés' },
  pdfTooLong: {
    en: 'This PDF is too long for an import (more than ~10 pages)',
    fr: 'Ce PDF est trop long pour un import (plus de 10 pages environ)'
  },
  /** An instant from its ISO 8601 text (`2026-11-20T00:00:00.000Z`), as the quota messages name it */
  utcDate: {
    en: (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`,
    fr: (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} à ${iso.slice(11, 16)} UTC`
  }
})
