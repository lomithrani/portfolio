import { intlLocale } from 'portfolio-common';
import type { portfolioApi } from '#services';
import { m } from './bookedMeetings.messages';

// Pure helpers of the meetings an account booked on other portfolios (GET /appointments/booked),
// listed on the recruiter's dashboard by `components/recruiter/UpcomingMeetings.svelte`. The API
// call stays in the component; nothing here knows the UI.

/** A meeting of GET /appointments/booked */
export type BookedMeeting = NonNullable<
	Awaited<ReturnType<typeof portfolioApi.appointments.booked.get>>['data']
>['meetings'][number];

/** The fields of a meeting the helpers read (Eden Treaty turns the API's ISO strings into Dates) */
type MeetingLike = {
	start: Date | string;
	end: Date | string;
	title: string | null;
	location: 'google_meet' | 'phone' | 'in_person' | 'custom';
	locationDetails: string | null;
	meetLink: string | null;
};

/** How long before its start a meeting is "starting soon" */
export const SOON_MINUTES = 15;

const LOCALE = 'en-GB';

const asDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));

/** Under way (started, not ended), starting within SOON_MINUTES, or later */
export function meetingPhase(
	meeting: Pick<MeetingLike, 'start' | 'end'>,
	now = new Date()
): 'now' | 'soon' | 'later' {
	const start = asDate(meeting.start).getTime();
	const end = asDate(meeting.end).getTime();
	if (start <= now.getTime() && now.getTime() < end) return 'now';
	if (start > now.getTime() && start - now.getTime() <= SOON_MINUTES * 60_000) return 'soon';
	return 'later';
}

/** 'Wed 18 Nov' ('Tue, 5 Jan 2027' in another year), in the browser's time zone by default */
export function meetingDayText(start: Date | string, now = new Date(), timeZone?: string): string {
	const date = asDate(start);
	const sameYear =
		date.toLocaleDateString('en', { year: 'numeric', timeZone }) ===
		now.toLocaleDateString('en', { year: 'numeric', timeZone });
	return date.toLocaleDateString(intlLocale(LOCALE), {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		...(sameYear ? {} : { year: 'numeric' }),
		...(timeZone ? { timeZone } : {})
	});
}

/** '09:00 – 10:00 CET': the hours, in the browser's time zone (named, it may not be the candidate's) */
export function meetingTimeText(
	start: Date | string,
	end: Date | string,
	timeZone?: string
): string {
	return new Intl.DateTimeFormat(intlLocale(LOCALE), {
		hour: '2-digit',
		minute: '2-digit',
		timeZoneName: 'short',
		...(timeZone ? { timeZone } : {})
	}).formatRange(asDate(start), asDate(end));
}

/** The schedule's title, or "Meeting" when the candidate deleted the schedule since */
export const meetingTitle = (meeting: Pick<MeetingLike, 'title'>): string =>
	meeting.title?.trim() || m.untitled;

/**
 * Where the meeting takes place, when there is no Google Meet link to join: what the candidate
 * wrote for a phone call, a place or other instructions, else where to find it. Null for a
 * Google Meet meeting with its link (the Join button says it all)
 */
export function meetingLocationText(meeting: MeetingLike): string | null {
	if (meeting.location === 'google_meet') {
		return meeting.meetLink ? null : m.meetLinkInInvitation;
	}
	return meeting.locationDetails
		? m.location[meeting.location](meeting.locationDetails)
		: m.locationUnstated[meeting.location];
}

/**
 * The Meet link to join, only when it is Google's (https://meet.google.com/...): the page never
 * links anything else as "Join Google Meet"
 */
export function meetingJoinLink(meeting: Pick<MeetingLike, 'meetLink'>): string | null {
	if (!meeting.meetLink) return null;
	try {
		const url = new URL(meeting.meetLink);
		return url.protocol === 'https:' && url.hostname === 'meet.google.com' ? url.href : null;
	} catch {
		return null;
	}
}
