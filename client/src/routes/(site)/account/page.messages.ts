import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	intro: {
		en: 'What this site keeps for your account, the terms you accepted, and how to delete everything.',
		fr: 'Ce que ce site conserve pour votre compte, les conditions que vous avez acceptées, et comment tout supprimer.'
	},
	loading: { en: 'Loading your account', fr: 'Chargement de votre compte' },
	signedOut: {
		title: { en: 'Sign in to see your account', fr: 'Connectez-vous pour voir votre compte' },
		text: {
			en: 'Your account page shows the data kept for your account and the terms you accepted, and lets you delete it. Candidates sign in from the home page, recruiters from the recruiter space.',
			fr: "La page de votre compte montre les données conservées pour votre compte et les conditions que vous avez acceptées, et permet de le supprimer. Les candidats se connectent depuis la page d'accueil, les recruteurs depuis l'espace recruteur."
		},
		candidate: { en: 'Sign in as a candidate', fr: 'Se connecter comme candidat' },
		recruiter: { en: 'Sign in as a recruiter', fr: 'Se connecter comme recruteur' }
	},
	details: {
		title: { en: 'Your account', fr: 'Votre compte' },
		google: {
			en: 'You sign in with your Google account.',
			fr: 'Vous vous connectez avec votre compte Google.'
		},
		name: { en: 'Name', fr: 'Nom' },
		email: { en: 'Email address', fr: 'Adresse e-mail' },
		emailUnknown: { en: 'Not known', fr: 'Inconnue' },
		portfolio: { en: 'Portfolio', fr: 'Portfolio' },
		noPortfolio: { en: 'None yet.', fr: 'Aucun pour le moment.' },
		createPortfolio: { en: 'Create your portfolio', fr: 'Créer votre portfolio' },
		recruiterSpace: { en: 'Recruiter space', fr: 'Espace recruteur' },
		jobs: { en: 'Your job descriptions', fr: "Vos offres d'emploi" },
		noRecruiterSpace: { en: 'Not created', fr: 'Non créé' },
		spaceInUse: { en: 'Space in use', fr: 'Espace utilisé' }
	},
	data: {
		title: { en: 'Your data', fr: 'Vos données' },
		intro: {
			en: 'Only what the site needs to work. Nothing is sold or used for advertising.',
			fr: "Uniquement ce dont le site a besoin pour fonctionner. Rien n'est vendu ni utilisé à des fins publicitaires."
		},
		google: {
			en: 'From Google: your Google account id and your email address. Your picture is not kept.',
			fr: "De Google : l'identifiant de votre compte Google et votre adresse e-mail. Votre photo n'est pas conservée."
		},
		portfolio: {
			en: 'Your portfolio and everything you publish on it, which anyone can read, and your hiring journey.',
			fr: 'Votre portfolio et tout ce que vous y publiez, que tout le monde peut lire, ainsi que votre parcours de recrutement.'
		},
		jobs: {
			en: 'Your job descriptions, your applications and your meeting types.',
			fr: "Vos offres d'emploi, vos candidatures et vos types de rendez-vous."
		},
		terms: {
			en: 'The terms you accepted: their version, the date and the wording of the age confirmation. No birth date.',
			fr: "Les conditions que vous avez acceptées : leur version, la date et le texte de la confirmation d'âge. Aucune date de naissance."
		},
		requests: {
			en: 'You change most of it yourself on your portfolio and in the recruiter space. For a copy of your data or any other request, write to the contact address in the <notice>legal notice</notice>.',
			fr: "Vous en modifiez l'essentiel vous-même sur votre portfolio et dans l'espace recruteur. Pour une copie de vos données ou toute autre demande, écrivez à l'adresse de contact indiquée dans les <notice>mentions légales</notice>."
		},
		privacy: { en: 'Privacy policy', fr: 'Politique de confidentialité' },
		cookies: { en: 'Cookies and local storage', fr: 'Cookies et stockage local' },
		termsOfUse: { en: 'Terms of use', fr: "Conditions d'utilisation" }
	},
	delete: {
		title: { en: 'Delete your account', fr: 'Supprimer votre compte' },
		/** `hasPortfolio`: the account owns a portfolio, which goes too */
		text: {
			en: (hasPortfolio: boolean) =>
				`Deletes your account and everything tied to it, at once: ${hasPortfolio ? 'your portfolio (its address becomes available to others), ' : ''}your hiring journey, job descriptions, applications and meeting types. Google is asked to revoke its Calendar access. This cannot be undone.`,
			fr: (hasPortfolio: boolean) =>
				`Supprime immédiatement votre compte et tout ce qui y est lié : ${hasPortfolio ? "votre portfolio (son adresse redevient disponible pour d'autres), " : ''}votre parcours de recrutement, vos offres d'emploi, vos candidatures et vos types de rendez-vous. Il est demandé à Google de révoquer son accès à Google Agenda. Cette action est irréversible.`
		}
	}
});
