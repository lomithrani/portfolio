import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	title: { en: 'Delete your account?', fr: 'Supprimer votre compte ?' },
	description: {
		en: 'Everything tied to your account is deleted at once. This cannot be undone.',
		fr: 'Tout ce qui est lié à votre compte est supprimé immédiatement. Cette action est irréversible.'
	},
	whatIsDeleted: { en: 'What is deleted', fr: 'Ce qui est supprimé' },
	deleted: {
		/** `<address>` is where the dialog puts the portfolio's address */
		portfolio: {
			en: 'Your portfolio <address></address>, its experiences and projects, and your hiring journey. The address becomes available to others.',
			fr: "Votre portfolio <address></address>, ses expériences et ses projets, ainsi que votre parcours de recrutement. Son adresse redevient disponible pour d'autres."
		},
		jobs: { en: 'Your job descriptions.', fr: "Vos offres d'emploi." },
		journeys: {
			en: "Your progress in other people's hiring journeys.",
			fr: "Votre progression dans les parcours de recrutement d'autres personnes."
		},
		meetings: {
			en: 'Your meeting types and bookings. If you connected Google Calendar, its tokens are deleted and Google is asked to revoke its access.',
			fr: 'Vos types de rendez-vous et vos réservations. Si vous avez connecté Google Agenda, ses jetons sont supprimés et il est demandé à Google de révoquer son accès.'
		},
		account: {
			en: 'Your account: your email address, your Google account id and the terms you accepted.',
			fr: "Votre compte : votre adresse e-mail, l'identifiant de votre compte Google et les conditions que vous avez acceptées."
		},
		drafts: {
			en: 'The drafts this browser keeps for your account.',
			fr: 'Les brouillons que ce navigateur conserve pour votre compte.'
		}
	},
	/** What deleting the account cannot take back (privacy policy, #retention) */
	whatStays: {
		en: 'Meetings already added to Google calendars stay there, and the step suggestions and feedback already published on GitHub stay (they do not name you; write to us to have one removed).',
		fr: "Les rendez-vous déjà ajoutés à des agendas Google y restent, et les suggestions d'étape et les avis déjà publiés sur GitHub restent (ils ne vous nomment pas ; écrivez-nous pour en faire retirer un)."
	},
	/** The field's label; `word` is what the person types (DELETE_CONFIRMATION_WORD) */
	typeToConfirm: {
		en: (word: string) => `Type <word>${word}</word> to confirm`,
		fr: (word: string) => `Saisissez <word>${word}</word> pour confirmer`
	},
	typeInCapitals: {
		en: (word: string) => `Type ${word} in capital letters to confirm.`,
		fr: (word: string) => `Saisissez ${word} en majuscules pour confirmer.`
	},
	/** What a screen reader hears while the deletion runs */
	deleting: { en: 'Deleting your account…', fr: 'Suppression de votre compte…' },
	/** Under the toast that says the session expired */
	checkAccount: {
		en: 'Sign in again to check your account.',
		fr: 'Reconnectez-vous pour vérifier votre compte.'
	},
	done: {
		title: { en: 'Your account was deleted', fr: 'Votre compte a été supprimé' },
		description: {
			en: 'Everything tied to it is gone, and you are signed out.',
			fr: 'Tout ce qui y était lié a disparu, et vous êtes déconnecté.'
		}
	}
});
