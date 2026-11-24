import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	/** Name of the filters' region */
	filterExperiences: { en: 'Filter experiences', fr: 'Filtrer les expériences' },
	/** Name of the group of skill tags */
	skills: { en: 'Skills', fr: 'Compétences' },
	/**
	 * The two rows of the panel before it is expanded: the technical skills used the longest, then
	 * the soft skills used the longest
	 */
	rows: {
		hard: { en: 'Most used', fr: 'Les plus utilisées' },
		soft: { en: 'Soft skills', fr: 'Savoir-être' }
	},
	/** The button that shows every skill of the page in place, with how many there are */
	allSkills: {
		en: (count: number) => `All ${count} ${plural(count, 'skill', 'skills')}`,
		fr: (count: number) =>
			count > 1
				? `Les ${count} compétences`
				: `${count} ${plural(count, 'compétence', 'compétences')}`
	},
	/** The same button once they all show: back to the most used ones */
	showLess: { en: 'Show less', fr: 'Voir moins' },
	/** Name of the search box above every skill */
	searchSkills: { en: 'Search skills', fr: 'Rechercher une compétence' },
	/** What the empty search box reads, with how many skills it searches */
	searchPlaceholder: {
		en: (count: number) => `Search ${count} ${plural(count, 'skill', 'skills')}`,
		fr: (count: number) => `Rechercher parmi ${count} ${plural(count, 'compétence', 'compétences')}`
	},
	/** Next to the search box: the order of the skills in each group */
	sortedByTime: { en: 'Sorted by time used', fr: "Triées par durée d'utilisation" },
	/**
	 * The two kinds of skills, naming their lists for screen readers when no skill of the page has
	 * a category (the categories head the lists otherwise)
	 */
	kinds: {
		hard: { en: 'Technical', fr: 'Techniques' },
		soft: { en: 'Soft', fr: 'Savoir-être' }
	},
	/** Name of the list that draws a skill with the skills that are part of it ('.NET' and '.NET Core') */
	family: {
		en: (skill: string) => `${skill} and the skills that are part of it`,
		fr: (skill: string) => `${skill} et les compétences qui en font partie`
	},
	/**
	 * What a skill's tag says beside its name, in full, for screen readers: how long it was used
	 * ('9 years 3 months', '' when not known), and how many skills are part of it (0: none)
	 */
	skillDetails: {
		en: (time: string, parts: number) => {
			const counted = `${parts} ${plural(parts, 'skill that is', 'skills that are')} part of it`;
			if (!time) return parts ? `Counts ${counted}` : '';
			return parts ? `Used for ${time}, counting ${counted}` : `Used for ${time}`;
		},
		fr: (time: string, parts: number) => {
			const counted = `${parts} ${plural(parts, 'compétence qui en fait', 'compétences qui en font')} partie`;
			if (!time) return parts ? `Compte ${counted}` : '';
			return parts
				? `Utilisée pendant ${time}, en comptant ${counted}`
				: `Utilisée pendant ${time}`;
		}
	},
	/** The search box narrowed the skills down to none */
	noSkillMatches: {
		en: (query: string) => `No skill matches “${query}”.`,
		fr: (query: string) => `Aucune compétence ne correspond à « ${query} ».`
	},
	/** Said to screen readers while the search box holds a text: how many skills it leaves */
	skillsFound: {
		en: (count: number) => `${count} ${plural(count, 'skill', 'skills')} found`,
		fr: (count: number) => `${count} ${plural(count, 'compétence trouvée', 'compétences trouvées')}`
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
	/** Next to that count: the skills the experiences are filtered by, by name */
	filteredBy: {
		en: (names: string[]) => `Filtered by ${names.join(', ')}`,
		fr: (names: string[]) => `Filtre : ${names.join(', ')}`
	},
	clearFilters: { en: 'Clear filters', fr: 'Effacer les filtres' }
});
