import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	/** Name of the filters' region */
	filterExperiences: { en: 'Filter experiences', fr: 'Filtrer les expériences' },
	/** Small screens: the button that shows the skills, with how many are selected (none: 0) */
	filterSkills: {
		en: (selected: number) => (selected > 0 ? `Filter skills\u00a0(${selected})` : 'Filter skills'),
		fr: (selected: number) =>
			selected > 0 ? `Filtrer par compétence\u00a0(${selected})` : 'Filtrer par compétence'
	},
	/** Name of the group of skill tags */
	skills: { en: 'Skills', fr: 'Compétences' },
	searchSkills: { en: 'Search skills', fr: 'Rechercher une compétence' },
	/** The two kinds of skills, above their tags (shown on small screens) */
	kinds: {
		hard: { en: 'Technical', fr: 'Techniques' },
		soft: { en: 'Soft', fr: 'Savoir-être' }
	},
	/** The search box narrowed the skills down to none */
	noSkillMatches: {
		en: (query: string) => `No skill matches “${query}”.`,
		fr: (query: string) => `Aucune compétence ne correspond à « ${query} ».`
	},
	/** How many experiences there are */
	count: {
		en: (total: number) => `${total} ${plural(total, 'experience', 'experiences')}`,
		fr: (total: number) => `${total} ${plural(total, 'expérience', 'expériences')}`
	},
	/** How many of them the filters keep */
	countOf: {
		en: (kept: number, total: number) =>
			`${kept} of ${total} ${plural(total, 'experience', 'experiences')}`,
		fr: (kept: number, total: number) =>
			`${kept} sur ${total} ${plural(total, 'expérience', 'expériences')}`
	},
	/** Name of the list of the selected skills' tags */
	selectedSkills: { en: 'Selected skills', fr: 'Compétences sélectionnées' },
	/** Name of a selected skill's tag: pressing it removes the skill from the filters */
	removeFilter: {
		en: (skill: string) => `Remove ${skill} filter`,
		fr: (skill: string) => `Retirer le filtre ${skill}`
	},
	clearFilters: { en: 'Clear filters', fr: 'Effacer les filtres' }
});
