// Words used all over the site. A text that belongs to one feature lives in the
// `*.messages.ts` file next to it instead (see docs/I18N.md).
import { defineMessages } from 'portfolio-common';

export const common = defineMessages({
	save: { en: 'Save', fr: 'Enregistrer' },
	saving: { en: 'Saving…', fr: 'Enregistrement…' },
	cancel: { en: 'Cancel', fr: 'Annuler' },
	close: { en: 'Close', fr: 'Fermer' },
	/** Name of a toast's close button (the library's is English) */
	dismissNotification: { en: 'Dismiss notification', fr: 'Fermer la notification' },
	delete: { en: 'Delete', fr: 'Supprimer' },
	deleting: { en: 'Deleting…', fr: 'Suppression…' },
	edit: { en: 'Edit', fr: 'Modifier' },
	add: { en: 'Add', fr: 'Ajouter' },
	remove: { en: 'Remove', fr: 'Retirer' },
	back: { en: 'Back', fr: 'Retour' },
	next: { en: 'Next', fr: 'Suivant' },
	previous: { en: 'Previous', fr: 'Précédent' },
	retry: { en: 'Try again', fr: 'Réessayer' },
	loading: { en: 'Loading…', fr: 'Chargement…' },
	optional: { en: 'optional', fr: 'facultatif' },
	yes: { en: 'Yes', fr: 'Oui' },
	no: { en: 'No', fr: 'Non' },
	signInWithGoogle: { en: 'Sign in with Google', fr: 'Se connecter avec Google' },
	signingIn: { en: 'Signing in…', fr: 'Connexion…' },
	signInFailed: { en: 'Sign-in failed. Try again.', fr: 'La connexion a échoué. Réessayez.' },
	googleUnavailable: {
		en: 'Google sign-in could not load. Check your connection (or allow accounts.google.com if a blocker is on), then try again.',
		fr: "La connexion avec Google n'a pas pu se charger. Vérifiez votre connexion internet (ou autorisez accounts.google.com si un bloqueur est actif), puis réessayez."
	},
	/** Name of the language switch, and of the link to the other language */
	language: { en: 'Language', fr: 'Langue' }
});
