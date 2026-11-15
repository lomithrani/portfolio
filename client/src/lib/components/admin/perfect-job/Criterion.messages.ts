import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	importance: { en: 'How much it matters', fr: 'Son importance' },
	/** Name of an importance button: its level and what the level means */
	level: {
		en: (level: number, label: string) => `${level}: ${label}`,
		fr: (level: number, label: string) => `${level} : ${label}`
	},
	/** What the importance picked means, and the share of the score it gives the criterion */
	share: {
		en: (label: string, share: number) => `${label} · counts for ${share}% of the score`,
		fr: (label: string, share: number) => `${label} · compte pour ${share} % de la note`
	},
	dealBreaker: { en: 'Deal-breaker', fr: 'Critère éliminatoire' },
	dealBreakerHelp: {
		en: 'A job that does not match it at all scores 0, whatever the rest.',
		fr: "Une offre qui n'y correspond pas du tout obtient 0, quel que soit le reste."
	}
});
