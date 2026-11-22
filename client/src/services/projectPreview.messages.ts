import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	/**
	 * Caption of a skill's preview: how many projects use it, and for how long in all
	 * ('5 years 2 months', see formatMonthCount; '' when none of them can be placed)
	 */
	usedIn: {
		en: (count: number, time: string) => {
			const used = `Used in ${count} ${plural(count, 'project', 'projects')}`;
			return time ? `${used} (${time})` : used;
		},
		fr: (count: number, time: string) => {
			const used = `Utilisée dans ${count} ${plural(count, 'projet', 'projets')}`;
			return time ? `${used} (${time})` : used;
		}
	},
	/**
	 * Under the caption of a skill that others are part of ('.NET'): its projects and its time are
	 * theirs too, by name
	 */
	countsFamily: {
		en: (names: string[]) => `Counts the skills that are part of it: ${names.join(', ')}`,
		fr: (names: string[]) => `Compte les compétences qui en font partie : ${names.join(', ')}`
	}
});
