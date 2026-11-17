// Texts of the recruiter's upcoming meetings (`UpcomingMeetings.svelte`, on /recruiter); a
// meeting's title and place come from `services/bookedMeetings.messages.ts`.
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	title: { en: 'Upcoming meetings', fr: 'Prochains rendez-vous' },
	empty: {
		en: "No upcoming meetings. Book one on a candidate's Hire page while signed in and it shows here.",
		fr: "Aucun rendez-vous à venir. Réservez-en un sur la page Recruter d'un candidat en étant connecté : il s'affichera ici."
	},
	loadFailed: {
		en: 'Your upcoming meetings could not be loaded.',
		fr: "Vos prochains rendez-vous n'ont pas pu être chargés."
	},
	/** `<portfolio></portfolio>`: the candidate's portfolio, a link */
	with: { en: 'with <portfolio></portfolio>', fr: 'avec <portfolio></portfolio>' },
	/** A candidate who has no portfolio anymore */
	withoutPortfolio: { en: 'with a candidate', fr: 'avec un candidat' },
	/** Under way: started, not ended */
	now: { en: 'Now', fr: 'En cours' },
	/** Starting within 15 minutes */
	soon: { en: 'Starting soon', fr: 'Bientôt' },
	join: { en: 'Join Google Meet', fr: 'Rejoindre Google Meet' },
	/** Hidden after "Join Google Meet": which meeting */
	ofMeeting: {
		en: (title: string, when: string) => `: ${title}, ${when}`,
		fr: (title: string, when: string) => ` : ${title}, ${when}`
	},
	opensInNewTab: { en: '(opens in a new tab)', fr: "(s'ouvre dans un nouvel onglet)" }
});
