import { defineMessages, plural } from 'portfolio-common';

// The editor's dialog: its header, its form's sections, its footer and what it answers when a
// save or a delete fails. The fields' names and the validation are in
// `#services/experienceForm.messages.ts`, the smaller components' texts in `editor.messages.ts`.
export const m = defineMessages({
	title: {
		add: { en: 'New experience', fr: 'Nouvelle expérience' },
		/** `title`: the experience's, as it was saved */
		edit: {
			en: (title: string) => `Edit · ${title}`,
			fr: (title: string) => `Modifier · ${title}`
		}
	},
	required: {
		en: 'Fields marked * are required.',
		fr: 'Les champs marqués * sont obligatoires.'
	},
	unsaved: { en: 'Unsaved changes', fr: 'Modifications non enregistrées' },
	restored: {
		en: 'Restored unsaved changes.',
		fr: 'Modifications non enregistrées rétablies.'
	},
	discard: { en: 'Discard', fr: 'Abandonner' },
	discardDraft: { en: 'Discard draft', fr: 'Abandonner le brouillon' },
	/** Announced once the form is back to what it was */
	discarded: {
		draft: { en: 'Draft discarded.', fr: 'Brouillon abandonné.' },
		changes: { en: 'Changes discarded.', fr: 'Modifications abandonnées.' }
	},
	/** Heading of the error summary */
	fix: {
		en: (count: number) =>
			count === 1 ? 'Fix 1 problem before saving:' : `Fix ${count} problems before saving:`,
		fr: (count: number) =>
			`Corrigez ${count} ${plural(count, 'problème', 'problèmes')} avant d'enregistrer :`
	},
	basics: { en: 'Basics', fr: "L'essentiel" },
	titlePlaceholder: {
		en: 'e.g. Senior Software Engineer',
		fr: 'ex. : Ingénieur logiciel senior'
	},
	company: { en: 'Company or school', fr: 'Entreprise ou école' },
	companyPlaceholder: { en: 'e.g. Acme Inc.', fr: 'ex. : Acme SAS' },
	locationPlaceholder: {
		en: 'e.g. Paris, France · Remote',
		fr: 'ex. : Paris, France · Télétravail'
	},
	type: { en: 'Type', fr: 'Type' },
	/** The types of experience, by ExperienceType */
	types: {
		professional: { en: 'Professional', fr: 'Professionnelle' },
		personal: { en: 'Personal', fr: 'Personnelle' },
		educational: { en: 'Education', fr: 'Formation' },
		leisure: { en: 'Leisure', fr: 'Loisirs' }
	},
	/** `period`: the months the projects cover ('Mar 2021 – Jun 2024') */
	projectsPeriod: {
		en: (period: string) => `Left empty, the period of the projects is shown: ${period}.`,
		fr: (period: string) => `Laissée vide, la période affichée est celle des projets : ${period}.`
	},
	summaryPlaceholder: {
		en: 'Your role, the context and what you achieved.',
		fr: 'Votre rôle, le contexte et ce que vous avez accompli.'
	},
	projectsHint: {
		en: 'Missions, products or courses of this experience, each with its own skills.',
		fr: 'Missions, produits ou cours de cette expérience, chacun avec ses propres compétences.'
	},
	addProject: { en: 'Add project', fr: 'Ajouter un projet' },
	/** `name`: the project's */
	moved: {
		en: (name: string, position: number, count: number) =>
			`Moved “${name}” to position ${position} of ${count}.`,
		fr: (name: string, position: number, count: number) =>
			`« ${name} » déplacé en position ${position} sur ${count}.`
	},
	removed: {
		en: (name: string) => `Removed “${name}”.`,
		fr: (name: string) => `« ${name} » retiré.`
	},
	restoredProject: {
		en: (name: string) => `Restored “${name}”.`,
		fr: (name: string) => `« ${name} » rétabli.`
	},
	undo: { en: 'Undo', fr: 'Annuler' },
	dismiss: { en: 'Dismiss', fr: 'Masquer' },
	confirm: {
		close: { en: 'Discard your changes?', fr: 'Abandonner vos modifications ?' },
		reset: { en: 'Discard this draft?', fr: 'Abandonner ce brouillon ?' },
		/** `title`: the experience's, as it was saved */
		delete: {
			en: (title: string) => `Delete “${title}”? This cannot be undone.`,
			fr: (title: string) => `Supprimer « ${title} » ? Cette action est irréversible.`
		},
		keepEditing: { en: 'Keep editing', fr: 'Continuer à modifier' },
		keepDraft: { en: 'Keep draft', fr: 'Garder le brouillon' }
	},
	addExperience: { en: 'Add experience', fr: "Ajouter l'expérience" },
	saveChanges: { en: 'Save changes', fr: 'Enregistrer' },
	errors: {
		sessionExpired: {
			en: 'Your session expired. Sign in again (your changes are kept), then save. Closing this window keeps them as a draft.',
			fr: 'Votre session a expiré. Reconnectez-vous (vos modifications sont conservées), puis enregistrez. Fermer cette fenêtre les conserve comme brouillon.'
		},
		sessionExpiredDelete: {
			en: 'Your session expired. Sign in again, then delete the experience.',
			fr: "Votre session a expiré. Reconnectez-vous, puis supprimez l'expérience."
		},
		network: {
			en: 'Could not reach the server. Check your connection and try again.',
			fr: 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.'
		},
		notOwner: {
			en: 'Only the owner of this portfolio can change it.',
			fr: 'Seul le propriétaire de ce portfolio peut le modifier.'
		},
		gone: {
			en: 'This experience no longer exists: it may have been deleted in another tab.',
			fr: "Cette expérience n'existe plus : elle a peut-être été supprimée dans un autre onglet."
		},
		noPortfolio: {
			en: 'Claim a portfolio before adding experiences.',
			fr: "Réservez l'adresse de votre portfolio avant d'ajouter des expériences."
		},
		tooLarge: {
			en: 'This experience is too large. Use a smaller logo or shorter texts.',
			fr: 'Cette expérience est trop volumineuse. Utilisez un logo plus petit ou des textes plus courts.'
		},
		invalid: {
			en: 'Some fields are invalid. Check them and try again.',
			fr: 'Certains champs sont invalides. Vérifiez-les et réessayez.'
		},
		saveFailed: {
			en: 'Could not save the experience. Try again in a moment.',
			fr: "Impossible d'enregistrer l'expérience. Réessayez dans un instant."
		},
		deleteFailed: {
			en: 'Could not delete the experience. Try again in a moment.',
			fr: "Impossible de supprimer l'expérience. Réessayez dans un instant."
		}
	}
});
