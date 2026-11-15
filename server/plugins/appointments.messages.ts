import { defineMessages } from 'portfolio-common'

export const m = defineMessages({
  unknownTimeZone: { en: 'Unknown time zone', fr: 'Fuseau horaire inconnu' },
  windowsEndAfterStart: {
    en: 'Availability windows must end after they start',
    fr: 'Les plages de disponibilité doivent finir après leur début'
  },
  scheduleNotFound: { en: 'Schedule not found', fr: 'Agenda de rendez-vous introuvable' },
  appointmentNotFound: { en: 'Appointment not found', fr: 'Rendez-vous introuvable' },
  invalidDate: { en: 'Invalid date', fr: 'Date invalide' },
  rangeEndsBeforeStart: {
    en: 'The range must not end before it starts',
    fr: 'La période ne doit pas finir avant son début'
  },
  tooManyDates: {
    en: (max: number) => `At most ${max} dates per request`,
    fr: (max: number) => `${max} dates au plus par requête`
  },
  invalidStartTime: { en: 'Invalid start time', fr: 'Heure de début invalide' },
  /**
   * The description of the Google Calendar event a booking creates, read by the portfolio's
   * owner and by the person who booked: in the language of the request that books
   */
  invitation: {
    bookedBy: {
      en: (name: string, email: string) => `Booked via Portfolio by ${name} (${email})`,
      fr: (name: string, email: string) => `Réservé sur Portfolio par ${name} (${email})`
    },
    /**
     * Heading of the notes the visitor wrote, which follow on the next line as they typed them:
     * not through a message, whose French typography would rewrite their spaces
     */
    notesLabel: { en: 'Notes:', fr: 'Notes :' }
  }
})
