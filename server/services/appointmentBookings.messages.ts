import { defineMessages } from 'portfolio-common'

/** `wait`: a wait of rateLimit.messages.ts ("5 minutes", "2 hours") */
export const m = defineMessages({
  tooManyBookingsFromNetwork: {
    en: (wait: string) => `Too many booking requests from your network. Try again in ${wait}`,
    fr: (wait: string) => `Trop de demandes de réservation depuis votre réseau. Réessayez dans ${wait}`
  },
  tooManyBookingsForEmail: {
    en: (wait: string) => `Too many booking requests for this email address. Try again in ${wait}`,
    fr: (wait: string) => `Trop de demandes de réservation pour cette adresse e-mail. Réessayez dans ${wait}`
  },
  maxUpcomingBookings: {
    en: 'This email address already has the maximum number of upcoming bookings for this meeting',
    fr: 'Cette adresse e-mail a déjà le nombre maximal de réservations à venir pour ce rendez-vous'
  }
})
