import { defineMessages } from 'portfolio-common';

/** The address an owner travels from, when they save it with their perfect job */
export const m = defineMessages({
  addressNotFound: {
    en: 'This address was not found. Check it, or give a town or a place nearby.',
    fr: 'Cette adresse est introuvable. Vérifiez-la, ou indiquez une ville ou un lieu proche.'
  },
  commuteUnavailable: {
    en: 'Travel times are not available on this site.',
    fr: 'Les temps de trajet ne sont pas disponibles sur ce site.'
  },
  addressLookupFailed: {
    en: 'The address could not be looked up right now. Try again in a moment.',
    fr: "Impossible de rechercher l'adresse pour le moment. Réessayez dans un instant."
  }
});
