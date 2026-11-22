import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	/** After the name of a project that uses a skill the list is filtered by, for screen readers */
	usesSelectedSkills: {
		en: '(uses the selected skills)',
		fr: '(utilise les compétences sélectionnées)'
	},
	/** Names of a project's two lists of skill tags */
	technicalSkills: { en: 'Technical skills', fr: 'Compétences techniques' },
	softSkills: { en: 'Soft skills', fr: 'Savoir-être' },
	/**
	 * Name of the "+8" button after a project's first tags: pressing it shows the tags it stands
	 * for, in place
	 */
	showMoreSkills: {
		en: (count: number) => `Show ${count} more ${plural(count, 'skill', 'skills')}`,
		fr: (count: number) => `Afficher ${count} ${plural(count, 'compétence', 'compétences')} de plus`
	},
	/** The same button once they show: pressing it folds them again */
	fewerSkills: { en: 'Fewer skills', fr: 'Moins de compétences' }
});
