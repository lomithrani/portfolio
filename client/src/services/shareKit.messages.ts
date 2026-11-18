// The texts the share kit (`shareKit.ts`) writes for the owner to copy: the reply to a recruiter's
// message and the LinkedIn text, in the language the owner picks for them (read inside
// withLocale), whatever the page's. Written in the owner's voice, to a recruiter. The Share tab's
// own texts are in `components/admin/ShareTab.messages.ts`.
import { defineMessages, plural } from 'portfolio-common';

export const m = defineMessages({
	/**
	 * The reply: the greeting, then what it asks (shareThere or sendIt, and what follows), the link
	 * on a line of its own, the facts the owner ticked, the closing
	 */
	reply: {
		greeting: { en: 'Hello,', fr: 'Bonjour,' },
		thanks: { en: 'Thank you for your message.', fr: 'Merci pour votre message.' },
		/** The journey has a job step: the recruiter shares the job there (its pay is required) */
		shareThere: {
			en: 'Before we talk, could you share the role on my page for recruiters, with its pay range?',
			fr: "Avant d'échanger, pourriez-vous présenter le poste sur ma page recruteurs, avec sa fourchette de rémunération ?"
		},
		/** After shareThere: the journey scores the job, then a meeting can be booked */
		scored: {
			en: 'It is scored against what I am looking for and, if it fits, you can book a meeting with me there right away.',
			fr: "L'offre est notée au regard de ce que je recherche et, si elle correspond, vous pouvez y réserver tout de suite un rendez-vous avec moi."
		},
		/** After shareThere: a meeting can be booked, without a score */
		thenBook: {
			en: 'You can then book a meeting with me there.',
			fr: 'Vous pourrez ensuite y réserver un rendez-vous avec moi.'
		},
		/** The journey asks for no job: the recruiter sends it with their answer */
		sendIt: {
			en: 'Before we talk, could you send me the job description, with its pay range?',
			fr: "Avant d'échanger, pourriez-vous m'envoyer l'offre d'emploi, avec sa fourchette de rémunération ?"
		},
		/** After sendIt, for a journey that leads to a meeting: the link of the page follows */
		bookThere: {
			en: 'You can then book a meeting with me on my page for recruiters:',
			fr: 'Vous pourrez ensuite réserver un rendez-vous avec moi sur ma page recruteurs :'
		},
		/** After sendIt, for a journey that leads to no meeting: the portfolio's link follows */
		portfolio: {
			en: 'My experiences and projects are in my portfolio:',
			fr: 'Mes expériences et mes projets sont dans mon portfolio :'
		},
		/** Before the facts the owner ticked, one a line */
		factsIntro: {
			en: 'A few things that matter to me:',
			fr: 'Ce qui compte pour moi :'
		},
		closing: { en: 'Best regards,', fr: 'Bien cordialement,' }
	},
	/** The facts, one line each, after "- " */
	fact: {
		/** `amount`: formatted with the currency */
		pay: {
			year: {
				en: (amount: string) => `Pay: at least ${amount} gross a year`,
				fr: (amount: string) => `Rémunération : au moins ${amount} brut par an`
			},
			day: {
				en: (amount: string) => `Pay: at least ${amount} gross a day`,
				fr: (amount: string) => `Rémunération : au moins ${amount} brut par jour`
			}
		},
		remoteDays: {
			en: (days: number) => `Remote work: at least ${days} ${plural(days, 'day', 'days')} a week`,
			fr: (days: number) =>
				`Télétravail : au moins ${days} ${plural(days, 'jour', 'jours')} par semaine`
		},
		/** Five remote days a week */
		fullyRemote: { en: 'Remote work: fully remote', fr: 'Télétravail : complet' },
		/** `places`: as the owner typed them */
		places: {
			en: (places: string) => `Location: ${places}`,
			fr: (places: string) => `Lieu : ${places}`
		},
		/** `types`: the contracts' labels, joined */
		contracts: {
			en: (types: string) => `Contract: ${types}`,
			fr: (types: string) => `Contrat : ${types}`
		}
	},
	/** The LinkedIn text (the profile's About section): what the page asks, then the portfolio */
	linkedIn: {
		/** The journey asks for the job and scores it */
		scored: {
			en: (link: string) =>
				`Recruiters: to propose a role, start on my page for recruiters. It asks for the job and its pay range first, and scores it against what I am looking for: ${link}`,
			fr: (link: string) =>
				`Recruteurs : pour me proposer un poste, commencez par ma page recruteurs. Elle demande d'abord l'offre et sa fourchette de rémunération, et la note au regard de ce que je recherche : ${link}`
		},
		/** The journey asks for the job, without scoring it */
		asksJob: {
			en: (link: string) =>
				`Recruiters: to propose a role, start on my page for recruiters. It asks for the job and its pay range first: ${link}`,
			fr: (link: string) =>
				`Recruteurs : pour me proposer un poste, commencez par ma page recruteurs. Elle demande d'abord l'offre et sa fourchette de rémunération : ${link}`
		},
		/** The journey asks for no job, and leads to a meeting */
		start: {
			en: (link: string) =>
				`Recruiters: to propose a role, start on my page for recruiters: ${link}`,
			fr: (link: string) =>
				`Recruteurs : pour me proposer un poste, commencez par ma page recruteurs : ${link}`
		},
		portfolio: {
			en: (link: string) => `My experiences and projects: ${link}`,
			fr: (link: string) => `Mes expériences et mes projets : ${link}`
		}
	}
});
