import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** Name of the timeline's region */
	timeline: { en: 'Timeline', fr: 'Frise chronologique' },
	/**
	 * After the label of an experience's bar, for screen readers: its type (see
	 * experienceTypeLabels) and its months ('Mar 2024 – Present')
	 */
	experienceDetails: {
		en: (type: string, period: string) => `, ${type}, ${period}`,
		fr: (type: string, period: string) => `, ${type}, ${period}`
	},
	/** Name of the list of an experience's project bars */
	projectsOf: {
		en: (title: string) => `Projects of ${title}`,
		fr: (title: string) => `Projets : ${title}`
	},
	/**
	 * After the name of a project's bar, for screen readers: its months ('' when it has none),
	 * and whether it uses a skill the timeline is filtered by
	 */
	projectDetails: {
		en: (period: string, matched: boolean) =>
			`, ${period || 'no dates'}${matched ? ', uses the selected skills' : ''}`,
		fr: (period: string, matched: boolean) =>
			`, ${period || 'sans dates'}${matched ? ', utilise les compétences sélectionnées' : ''}`
	},
	hint: {
		en: 'Select a bar to read about it. Scroll or pinch over the timeline to zoom.',
		fr: 'Sélectionnez une barre pour en savoir plus. Faites défiler ou pincez la frise pour zoomer.'
	},
	/** Name of the group of the two zoom buttons */
	zoom: { en: 'Zoom', fr: 'Zoom' },
	zoomOut: { en: 'Zoom out', fr: 'Zoom arrière' },
	zoomIn: { en: 'Zoom in', fr: 'Zoom avant' },
	/** Name of the legend: the icon and colour of each type of experience drawn */
	typesOfExperience: { en: 'Types of experience', fr: "Types d'expérience" },
	nothingDated: {
		en: 'None of these experiences has dates yet: there is nothing to place on a timeline.',
		fr: "Aucune de ces expériences n'a encore de dates : il n'y a rien à placer sur une frise."
	},
	/** Before the experiences that cannot be placed */
	withoutDates: { en: 'Without dates', fr: 'Sans dates' }
});
