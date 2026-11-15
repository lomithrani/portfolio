import { defineMessages } from 'portfolio-common'

/**
 * What the "Suggest a step" form is answered. The issue filed on GitHub is not here: it is
 * public, on an English repository, and stays in English
 */
export const m = defineMessages({
  disabled: {
    en: 'Step suggestions are not enabled on this server',
    fr: "Les suggestions d'étape ne sont pas activées sur ce serveur"
  },
  unavailable: {
    en: 'Your suggestion could not be sent right now, try again later',
    fr: "Votre suggestion n'a pas pu être envoyée pour le moment, réessayez plus tard"
  },
  ownersOnly: {
    en: 'Claim your portfolio to suggest a step',
    fr: 'Réservez votre portfolio pour suggérer une étape'
  },
  ownerLimit: {
    en: (limit: number) => `You can send ${limit} suggestions a day: try again tomorrow`,
    fr: (limit: number) => `Vous pouvez envoyer ${limit} suggestions par jour : réessayez demain`
  },
  siteLimit: {
    en: 'Too many suggestions were sent today: try again tomorrow',
    fr: "Trop de suggestions ont été envoyées aujourd'hui : réessayez demain"
  },
  attemptsLimit: {
    en: 'Your suggestions could not be sent today: try again tomorrow',
    fr: "Vos suggestions n'ont pas pu être envoyées aujourd'hui : réessayez demain"
  }
})
