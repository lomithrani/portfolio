// /recruiter for a visitor who is not signed in: what the recruiter space is for. It sells the
// value of skills: on a portfolio a skill comes with the projects it was used in and their
// length (the experiences page's filters, previews and timeline). Keep the copy to what the code
// does: there is no search of portfolios by skill.
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	title: {
		en: 'Find talent with exactly the skills you need',
		fr: 'Trouvez des talents qui ont exactement les compétences recherchées'
	},
	lead: {
		en: 'On Portfolio, a skill is not a keyword: it comes with the projects it was used in, and for how long. Publish your job, and meet the people it matches.',
		fr: "Sur Portfolio, une compétence n'est pas un mot-clé : elle vient avec les projets où elle a servi, et leur durée. Publiez votre offre, et rencontrez les personnes à qui elle correspond."
	},
	free: {
		en: 'Free to use. The same Google account can also hold your own portfolio, as a candidate: switch spaces from the account menu.',
		fr: "Gratuit. Avec le même compte Google, vous pouvez aussi avoir votre propre portfolio de candidat : changez d'espace depuis le menu du compte."
	},
	welcome: {
		title: { en: 'Welcome to your recruiter space', fr: 'Bienvenue dans votre espace recruteur' },
		description: {
			en: 'Write your first job description.',
			fr: "Rédigez votre première offre d'emploi."
		}
	},
	/** What a portfolio says about a skill: the heart of the page */
	skills: {
		title: {
			en: 'Skills you can check, not just read',
			fr: 'Des compétences à vérifier, pas seulement à lire'
		},
		where: {
			title: { en: 'Where it was used', fr: 'Où elle a servi' },
			text: {
				en: "Pick a skill on a candidate's portfolio: the projects that used it stand out, each with its company and its dates.",
				fr: "Choisissez une compétence sur le portfolio d'un candidat : les projets qui y ont fait appel ressortent, chacun avec son entreprise et ses dates."
			}
		},
		howLong: {
			title: { en: 'For how long', fr: 'Pendant combien de temps' },
			text: {
				en: 'The time those projects add up to, month by month: “Used in 5 projects (5 years 3 months)”.',
				fr: 'La durée cumulée de ces projets, mois par mois : « Utilisée dans 5 projets (5 ans 3 mois) ».'
			}
		},
		when: {
			title: { en: 'How recently', fr: 'À quand elle remonte' },
			text: {
				en: "Switch to the timeline: a skill from last year's project and one from ten years ago do not look the same.",
				fr: "Passez à la frise chronologique : une compétence utilisée l'an dernier et une autre d'il y a dix ans ne se ressemblent pas."
			}
		},
		example: {
			en: 'See it on <example>an example</example>.',
			fr: 'Voyez-le sur <example>un exemple</example>.'
		}
	},
	features: {
		job: {
			title: { en: 'Say exactly what you need', fr: 'Dites exactement ce que vous cherchez' },
			text: {
				en: 'Skills, contract, working time, pay range, remote days: the facts candidates look for, and the ones their portfolio checks your job against.',
				fr: 'Compétences, contrat, temps de travail, fourchette de rémunération, télétravail : ce que les candidats regardent, et ce à quoi leur portfolio compare votre offre.'
			}
		},
		match: {
			title: { en: 'A match before the meeting', fr: 'Une correspondance avant le rendez-vous' },
			text: {
				en: "Share your job on a candidate's Hire page and see how it scores against what they want. When it matches, book a meeting in their calendar: no call that ends on pay or commute.",
				fr: "Partagez votre offre sur la page Recruter d'un candidat et voyez sa note au regard de ce qu'il recherche. Si elle correspond, réservez un rendez-vous dans son agenda : aucun appel qui s'arrête sur la rémunération ou le trajet."
			}
		},
		applicants: {
			title: {
				en: 'Meet candidates through their portfolio',
				fr: 'Rencontrez les candidats par leur portfolio'
			},
			text: {
				en: 'See who applies, open their portfolio, and add the candidates you found yourself.',
				fr: 'Voyez qui postule, ouvrez leur portfolio, et ajoutez les candidats que vous avez trouvés vous-même.'
			}
		},
		pdf: {
			title: { en: 'Start from a PDF', fr: "Partez d'un PDF" },
			text: {
				en: (imports: number) =>
					`Where PDF import is offered, Claude drafts the job description from your file for you to complete. The free plan includes ${imports} imports.`,
				fr: (imports: number) =>
					`Lorsque l'import de PDF est proposé, Claude rédige à partir de votre fichier un brouillon de l'offre, que vous complétez. La formule gratuite comprend ${imports} imports.`
			}
		}
	},
	browse: { en: 'Browse open jobs', fr: 'Parcourir les offres ouvertes' }
});
