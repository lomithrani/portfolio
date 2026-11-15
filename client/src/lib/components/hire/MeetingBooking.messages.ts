import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** Also what the Hire page says while its journey loads */
	loading: { en: 'Loading availability...', fr: 'Chargement des disponibilités…' },

	// --- Meeting types ---
	meetingType: { en: 'Meeting type', fr: 'Type de rendez-vous' },
	/** The meeting type picked was paused or deleted meanwhile */
	scheduleGone: {
		en: (title: string) => `${title} is not available anymore. Please pick another meeting type.`,
		fr: (title: string) =>
			`${title} n'est plus disponible. Choisissez un autre type de rendez-vous.`
	},
	duration: {
		en: (minutes: number) => `${minutes} min`,
		fr: (minutes: number) => `${minutes} min`
	},
	/** Where a meeting takes place, by the schedule's `locationType` */
	location: {
		google_meet: { en: 'Google Meet', fr: 'Google Meet' },
		phone: { en: 'Phone call', fr: 'Appel téléphonique' },
		in_person: { en: 'In person', fr: 'En personne' },
		custom: { en: 'Details after booking', fr: 'Détails après la réservation' }
	},
	/** The days of the week, from Sunday (a schedule's `dayOfWeek`) */
	days: {
		en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
		fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
	},
	/** `days`: the names of the days, joined with ", " */
	availableOn: {
		en: (days: string) => `Available on ${days}`,
		fr: (days: string) => `Jours disponibles : ${days}`
	},

	// --- Dates ---
	loadingDates: { en: 'Loading available dates...', fr: 'Chargement des dates disponibles…' },
	noDate: {
		en: (days: number) =>
			`No date is open for booking in the next ${days} days. Please check back later, or reach out directly.`,
		fr: (days: number) =>
			`Aucune date n'est ouverte à la réservation dans les ${days} prochains jours. Revenez plus tard, ou prenez contact directement.`
	},
	pickDate: { en: 'Pick a date', fr: 'Choisissez une date' },
	greyedOut: {
		en: 'Greyed-out dates have no free slot.',
		fr: "Les dates grisées n'ont aucun créneau libre."
	},
	ownerTimezone: {
		en: (ownerName: string, timezone: string) =>
			`Dates follow ${ownerName}'s time zone (${timezone}); times are shown in yours.`,
		fr: (ownerName: string, timezone: string) =>
			`${ownerName} propose ses dates dans son fuseau horaire (${timezone}) ; les horaires sont affichés dans le vôtre.`
	},
	/**
	 * What the date picker says of its own (aria-labels). The English is the date picker's:
	 * `date` is the date in full, in the calendar's language
	 */
	calendar: {
		name: { en: 'calendar', fr: 'calendrier' },
		previousMonth: { en: 'Switch to previous month', fr: 'Mois précédent' },
		nextMonth: { en: 'Switch to next month', fr: 'Mois suivant' },
		unavailable: {
			en: (date: string) => `Not available. ${date}`,
			fr: (date: string) => `Indisponible. ${date}`
		},
		selected: {
			en: (date: string) => `Selected date. ${date}`,
			fr: (date: string) => `Date sélectionnée. ${date}`
		},
		choose: {
			en: (date: string) => `Choose ${date}`,
			fr: (date: string) => `Choisir le ${date}`
		}
	},

	// --- Slots ---
	checking: { en: 'Checking availability...', fr: 'Vérification des disponibilités…' },
	noSlot: {
		en: 'No slots left on this date — please pick another one.',
		fr: 'Plus de créneau à cette date : choisissez-en une autre.'
	},
	yourTimezone: {
		en: (timezone: string) => `Times shown in your timezone (${timezone})`,
		fr: (timezone: string) => `Horaires affichés dans votre fuseau horaire (${timezone})`
	},
	/** A slot on another day than the date picked: "Mon, Jun 7, 09:30" */
	slotOnDay: {
		en: (day: string, time: string) => `${day}, ${time}`,
		fr: (day: string, time: string) => `${day}, ${time}`
	},

	// --- The booking form ---
	/** `<date></date>`: where the slot's date and time go */
	booking: { en: 'Booking <date></date>', fr: 'Réservation du <date></date>' },
	name: { en: 'Your name *', fr: 'Votre nom *' },
	namePlaceholder: { en: 'Jane Doe', fr: 'Camille Martin' },
	email: { en: 'Your email *', fr: 'Votre e-mail *' },
	emailPlaceholder: { en: 'jane@company.com', fr: 'camille@entreprise.com' },
	notes: { en: 'Notes (optional)', fr: 'Notes (facultatif)' },
	notesPlaceholder: {
		en: 'What would you like to talk about?',
		fr: 'De quoi souhaitez-vous parler ?'
	},
	submitting: { en: 'Booking...', fr: 'Réservation…' },
	confirm: { en: 'Confirm booking', fr: 'Confirmer la réservation' },
	slotTaken: {
		en: 'This slot was just taken. Please pick another one.',
		fr: "Ce créneau vient d'être pris. Choisissez-en un autre."
	},
	failed: {
		en: 'Booking failed. Please try again.',
		fr: 'La réservation a échoué. Réessayez.'
	},

	// --- The confirmation ---
	booked: { en: "You're booked! 🎉", fr: "C'est réservé ! 🎉" },
	/** `<recipient></recipient>`: where the visitor's email address goes */
	invitationSent: {
		en: 'A calendar invitation has been sent to <recipient></recipient>.',
		fr: 'Une invitation a été envoyée à <recipient></recipient>.'
	},
	meetLink: { en: 'Google Meet link', fr: 'Lien Google Meet' },
	bookAnother: { en: 'Book another slot', fr: 'Réserver un autre créneau' }
});
