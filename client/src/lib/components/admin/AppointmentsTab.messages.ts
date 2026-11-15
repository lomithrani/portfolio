import { defineMessages } from 'portfolio-common';

export const m = defineMessages({
	/** Google's product, under the name Google gives it in each language */
	googleCalendar: { en: 'Google Calendar', fr: 'Google Agenda' },
	/** Sunday first: a day's position is its `dayOfWeek` in an availability window */
	dayNames: {
		en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
		fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
	},
	locationTypes: {
		phone: { en: 'Phone', fr: 'Téléphone' },
		inPerson: { en: 'In Person', fr: 'En personne' },
		custom: { en: 'Custom', fr: 'Personnalisé' }
	},
	minutes: { en: (count: number) => `${count} min`, fr: (count: number) => `${count} min` },

	// --- Failed calls ---
	sessionExpired: {
		en: 'Your session has expired. Please log in again.',
		fr: 'Votre session a expiré. Reconnectez-vous.'
	},
	connectionCheckFailed: {
		en: 'Could not check the Google Calendar connection.',
		fr: 'Impossible de vérifier la connexion à Google Agenda.'
	},
	calendarsLoadFailed: {
		en: 'Could not load your calendars.',
		fr: 'Impossible de charger vos agendas.'
	},
	authorizationCancelled: {
		en: 'Google authorization was cancelled or could not open.',
		fr: "L'autorisation Google a été annulée ou n'a pas pu s'ouvrir."
	},
	connectFailed: {
		en: 'Failed to connect Google Calendar.',
		fr: 'Impossible de connecter Google Agenda.'
	},
	disconnectFailed: {
		en: 'Failed to disconnect Google Calendar.',
		fr: 'Impossible de déconnecter Google Agenda.'
	},
	schedulesLoadFailed: {
		en: 'Could not load your schedules.',
		fr: 'Impossible de charger vos agendas de rendez-vous.'
	},
	scheduleSaveFailed: {
		en: 'Failed to save schedule.',
		fr: "Impossible d'enregistrer l'agenda de rendez-vous."
	},
	scheduleSaved: { en: 'Schedule saved!', fr: 'Agenda de rendez-vous enregistré !' },
	scheduleDeleteFailed: {
		en: 'Failed to delete schedule.',
		fr: "Impossible de supprimer l'agenda de rendez-vous."
	},
	bookingsLoadFailed: {
		en: 'Could not load your bookings.',
		fr: 'Impossible de charger vos réservations.'
	},
	cancelFailed: {
		en: 'Failed to cancel the appointment.',
		fr: "Impossible d'annuler le rendez-vous."
	},

	// --- The Google Calendar connection ---
	connectionIntro: {
		en: 'Connect your Google Calendar so visitors can book meetings on your available time slots. The app will check your calendar for conflicts and create events automatically.',
		fr: "Connectez votre Google Agenda pour que les visiteurs puissent réserver un rendez-vous sur vos créneaux disponibles. L'application vérifie les conflits dans votre agenda et crée les événements automatiquement."
	},
	checkingConnection: { en: 'Checking connection...', fr: 'Vérification de la connexion…' },
	notConfigured: {
		en: 'Google Calendar is not configured on the server: set its <code>GOOGLE_CLIENT_SECRET</code> to enable appointments.',
		fr: "Google Agenda n'est pas configuré sur le serveur : définissez son <code>GOOGLE_CLIENT_SECRET</code> pour activer les rendez-vous."
	},
	connected: { en: 'Connected', fr: 'Connecté' },
	disconnected: { en: 'Disconnected', fr: 'Déconnecté' },
	since: { en: (date: string) => `since ${date}`, fr: (date: string) => `depuis le ${date}` },
	permissionsActive: {
		en: 'Your calendar permissions are active. Visitors can book available slots and events will be added to your Google Calendar.',
		fr: "L'accès à votre agenda est actif. Les visiteurs peuvent réserver les créneaux disponibles et les événements sont ajoutés à votre Google Agenda."
	},
	disconnect: { en: 'Disconnect', fr: 'Déconnecter' },
	accessRefused: {
		en: "Google no longer accepts this app's access to your calendar: it was revoked or has expired. Visitors cannot book meetings until you reconnect.",
		fr: "Google n'accepte plus l'accès de cette application à votre agenda : il a été révoqué ou a expiré. Les visiteurs ne peuvent plus réserver de rendez-vous tant que vous ne l'avez pas reconnecté."
	},
	connecting: { en: 'Connecting...', fr: 'Connexion…' },
	reconnect: { en: 'Reconnect Google Calendar', fr: 'Reconnecter Google Agenda' },
	connect: { en: 'Connect Google Calendar', fr: 'Connecter Google Agenda' },

	// --- Schedules ---
	schedules: { en: 'Appointment Schedules', fr: 'Agendas de rendez-vous' },
	schedulesIntro: {
		en: 'Define when visitors can book time with you. Each schedule sets the duration, availability windows, and booking rules.',
		fr: 'Définissez quand les visiteurs peuvent réserver un rendez-vous avec vous. Chaque agenda de rendez-vous fixe la durée, les plages de disponibilité et les règles de réservation.'
	},
	newSchedule: { en: 'New Schedule', fr: 'Nouvel agenda' },
	editSchedule: { en: 'Edit Schedule', fr: "Modifier l'agenda de rendez-vous" },
	title: { en: 'Title', fr: 'Titre' },
	titlePlaceholder: { en: 'e.g. 30-min consultation', fr: 'ex. : consultation de 30 min' },
	scheduleDescription: { en: 'Description (optional)', fr: 'Description (facultatif)' },
	descriptionPlaceholder: {
		en: 'Shown to visitors when booking',
		fr: 'Affichée aux visiteurs lors de la réservation'
	},
	duration: { en: 'Duration', fr: 'Durée' },
	buffer: {
		en: 'Buffer between meetings (min)',
		fr: 'Battement entre deux rendez-vous (min)'
	},
	minNotice: {
		en: 'Min notice before booking (hours)',
		fr: 'Préavis minimal avant réservation (heures)'
	},
	maxAdvance: { en: 'Max days in advance', fr: "Jours d'avance au maximum" },
	loadingCalendars: { en: 'Loading calendars...', fr: 'Chargement des agendas…' },
	primaryCalendar: {
		en: (name: string) => `${name} (primary)`,
		fr: (name: string) => `${name} (principal)`
	},
	timezone: { en: 'Timezone', fr: 'Fuseau horaire' },
	meetingLocation: { en: 'Meeting location', fr: 'Lieu du rendez-vous' },
	locationDetails: { en: 'Location details', fr: 'Précisions sur le lieu' },
	locationPlaceholder: {
		en: 'e.g. 123 Main St or +33 6 12 34 56 78',
		fr: 'ex. : 12 rue de la Paix ou +33 6 12 34 56 78'
	},
	acceptingBookings: { en: 'Accepting bookings', fr: 'Réservations ouvertes' },
	paused: { en: 'Paused', fr: 'En pause' },
	weeklyAvailability: { en: 'Weekly Availability', fr: 'Disponibilités de la semaine' },
	availabilityIntro: {
		en: 'Set the time windows when visitors can book. Your actual Google Calendar events are checked at booking time to avoid conflicts.',
		fr: 'Indiquez les plages horaires où les visiteurs peuvent réserver. Les événements de votre Google Agenda sont vérifiés au moment de la réservation pour éviter les conflits.'
	},
	addWindow: { en: '+ Add', fr: '+ Ajouter' },
	unavailable: { en: 'Unavailable', fr: 'Indisponible' },
	windowStart: { en: (day: string) => `${day} start`, fr: (day: string) => `${day} : début` },
	windowEnd: { en: (day: string) => `${day} end`, fr: (day: string) => `${day} : fin` },
	to: { en: 'to', fr: 'à' },
	saving: { en: 'Saving...', fr: 'Enregistrement…' },
	saveSchedule: { en: 'Save Schedule', fr: "Enregistrer l'agenda" },
	loadingSchedules: {
		en: 'Loading schedules...',
		fr: 'Chargement des agendas de rendez-vous…'
	},
	noSchedules: {
		en: 'No schedules yet. Create one to define your available time slots.',
		fr: "Aucun agenda de rendez-vous pour l'instant. Créez-en un pour définir vos créneaux disponibles."
	},

	// --- Booked appointments ---
	bookings: { en: 'Booked Appointments', fr: 'Rendez-vous réservés' },
	bookingsIntro: {
		en: 'Meetings booked by visitors through your portfolio.',
		fr: 'Les rendez-vous réservés par les visiteurs depuis votre portfolio.'
	},
	loading: { en: 'Loading...', fr: 'Chargement…' },
	refresh: { en: 'Refresh', fr: 'Actualiser' },
	loadingBookings: { en: 'Loading bookings...', fr: 'Chargement des réservations…' },
	noBookings: {
		en: 'No upcoming bookings yet.',
		fr: "Aucune réservation à venir pour l'instant."
	},
	untitled: { en: 'Untitled', fr: 'Sans titre' },
	cancelling: { en: 'Cancelling...', fr: 'Annulation…' },
	joinMeet: { en: 'Join Google Meet', fr: 'Rejoindre Google Meet' }
});
