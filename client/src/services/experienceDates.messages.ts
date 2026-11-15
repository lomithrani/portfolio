import { defineMessages, plural } from 'portfolio-common';

/** The parts of a duration that count (a year count of 0 is left out), one space apart */
const parts = (...texts: string[]) => texts.filter(Boolean).join(' ');

export const m = defineMessages({
	/** 'Mar 2024 – Jun 2025': from a month to another */
	range: {
		en: (from: string, to: string) => `${from} – ${to}`,
		fr: (from: string, to: string) => `${from} – ${to}`
	},
	/** 'Mar 2024 – Present': from a month, and still going */
	ongoing: {
		en: (from: string) => `${from} – Present`,
		fr: (from: string) => `${from} – aujourd'hui`
	},
	/** '2 yrs 3 mos', '8 mos', '1 yr': a duration, short (French has no shorter words) */
	duration: {
		en: (years: number, months: number) =>
			parts(
				years ? `${years} ${plural(years, 'yr', 'yrs')}` : '',
				months ? `${months} ${plural(months, 'mo', 'mos')}` : ''
			),
		fr: (years: number, months: number) =>
			parts(years ? `${years} ${plural(years, 'an', 'ans')}` : '', months ? `${months} mois` : '')
	},
	/** '5 years 2 months', '1 year', '3 months': a duration, in full words */
	monthCount: {
		en: (years: number, months: number) =>
			parts(
				years ? `${years} ${plural(years, 'year', 'years')}` : '',
				months ? `${months} ${plural(months, 'month', 'months')}` : ''
			),
		fr: (years: number, months: number) =>
			parts(years ? `${years} ${plural(years, 'an', 'ans')}` : '', months ? `${months} mois` : '')
	}
});
