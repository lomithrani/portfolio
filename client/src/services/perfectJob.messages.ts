import { defineMessages, plural } from 'portfolio-common';

/** 'a', 'a and b', 'a, b and c' */
const listed = (items: readonly string[], and: string): string =>
	items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1)}`;

/** A label inside a French sentence: no capital, unless it starts with an acronym (RTT, CDI) */
const insideSentence = (label: string): string =>
	/^\p{Lu}{2}/u.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);

export const m = defineMessages({
	duration: {
		minutes: {
			en: (count: number) => `${count} ${plural(count, 'minute', 'minutes')}`,
			fr: (count: number) => `${count} ${plural(count, 'minute', 'minutes')}`
		},
		hours: {
			en: (count: number) => `${count} ${plural(count, 'hour', 'hours')}`,
			fr: (count: number) => `${count} ${plural(count, 'heure', 'heures')}`
		},
		/** `minutes` in two digits: '2 h 30' */
		hoursAndMinutes: {
			en: (hours: number, minutes: string) => `${hours} h ${minutes}`,
			fr: (hours: number, minutes: string) => `${hours} h ${minutes}`
		}
	},
	/** How long the way can be, one way: going to the office every day, or once a week */
	commuteBudget: {
		en: (everyDay: string, onceAWeek: string) =>
			`That is ${everyDay} each way for a job at the office every day, or ${onceAWeek} each way for a job you go to once a week.`,
		fr: (everyDay: string, onceAWeek: string) =>
			`Soit ${everyDay} par trajet pour un poste au bureau tous les jours, ou ${onceAWeek} par trajet pour un poste où vous allez une fois par semaine.`
	},
	summary: {
		none: {
			en: 'No criterion yet: nothing is asked of a job, so every job scores 100.',
			fr: "Aucun critère pour l'instant : rien n'est demandé à une offre, donc toutes obtiennent 100."
		},
		/** `labels`: the criteria's names as portfolio-common gives them, the ones that matter most first */
		scoredOn: {
			en: (labels: readonly string[]) => {
				const count = labels.length === 1 ? 'one criterion' : `${labels.length} criteria`;
				const names = labels.map((label) => label.toLowerCase());
				return `A job is scored on ${count}: ${listed(names, 'and')}.`;
			},
			fr: (labels: readonly string[]) => {
				const count = labels.length === 1 ? 'un critère' : `${labels.length} critères`;
				return `Une offre est notée sur ${count} : ${listed(labels.map(insideSentence), 'et')}.`;
			}
		},
		/** Follows `scoredOn` when at least one criterion is a deal-breaker */
		dealBreakers: {
			en: (count: number) =>
				count === 1 ? 'One of them is a deal-breaker.' : `${count} of them are deal-breakers.`,
			fr: (count: number) =>
				count === 1 ? "L'un d'eux est éliminatoire." : `${count} d'entre eux sont éliminatoires.`
		}
	}
});
