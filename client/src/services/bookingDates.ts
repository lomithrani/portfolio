import { bookingHorizon, splitDateRange } from 'portfolio-common';
import type { BookingHorizon, DateRange } from 'portfolio-common';
import { errorStatus } from './apiErrors';

// The dates the booking page (/[domain]/hire) offers: those GET
// /appointments/available-dates lists, fetched for the schedule's whole booking
// horizon. Every other date of the calendar is greyed out and cannot be picked.

/** A date of the date picker (its DateValue), in the schedule's time zone */
export interface CalendarFields {
	year: number;
	month: number;
	day: number;
}

type ApiError = { status: unknown; value?: unknown };

export type BookableDates =
	| { ok: true; horizon: BookingHorizon; dates: string[] }
	| { ok: false; horizon: BookingHorizon; error: ApiError };

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** YYYY-MM-DD of a date picker date */
export const toIsoDate = ({ year, month, day }: CalendarFields): string =>
	`${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/** The date picker's isDateUnavailable: every date the API did not list as bookable */
export const isUnbookable =
	(bookable: ReadonlySet<string>) =>
	(date: CalendarFields): boolean =>
		!bookable.has(toIsoDate(date));

/**
 * A date of the API's answer, as YYYY-MM-DD. Eden Treaty turns every JSON string that looks like
 * a date into a Date (its parseDate option, on by default, whatever the route's type says): a
 * YYYY-MM-DD one becomes midnight UTC of that date.
 */
const answeredDate = (date: string | Date): string =>
	typeof date === 'string' ? date : date.toISOString().slice(0, 10);

/**
 * The bookable dates of a schedule from today to its last bookable day, asked
 * in ranges the API accepts. Any failed range fails the whole: a calendar with
 * some months missing would grey out dates that are free.
 */
export async function loadBookableDates(
	schedule: { timezone: string; maxAdvanceDays: number },
	fetchRange: (
		range: DateRange
	) => Promise<{ data: (string | Date)[] | null; error: ApiError | null }>,
	now: Date = new Date()
): Promise<BookableDates> {
	const horizon = bookingHorizon(schedule, now);
	const answers = await Promise.all(
		splitDateRange(horizon.first, horizon.last).map((range) =>
			fetchRange(range).catch((error: unknown) => ({
				data: null,
				error: { status: undefined, value: error }
			}))
		)
	);
	const failed = answers.find((answer) => answer.error || !answer.data);
	if (failed) return { ok: false, horizon, error: failed.error ?? { status: undefined } };
	const dates = answers.flatMap((answer) => (answer.data ?? []).map(answeredDate));
	return { ok: true, horizon, dates: dates.sort() };
}

/** The date the calendar opens on: the first bookable one, else the first of the horizon */
export const firstShownDate = (dates: string[], horizon: BookingHorizon): string =>
	dates[0] ?? horizon.first;

export interface DatesFailure {
	message: string;
	/** The schedule cannot be booked anymore: the list of schedules is out of date */
	reloadSchedules: boolean;
}

/** What the booking page says when the bookable dates could not be loaded */
export function bookableDatesFailure(error: ApiError): DatesFailure {
	const status = errorStatus(error);
	// The owner's calendar is not connected anymore, or Google refused its access
	if (status === 409) {
		return {
			message: 'Online booking is not available right now. Please reach out directly.',
			reloadSchedules: true
		};
	}
	// The schedule was paused or deleted meanwhile
	if (status === 404) {
		return {
			message: 'This meeting type is not available anymore.',
			reloadSchedules: true
		};
	}
	return {
		message: "We couldn't load the available dates. Please try again.",
		reloadSchedules: false
	};
}
