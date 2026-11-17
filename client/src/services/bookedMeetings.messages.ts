// Texts of the meetings an account booked on other portfolios that `bookedMeetings.ts` gives: a
// meeting's title and where it takes place (the list's own texts are in
// `components/recruiter/UpcomingMeetings.messages.ts`).
import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** A meeting whose schedule the candidate deleted since */
	untitled: { en: 'Meeting', fr: 'Rendez-vous' },
	/** A Google Meet meeting whose link the site did not get: the invitation has it */
	meetLinkInInvitation: {
		en: 'Google Meet: the link is in your calendar invitation.',
		fr: 'Google Meet : le lien figure dans votre invitation.'
	},
	/** Where a meeting outside Google Meet takes place: what the candidate wrote */
	location: {
		phone: {
			en: (details: string) => `By phone: ${details}`,
			fr: (details: string) => `Par téléphone : ${details}`
		},
		in_person: {
			en: (details: string) => `In person: ${details}`,
			fr: (details: string) => `En personne : ${details}`
		},
		custom: { en: (details: string) => details, fr: (details: string) => details }
	},
	/** A meeting outside Google Meet whose details the candidate did not give */
	locationUnstated: {
		phone: {
			en: 'By phone: the details are in your invitation.',
			fr: 'Par téléphone : les détails figurent dans votre invitation.'
		},
		in_person: {
			en: 'In person: the address is in your invitation.',
			fr: "En personne : l'adresse figure dans votre invitation."
		},
		custom: {
			en: 'The details are in your invitation.',
			fr: 'Les détails figurent dans votre invitation.'
		}
	}
});
