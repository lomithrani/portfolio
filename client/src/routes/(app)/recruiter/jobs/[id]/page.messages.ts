import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** `title`: the posting's */
	pageTitle: {
		en: (title: string) => `${title} | Recruiter`,
		fr: (title: string) => `${title} | Recruteur`
	},
	/** In the page title until the posting is loaded */
	jobDescription: { en: 'Job description', fr: "Offre d'emploi" },
	/** The link back to the dashboard */
	yourJobs: { en: 'Your job descriptions', fr: "Vos offres d'emploi" },

	/** Under the company (`day`: '3 Nov 2026', shown as a <time>) */
	updated: {
		en: (day: string) => `Updated <time>${day}</time>`,
		fr: (day: string) => `Mise à jour le <time>${day}</time>`
	},
	created: {
		en: (day: string) => `Created <time>${day}</time>`,
		fr: (day: string) => `Créée le <time>${day}</time>`
	},
	published: {
		en: (day: string) => `Published <time>${day}</time>`,
		fr: (day: string) => `Publiée le <time>${day}</time>`
	},
	/** Small screens: the link to the management panel, with the number of applicants */
	manageLink: {
		en: (applicants: number) => `Status, public page and applicants (${applicants})`,
		fr: (applicants: number) => `Statut, page publique et candidats (${applicants})`
	},
	/** Name of the management panel */
	manage: { en: 'Manage this job description', fr: "Gérer cette offre d'emploi" },

	statusFailed: {
		en: 'Could not change the status. Try again in a moment.',
		fr: 'Impossible de changer le statut. Réessayez dans un instant.'
	},

	publicPage: {
		title: { en: 'Public page', fr: 'Page publique' },
		whenOpen: {
			en: 'Share this address: candidates read the job description there and apply with their portfolio.',
			fr: "Partagez cette adresse : les candidats y lisent l'offre d'emploi et postulent avec leur portfolio."
		},
		whenNotOpen: {
			en: 'Anyone with this address can read the job description, but cannot apply.',
			fr: "Toute personne ayant cette adresse peut lire l'offre d'emploi, mais ne peut pas postuler."
		},
		whenDraft: {
			en: 'Drafts have no public page. Change the status to Open to publish it and take applications.',
			fr: "Les brouillons n'ont pas de page publique. Passez le statut à « Ouverte » pour publier l'offre et recevoir des candidatures."
		},
		address: { en: 'Address of the public page', fr: 'Adresse de la page publique' },
		copyLink: { en: 'Copy link', fr: 'Copier le lien' },
		copied: { en: 'Copied', fr: 'Copié' },
		/** Read by screen readers once copied */
		linkCopied: { en: 'Link copied.', fr: 'Lien copié.' },
		copyFailed: { en: 'Could not copy the link', fr: 'Impossible de copier le lien' },
		copyFailedDescription: {
			en: 'Select the address and copy it.',
			fr: "Sélectionnez l'adresse et copiez-la."
		},
		open: { en: 'Open', fr: 'Ouvrir' },
		/** After "Open", for screen readers */
		openSuffix: { en: 'the public page (new tab)', fr: 'la page publique (nouvel onglet)' }
	},

	applicants: {
		title: { en: 'Applicants', fr: 'Candidats' },
		/** Before the number of applicants, for screen readers */
		count: { en: 'Count:', fr: 'Nombre :' },
		/** No applicant, on an open posting */
		noneOpen: {
			en: 'No applicants yet. Candidates apply from the public page with their portfolio. You can also add a portfolio you found.',
			fr: 'Aucun candidat pour le moment. Les candidats postulent depuis la page publique avec leur portfolio. Vous pouvez aussi ajouter un portfolio que vous avez trouvé.'
		},
		/** No applicant, on a posting that takes no applications */
		noneNotOpen: {
			en: 'No applicants yet. Candidates can apply once the job description is Open. You can also add a portfolio you found.',
			fr: "Aucun candidat pour le moment. Les candidats pourront postuler une fois l'offre d'emploi au statut « Ouverte ». Vous pouvez aussi ajouter un portfolio que vous avez trouvé."
		},
		/** Toasts (`name`: how the applicant is listed) */
		added: {
			en: (name: string) => `${name} added to the applicants`,
			fr: (name: string) => `${name} figure désormais parmi les candidats`
		},
		removed: {
			en: (name: string) => `${name} removed from the applicants`,
			fr: (name: string) => `${name} ne figure plus parmi les candidats`
		},
		/** The confirmation before a removal */
		removeTitle: {
			en: (name: string) => `Remove ${name}?`,
			fr: (name: string) => `Retirer ${name} ?`
		},
		removing: { en: 'Removing…', fr: 'Retrait…' },
		removeFailed: {
			en: 'Could not remove this applicant. Try again in a moment.',
			fr: 'Impossible de retirer ce candidat. Réessayez dans un instant.'
		}
	},

	/** What the page says instead of the posting */
	signedOut: {
		title: { en: 'Sign in as a recruiter', fr: 'Connectez-vous en tant que recruteur' },
		text: {
			en: 'Sign in to see this job description and its applicants.',
			fr: "Connectez-vous pour voir cette offre d'emploi et ses candidats."
		},
		action: { en: 'Sign in as a recruiter', fr: 'Se connecter en tant que recruteur' }
	},
	noSpace: {
		title: { en: 'Create your recruiter space first', fr: "Créez d'abord votre espace recruteur" },
		text: {
			en: 'Your account has no recruiter space yet. Create it to write job descriptions.',
			fr: "Votre compte n'a pas encore d'espace recruteur. Créez-le pour rédiger des offres d'emploi."
		},
		action: { en: 'Open the recruiter space', fr: "Ouvrir l'espace recruteur" }
	},
	notFound: {
		title: { en: 'Job description not found', fr: "Offre d'emploi introuvable" },
		text: {
			en: 'It may have been deleted, or it belongs to another recruiter account. Your job descriptions are listed in your recruiter space.',
			fr: "Elle a peut-être été supprimée, ou elle appartient à un autre compte recruteur. Vos offres d'emploi sont listées dans votre espace recruteur."
		}
	},
	loadFailed: {
		en: 'Could not load this job description',
		fr: "Impossible de charger cette offre d'emploi"
	},
	backToJobs: { en: 'Back to your job descriptions', fr: "Retour à vos offres d'emploi" }
});
