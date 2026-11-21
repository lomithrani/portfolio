import { defineMessages, plural } from 'portfolio-common';

// The other jobs of a recruiter, beside the job a reviewer of matching reads (Path 2): in matching
// now, or put into matching lately, with those that are copies of it and the terms they differ in,
// so that a recruiter who probes candidates with copies of a job is told apart from one who posts
// several jobs. Read by the operator's reviewers only.
export const m = defineMessages({
	/** `count`: how many are listed */
	heading: {
		en: (count: number) => `This recruiter’s other jobs (${count})`,
		fr: (count: number) => `Les autres offres de ce recruteur (${count})`
	},
	/**
	 * Backed by: recruitersJobs of server/services/matchingReviews.ts (REVIEW_HISTORY_DAYS,
	 * REVIEW_HISTORY_JOBS; only the jobs still stored, of that account). What the recruiter asked
	 * for, not what reached candidates: only an approved job is proposed
	 */
	scope: {
		en: (days: number, most: number) =>
			`Of the jobs this recruiter ever asked to propose to candidates: those they ask to propose now, and those created or sent for review in the last ${days} days, the ${most} latest at most. A job deleted, or posted from another account, is not shown.`,
		fr: (days: number, most: number) =>
			`Parmi les offres que ce recruteur a déjà demandé à proposer aux candidats : celles qu'il demande à proposer maintenant, et celles créées ou envoyées en relecture ces ${days} derniers jours, les ${most} plus récentes au plus. Une offre supprimée, ou publiée depuis un autre compte, n'apparaît pas.`
	},
	none: {
		en: 'None: this recruiter asked to propose no other job to candidates lately.',
		fr: "Aucune : ce recruteur n'a demandé à proposer aucune autre offre aux candidats ces derniers temps."
	},
	/** `count`: how many are copies of the job under review */
	copies: {
		en: (count: number) =>
			`${count} ${plural(count, 'of them is a copy', 'of them are copies')} of this job (the same company and title, or the same description). Reject copies that differ in one term, such as the pay or the office.`,
		fr: (count: number) =>
			`${count} d'entre elles ${plural(count, 'est une copie', 'sont des copies')} de cette offre (même entreprise et même intitulé, ou même description). Refusez les copies qui ne diffèrent que d'une condition, comme la rémunération ou le bureau.`
	},
	/** A copy of the job under review */
	copy: { en: 'Copy of this job', fr: 'Copie de cette offre' },
	/** `fields`: differsInText */
	differsIn: {
		en: (fields: string) => `Differs in: ${fields}`,
		fr: (fields: string) => `Diffère par : ${fields}`
	},
	/** A copy with the same terms */
	sameTerms: { en: 'Same terms as this job', fr: 'Mêmes conditions que cette offre' },
	/** `day`: when it was created */
	created: {
		en: (day: string) => `Created on ${day}`,
		fr: (day: string) => `Créée le ${day}`
	},
	/**
	 * Its recruiter's switch, what they ask for (whether reviewed or not: its review follows); never
	 * "Proposed to candidates", the recruiter's word for a job approved and live (docs/I18N.md)
	 */
	inMatching: {
		en: 'Its recruiter asks to propose it to candidates',
		fr: 'Son recruteur demande à la proposer aux candidats'
	},
	notInMatching: {
		en: 'Its recruiter no longer asks to propose it',
		fr: 'Son recruteur ne demande plus à la proposer'
	},
	/** Its review, for screen readers before the label */
	review: { en: 'Review:', fr: 'Relecture :' },
	/** It waits on this page too: a link to it */
	listedHere: { en: 'Waiting on this page', fr: 'En attente sur cette page' },
	/** The link's name for screen readers: its title, and when it was created (copies share a title) */
	listedHereNamed: {
		en: (title: string, day: string) => `Waiting on this page: ${title}, created on ${day}`,
		fr: (title: string, day: string) => `En attente sur cette page : ${title}, créée le ${day}`
	},
	/** The same without a creation day */
	listedHereTitled: {
		en: (title: string) => `Waiting on this page: ${title}`,
		fr: (title: string) => `En attente sur cette page : ${title}`
	}
});
