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
	}
});
