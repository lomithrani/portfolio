import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** Name of the list */
	label: { en: 'Applicants', fr: 'Candidats' },
	/** After the portfolio's name in its link, for screen readers (`name`: the applicant) */
	portfolioOf: {
		en: (name: string) => `(portfolio of ${name}, opens in a new tab)`,
		fr: (name: string) => `(portfolio : ${name}, s'ouvre dans un nouvel onglet)`
	}
});
