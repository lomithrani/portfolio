import { defineMessages } from 'portfolio-common';

/** Signing in with Google: the ID token (services/google.ts) and the account it names (services/users.ts) */
export const m = defineMessages({
  invalidToken: { en: 'Invalid Google token', fr: 'Jeton Google invalide' },
  emailNotVerified: {
    en: 'Google account email is not verified',
    fr: "L'adresse e-mail du compte Google n'est pas vérifiée"
  },
  emailLinkedElsewhere: {
    en: 'This email is linked to a different Google account',
    fr: 'Cette adresse e-mail est liée à un autre compte Google'
  }
});
