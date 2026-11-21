import type { Page, Request } from '@playwright/test';
import { API_URL } from './owner';

// The appointment routes of a portfolio's booking (MeetingBooking.svelte: its meeting types, their
// free dates and slots, the booking) answered in the browser (page.route): the e2e API has no
// Google Calendar connected, and nothing here ever asks Google. The public list of meeting types is
// database only, but its free dates and slots would ask Google for the owner's busy times.

/** A meeting type as GET /appointments/domains/:domainName/schedules lists it */
export interface MeetingType {
	id: string;
	title: string;
	description: string | null;
	durationMinutes: number;
	minNoticeHours: number;
	maxAdvanceDays: number;
	timezone: string;
	locationType: 'google_meet' | 'phone' | 'in_person';
	locationDetails: string | null;
	availability: { dayOfWeek: number; startTime: string; endTime: string }[];
}

/** A meeting type of 30 minutes on Google Meet, on Monday mornings: `overrides` change it */
export const meetingType = (overrides: Partial<MeetingType> = {}): MeetingType => ({
	id: '65e2e00000000000000000ab',
	title: 'Intro call',
	description: null,
	durationMinutes: 30,
	minNoticeHours: 0,
	maxAdvanceDays: 30,
	timezone: 'Europe/Paris',
	locationType: 'google_meet',
	locationDetails: null,
	availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }],
	...overrides
});

/** The day `offset` days from today (UTC), as the booking's dates are written: '2026-11-21' */
export const dayFromToday = (offset: number) =>
	new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** A slot of an hour on `date`, at 08:00 UTC */
export const slotOn = (date: string) => ({
	start: `${date}T08:00:00.000Z`,
	end: `${date}T09:00:00.000Z`
});

// A route of the API answered in the browser is another origin's: the answer needs the CORS headers
// the API would send, and its preflight an answer too
const cors = (request: Request) => ({
	'access-control-allow-origin': request.headers()['origin'] ?? '*',
	'access-control-allow-credentials': 'true'
});

/**
 * Answers the browser's calls to the appointment routes of `domainName`'s booking: its meeting types
 * (`schedules`, one by default), their free `dates` (none by default: the calendar shows no day to
 * pick) within a horizon from today to `horizonDays` later (today alone by default), the free slots
 * of a date (`slots`), and the booking, which answers booked with the first slot. Any other
 * appointment route answers 404: nothing reaches the API, nor Google. Returns the bookings sent, the
 * body of each POST /appointments/book as the browser sent it
 */
export const stubAppointments = async (
	page: Page,
	domainName: string,
	{
		schedules = [meetingType()],
		dates = [],
		horizonDays = 0,
		slots = []
	}: {
		schedules?: MeetingType[];
		dates?: string[];
		horizonDays?: number;
		slots?: { start: string; end: string }[];
	} = {}
): Promise<Record<string, unknown>[]> => {
	const booked: Record<string, unknown>[] = [];
	await page.route(`${API_URL}/appointments/**`, async (route) => {
		const request = route.request();
		const headers = cors(request);
		if (request.method() === 'OPTIONS') {
			return route.fulfill({
				status: 204,
				headers: {
					...headers,
					'access-control-allow-methods': 'GET, POST',
					'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? ''
				}
			});
		}
		const { pathname } = new URL(request.url());
		if (pathname.endsWith(`/domains/${domainName}/schedules`)) {
			return route.fulfill({ json: schedules, headers });
		}
		if (pathname.endsWith('/available-dates')) {
			const horizon = { first: dayFromToday(0), last: dayFromToday(horizonDays) };
			return route.fulfill({ json: { horizon, dates }, headers });
		}
		if (pathname.endsWith('/available-slots')) return route.fulfill({ json: slots, headers });
		if (pathname.endsWith('/book') && request.method() === 'POST') {
			booked.push(request.postDataJSON());
			const [slot] = slots;
			const json = {
				booked: true,
				start: slot?.start ?? null,
				end: slot?.end ?? null,
				meetLink: null,
				eventLink: null
			};
			return route.fulfill({ json, headers });
		}
		return route.fulfill({ status: 404, body: 'Not stubbed', headers });
	});
	return booked;
};
