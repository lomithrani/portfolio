import { defineMessages, plural } from 'portfolio-common'

/** What the rate limits say (429): how long to wait, and the limits several routes share */
export const m = defineMessages({
  /** A wait, as it ends "Try again in …" */
  wait: {
    minutes: {
      en: (minutes: number) => `${minutes} ${plural(minutes, 'minute', 'minutes')}`,
      fr: (minutes: number) => `${minutes} ${plural(minutes, 'minute', 'minutes')}`
    },
    hours: {
      en: (hours: number) => `${hours} hours`,
      fr: (hours: number) => `${hours} ${plural(hours, 'heure', 'heures')}`
    }
  },
  /** `wait`: one of the waits above */
  tooManyRequestsFromNetwork: {
    en: (wait: string) => `Too many requests from your network. Try again in ${wait}`,
    fr: (wait: string) => `Trop de requêtes depuis votre réseau. Réessayez dans ${wait}`
  }
})
