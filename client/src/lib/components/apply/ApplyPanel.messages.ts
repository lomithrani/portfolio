import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** The panel's heading, by what it shows */
	title: {
		ownPosting: { en: 'This is your job description', fr: "C'est votre offre d'emploi" },
		signedOut: {
			en: 'Sign in to apply with your portfolio',
			fr: 'Connectez-vous pour postuler avec votre portfolio'
		},
		onList: { en: 'On the applicant list', fr: 'Sur la liste des candidats' },
		sent: { en: 'Application sent', fr: 'Candidature envoyée' },
		applyWithPortfolio: { en: 'Apply with your portfolio', fr: 'Postuler avec votre portfolio' },
		apply: { en: 'Apply', fr: 'Postuler' }
	},

	checking: { en: 'Checking whether you applied…', fr: 'Nous vérifions si vous avez postulé…' },
	/** Under "The recruiter added your portfolio on…" (`name`: the viewer's portfolio, a link) */
	addedNote: {
		en: (name: string) =>
			`They see your portfolio, <portfolio>${name}</portfolio>. You can remove yourself from the list.`,
		fr: (name: string) =>
			`Le recruteur voit votre portfolio, <portfolio>${name}</portfolio>. Vous pouvez vous retirer de la liste.`
	},
	/** Under "You applied on…" */
	appliedNote: {
		en: (name: string) =>
			`The recruiter sees your name and your portfolio, <portfolio>${name}</portfolio>. Keep it up to date.`,
		fr: (name: string) =>
			`Le recruteur voit votre nom et votre portfolio, <portfolio>${name}</portfolio>. Tenez-le à jour.`
	},
	/** Next to "Withdraw" / "Remove me": stays on the applicant list */
	keep: { en: 'Keep it', fr: 'Conserver' },

	/** The posting's own recruiter, on a posting that takes no applications */
	ownClosed: {
		en: 'This is your job description. Reopen it from your recruiter space to take applications again.',
		fr: "C'est votre offre d'emploi. Rouvrez-la depuis votre espace recruteur pour recevoir de nouveau des candidatures."
	},
	/** The posting's own recruiter, on an open posting */
	ownOpen: {
		en: 'Candidates apply to it from this page. You see who applied, and change the posting, in your recruiter space.',
		fr: "Les candidats y postulent depuis cette page. Vous voyez qui a postulé, et modifiez l'offre, dans votre espace recruteur."
	},
	manage: { en: 'Manage it', fr: "Gérer l'offre" },

	signedOut: {
		en: 'The recruiter sees your name and your portfolio: your experience, skills and projects. Never your email. Not on Portfolio yet? You can claim yours once signed in.',
		fr: 'Le recruteur voit votre nom et votre portfolio : votre expérience, vos compétences et vos projets. Jamais votre adresse e-mail. Pas encore sur Portfolio ? Vous pourrez réserver le vôtre une fois connecté.'
	},
	noPortfolio: {
		en: 'Claim one first: it is free, and it is what the recruiter sees when you apply.',
		fr: "Réservez-en un d'abord : c'est gratuit, et c'est ce que voit le recruteur quand vous postulez."
	},

	/** Nothing was claimed: the account turned out to own a portfolio (`name`, a link) already */
	alreadyOwns: {
		en: (name: string) =>
			`Your account already owns <portfolio>${name}</portfolio>, so nothing else was claimed: an account has a single address. Apply with this one.`,
		fr: (name: string) =>
			`Votre compte possède déjà <portfolio>${name}</portfolio> : rien d'autre n'a donc été réservé, un compte n'a qu'une adresse. Postulez avec ce portfolio.`
	},
	/** The same, read by screen readers */
	alreadyOwnsAnnouncement: {
		en: (name: string) =>
			`Your account already owns ${name}: nothing else was claimed. You can apply with ${name}.`,
		fr: (name: string) =>
			`Votre compte possède déjà ${name} : rien d'autre n'a été réservé. Vous pouvez postuler avec ${name}.`
	},
	/** The portfolio was claimed here, a moment ago */
	newPortfolio: {
		en: 'Your new portfolio is empty for now. <add>Add your experience</add> first, so the recruiter sees more than your name.',
		fr: "Votre nouveau portfolio est vide pour le moment. <add>Ajoutez d'abord votre expérience</add>, pour que le recruteur voie plus que votre nom."
	},
	/** Above the "Apply with…" button */
	willSee: {
		en: (name: string) =>
			`The recruiter will see your name and your portfolio, <portfolio>${name}</portfolio>. Never your email.`,
		fr: (name: string) =>
			`Le recruteur verra votre nom et votre portfolio, <portfolio>${name}</portfolio>. Jamais votre adresse e-mail.`
	},
	sending: { en: 'Sending your application…', fr: 'Envoi de votre candidature…' },
	applyWith: {
		en: (name: string) => `Apply with ${name}`,
		fr: (name: string) => `Postuler avec ${name}`
	},
	/** The toast once applied */
	sent: {
		title: { en: 'Application sent', fr: 'Candidature envoyée' },
		description: {
			en: (name: string) => `The recruiter can now see your portfolio, ${name}.`,
			fr: (name: string) => `Le recruteur peut maintenant voir votre portfolio, ${name}.`
		}
	}
});
