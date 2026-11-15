// Texts the two pages of the job editor share (/recruiter/jobs/new, /recruiter/jobs/:id/edit):
// the way back and the notices shown in place of the editor. What each page says alone is in
// its own page.messages.ts.
import { defineMessages } from 'portfolio-common';

export const editorPages = defineMessages({
	/** The link back to the recruiter space */
	jobDescriptions: { en: 'Job descriptions', fr: "Offres d'emploi" },

	/** Signed out: the notice's title */
	signInTitle: { en: 'Sign in as a recruiter', fr: 'Connectez-vous en tant que recruteur' },
	/** Signed out: the notice's link to the recruiter space */
	signIn: { en: 'Sign in as a recruiter', fr: 'Se connecter comme recruteur' },

	/** An account without a recruiter space */
	noSpaceTitle: {
		en: 'Create your recruiter space first',
		fr: "Créez d'abord votre espace recruteur"
	},
	noSpace: {
		en: 'Your account has no recruiter space yet. Create it to write job descriptions.',
		fr: "Votre compte n'a pas encore d'espace recruteur. Créez-le pour rédiger des offres d'emploi."
	},
	openRecruiterSpace: { en: 'Open the recruiter space', fr: "Ouvrir l'espace recruteur" }
});
