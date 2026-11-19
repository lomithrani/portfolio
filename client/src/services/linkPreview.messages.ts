// The pictures of a shared link's preview (linkPreview.ts): what each one says, drawn by
// client/scripts/og-image/render.mjs into client/static/og-portfolio(-fr).png and
// og-hire(-fr).png, and its alternative text (og:image:alt), which says the same. The same picture
// for every portfolio, so every word must be true of any of them: the preview's title and
// description carry the portfolio's own words. Render the pictures again when a text changes.
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** A portfolio's experiences page: what a skill shows there (the filters, previews, timeline) */
	portfolio: {
		headline: {
			en: 'Skills you can check, not just read.',
			fr: 'Des compétences à vérifier, pas seulement à lire.'
		},
		accent: {
			en: 'Each with the projects it was used in, and for how long.',
			fr: 'Chacune avec les projets où elle a servi, et leur durée.'
		},
		/** Short lines beside the timeline drawn under the headline */
		side: {
			en: ['Experiences · Projects · Skills', 'As a list or a timeline'],
			fr: ['Expériences · Projets · Compétences', 'En liste ou en frise']
		},
		alt: {
			en: 'Skills you can check, not just read: each with the projects it was used in, and for how long. Experiences, projects and skills, as a list or a timeline.',
			fr: 'Des compétences à vérifier, pas seulement à lire : chacune avec les projets où elle a servi, et leur durée. Expériences, projets et compétences, en liste ou en frise.'
		}
	},
	/**
	 * A portfolio's page for recruiters (/hire), whatever its journey: the default one is a meeting
	 * alone, an owner's can ask for a job first, or have no step at all. So no step is named and no
	 * meeting promised: steps open one after the other (openWorkflowSteps), and submitting one or
	 * booking needs a Google sign-in
	 */
	hire: {
		headline: {
			en: "A candidate's page for recruiters.",
			fr: "La page recruteurs d'un candidat."
		},
		accent: {
			en: 'Propose a role by following their steps.',
			fr: 'Proposez un poste en suivant ses étapes.'
		},
		/** The steps drawn under the headline: the first done, the second open, the third locked */
		step: {
			en: (number: number) => `Step ${number}`,
			fr: (number: number) => `Étape ${number}`
		},
		side: {
			en: ['Each step opens in turn', 'Sign in with Google'],
			fr: ["Chaque étape s'ouvre à son tour", 'Connexion avec Google']
		},
		alt: {
			en: "A candidate's page for recruiters: propose a role by following their steps. Each step opens in turn; sign in with Google.",
			fr: "La page recruteurs d'un candidat : proposez un poste en suivant ses étapes. Chaque étape s'ouvre à son tour ; connexion avec Google."
		}
	}
});
