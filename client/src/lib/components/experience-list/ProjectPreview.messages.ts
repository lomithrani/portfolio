import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** Name of a project's list of skill tags */
	skills: { en: 'Skills', fr: 'Compétences' },
	/** Name of the list of projects (those using the skill, or those of the experience) */
	projects: { en: 'Projects', fr: 'Projets' },
	/** Under a skill's small timeline: its projects that cannot be placed, by name */
	withoutDates: {
		en: (names: string[]) => `Without dates: ${names.join(', ')}`,
		fr: (names: string[]) => `Sans dates : ${names.join(', ')}`
	}
});
