import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	/** The page's <title> and description, with the name the portfolio is headed with */
	title: {
		en: (owner: string) => `${owner} | Resume`,
		fr: (owner: string) => `${owner} | CV`
	},
	description: {
		en: (owner: string) =>
			`${owner}: professional experiences, personal and educational projects and courses.`,
		fr: (owner: string) =>
			`${owner} : expériences professionnelles, projets personnels, formations et cours.`
	},
	/**
	 * The floating corner's link to the page for recruiters (/hire): one line next to the view
	 * switch at 390 px. Neutral: having a portfolio says nothing about looking for a job
	 */
	proposeRole: { en: 'Propose a role', fr: 'Proposer un poste' },
	/** The owner's heading above their buttons */
	heading: { en: 'Experiences', fr: 'Expériences' },
	/** The owner's link to the admin's "Get started" while its checklist is not complete */
	/** The owner's link to the admin's "Get started", with how far its checklist is */
	setup: {
		en: (done: number, total: number) => `Get ready to share your link (${done} of ${total})`,
		fr: (done: number, total: number) =>
			`Préparez-vous à partager votre lien (${done} sur ${total})`
	},
	/**
	 * The owner's "Add experience" button. In the floating corner it is short to fit the row: the
	 * passage marked `hidden` is only read by screen readers (the button's name stays "Add
	 * experience"). The owner's toolbar hides that passage on French phones only
	 */
	addExperienceShort: {
		en: 'Add <hidden>experience</hidden>',
		fr: 'Ajouter <hidden>une expérience</hidden>'
	},
	/** The owner's page before their first experience */
	emptyOwner: {
		title: {
			en: 'Your portfolio has no experiences yet',
			fr: "Votre portfolio n'a pas encore d'expérience"
		},
		text: {
			en: 'Add your jobs, studies and projects. Visitors see them here, the most recent first.',
			fr: 'Ajoutez vos emplois, vos études et vos projets. Les visiteurs les voient ici, les plus récents en premier.'
		},
		add: { en: 'Add your first experience', fr: 'Ajouter votre première expérience' }
	},
	/** A visitor's page of a portfolio without experiences */
	emptyVisitor: {
		title: {
			en: 'No experiences have been published yet.',
			fr: "Aucune expérience n'a encore été publiée."
		},
		text: {
			en: 'This portfolio is still being written. Have a project in mind? Let’s talk.',
			fr: 'Ce portfolio est en cours de rédaction. Un projet en tête ? Parlons-en.'
		},
		contact: { en: 'Get in touch', fr: 'Prendre contact' }
	},
	/** The list when the filters keep nothing */
	noMatch: {
		en: 'No experience matches these filters.',
		fr: 'Aucune expérience ne correspond à ces filtres.'
	},
	clearFilters: { en: 'Clear filters', fr: 'Effacer les filtres' },
	/** The owner's résumé import */
	resumeImport: {
		/** Its button; the passage marked `wide` is left out on phones, next to "Add experience" */
		open: {
			en: 'Import <wide>from</wide> résumé',
			fr: 'Importer <wide>depuis</wide> un CV'
		},
		/** The same button while a review of drafts is kept */
		resume: { en: 'Continue import', fr: "Reprendre l'import" },
		/** Toast of a page opened to import (`?import=1`) when it cannot */
		unavailable: {
			en: 'Résumé import is not available right now',
			fr: "L'import de CV n'est pas disponible pour le moment"
		},
		/** Its description when this month's imports are used */
		usedUp: {
			en: 'You used this month’s imports. Add your experiences by hand for now.',
			fr: "Vous avez utilisé les imports de ce mois-ci. Ajoutez vos expériences à la main pour l'instant."
		},
		/** Its description when the import is off */
		off: { en: 'Add your experiences by hand.', fr: 'Ajoutez vos expériences à la main.' }
	},
	/** Toasts of what the owner just saved */
	toasts: {
		/** One experience was added, or several by the résumé import */
		added: {
			en: (count: number) => plural(count, 'Experience added', `${count} experiences added`),
			fr: (count: number) => plural(count, 'Expérience ajoutée', `${count} expériences ajoutées`)
		},
		saved: { en: 'Changes saved', fr: 'Modifications enregistrées' },
		deleted: { en: 'Experience deleted', fr: 'Expérience supprimée' },
		/** What was saved is not in the list: the filters leave it out */
		hidden: {
			en: (count: number) =>
				plural(count, 'The current filters hide it.', 'The current filters hide them.'),
			fr: (count: number) =>
				plural(
					count,
					'Les filtres actuels masquent cette expérience.',
					'Les filtres actuels masquent ces expériences.'
				)
		},
		/** The toast's button: clears the filters and scrolls to what was saved */
		show: { en: 'Show it', fr: 'Afficher' }
	}
});
