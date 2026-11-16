import { defineMessages } from 'portfolio-common'

/**
 * What the "Send feedback" dialog is answered. The issue filed on GitHub is not here: it is
 * public, on an English repository, and stays in English
 */
export const m = defineMessages({
  disabled: {
    en: 'Feedback is not enabled on this server',
    fr: 'Les retours ne sont pas activés sur ce serveur'
  },
  unavailable: {
    en: 'Your feedback could not be sent right now, try again later',
    fr: "Votre retour n'a pas pu être envoyé pour le moment, réessayez plus tard"
  },
  accountLimit: {
    en: (limit: number) => `You can send feedback ${limit} times a day: try again tomorrow`,
    fr: (limit: number) => `Vous pouvez envoyer ${limit} retours par jour : réessayez demain`
  },
  siteLimit: {
    en: 'Too much feedback was sent today: try again tomorrow',
    fr: "Trop de retours ont été envoyés aujourd'hui : réessayez demain"
  },
  attemptsLimit: {
    en: 'Your feedback could not be sent today: try again tomorrow',
    fr: "Vos retours n'ont pas pu être envoyés aujourd'hui : réessayez demain"
  }
})
