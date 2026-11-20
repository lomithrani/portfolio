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
	 * alone, open to anyone, signed out too; an owner's can ask for a note to be read, a job, a score
	 * first. So no step is named or counted, and nothing is said that a journey may not ask (a
	 * sign-in, a job, a score): only that its steps, one or several, open one after the other
	 * (openWorkflowSteps). Neutral too: anyone sees the picture where the link is posted (a LinkedIn
	 * feed, a chat), and having a portfolio says nothing about looking for a job, so it never calls
	 * the owner a candidate
	 */
	hire: {
		headline: {
			en: 'A page for recruiters.',
			fr: 'Une page recruteurs.'
		},
		accent: {
			en: 'Propose a role, step by step.',
			fr: 'Proposez un poste, étape par étape.'
		},
		/** The steps drawn under the headline: the first open, the next ones faded (there may be none) */
		step: {
			en: (number: number) => `Step ${number}`,
			fr: (number: number) => `Étape ${number}`
		},
		side: {
			en: ['One step or several', 'Each one opens in turn'],
			fr: ['Une étape ou plusieurs', "Chacune s'ouvre à son tour"]
		},
		alt: {
			en: 'A page for recruiters: propose a role, step by step. One step or several, each one opening in turn.',
			fr: "Une page recruteurs : proposez un poste, étape par étape. Une étape ou plusieurs, chacune s'ouvre à son tour."
		}
	}
});
