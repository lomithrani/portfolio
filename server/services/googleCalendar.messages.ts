import { defineMessages } from 'portfolio-common'

export const m = defineMessages({
  /** Google refused the stored grant: the owner must connect again */
  reconnectRequired: {
    en: 'Google Calendar access was revoked or has expired. Reconnect Google Calendar',
    fr: "L'accès à Google Agenda a été révoqué ou a expiré. Reconnectez Google Agenda"
  },
  notConfigured: {
    en: 'Google Calendar is not configured on this server',
    fr: "Google Agenda n'est pas configuré sur ce serveur"
  },
  codeRejected: {
    en: 'Google rejected the authorization code',
    fr: "Google a refusé le code d'autorisation"
  },
  accessNotGranted: {
    en: 'Calendar access was not granted',
    fr: "L'accès à l'agenda n'a pas été accordé"
  },
  noOfflineAccess: {
    en: 'Google did not grant offline access. Remove this app from your Google account permissions, then connect again',
    fr: "Google n'a pas accordé l'accès hors connexion. Retirez cette application des autorisations de votre compte Google, puis reconnectez Google Agenda"
  },
  notConnected: { en: 'Google Calendar not connected', fr: "Google Agenda n'est pas connecté" }
})
