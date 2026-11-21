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
	 * REVIEW_HISTORY_JOBS; only the jobs still stored, of that account)
	 */
	scope: {
		en: (days: number, most: number) =>
			`Of the jobs this recruiter ever proposed to candidates: those proposed now, and those created or sent for review in the last ${days} days, the ${most} latest at most. A job deleted, or posted from another account, is not shown.`,
		fr: (days: number, most: number) =>
			`Parmi les offres que ce recruteur a déjà proposées aux candidats : celles proposées maintenant, et celles créées ou envoyées en relecture ces ${days} derniers jours, les ${most} plus récentes au plus. Une offre supprimée, ou publiée depuis un autre compte, n'apparaît pas.`
	},
	none: {
		en: 'None: this recruiter proposed no other job to candidates lately.',
		fr: "Aucune : ce recruteur n'a proposé aucune autre offre aux candidats ces derniers temps."
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
	/** Its recruiter's switch (whether reviewed or not: its review follows) */
	inMatching: {
		en: 'Its recruiter proposes it to candidates',
		fr: 'Son recruteur la propose aux candidats'
	},
	notInMatching: {
		en: 'Its recruiter no longer proposes it',
		fr: 'Son recruteur ne la propose plus'
	},
	/** Its review, for screen readers before the label */
	review: { en: 'Review:', fr: 'Relecture :' },
	/** It waits on this page too: a link to it */
	listedHere: { en: 'Waiting on this page', fr: 'En attente sur cette page' }
});
