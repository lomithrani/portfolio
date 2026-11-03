import { MAX_AVAILABLE_DATES_RANGE, addDays, splitDateRange } from 'portfolio-common';
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

/** An answer of GET /appointments/available-dates, as Eden hands it over (see asIsoDate) */
export interface DatesAnswer {
	horizon: { first: string | Date; last: string | Date };
	dates: (string | Date)[];
}

export type BookableDates =
	{ ok: true; horizon: BookingHorizon; dates: string[] } | { ok: false; error: ApiError };

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
const asIsoDate = (date: string | Date): string =>
	typeof date === 'string' ? date : date.toISOString().slice(0, 10);

/**
 * The bookable dates of a schedule over its whole booking horizon. The first request names no
 * date: the API answers from today in the schedule's time zone, by its own clock, and says
 * where the horizon ends; the rest of it, past the dates one request covers, is asked for
 * next. Any failed request fails the whole: a calendar with some months missing would grey out
 * dates that are free.
 */
export async function loadBookableDates(
	fetchRange: (
		range: Partial<DateRange>
	) => Promise<{ data: DatesAnswer | null; error: ApiError | null }>
): Promise<BookableDates> {
	const ask = (range: Partial<DateRange>) =>
		fetchRange(range).catch((error: unknown) => ({
			data: null,
			error: { status: undefined, value: error }
		}));

	const head = await ask({});
	if (head.error || !head.data) return { ok: false, error: head.error ?? { status: undefined } };
	const horizon = {
		first: asIsoDate(head.data.horizon.first),
		last: asIsoDate(head.data.horizon.last)
	};

	const rest = await Promise.all(
		splitDateRange(addDays(horizon.first, MAX_AVAILABLE_DATES_RANGE), horizon.last).map(ask)
	);
	const failed = rest.find((answer) => answer.error || !answer.data);
	if (failed) return { ok: false, error: failed.error ?? { status: undefined } };

	const dates = [head, ...rest]
		.flatMap((answer) => (answer.data?.dates ?? []).map(asIsoDate))
		.filter((date) => date >= horizon.first && date <= horizon.last);
	return { ok: true, horizon, dates: [...new Set(dates)].sort() };
}

/**
 * The date the calendar opens on: the date picked earlier when it is still bookable (back from
 * a booking), else the first bookable one, else the first of the horizon
 */
export const firstShownDate = (
	dates: string[],
	horizon: BookingHorizon,
	picked: string | null = null
): string => (picked && dates.includes(picked) ? picked : (dates[0] ?? horizon.first));

export interface AvailabilityFailure {
	message: string;
	/** The schedule cannot be booked anymore: the list of schedules is out of date */
	reloadSchedules: boolean;
	/** Asking again may work */
	retry: boolean;
}

/**
 * What the booking page says when the dates or the free times of a schedule could not be loaded.
 * `fallback` is the message of a failure trying again may fix (network, server error).
 */
export function availabilityFailure(error: ApiError, fallback: string): AvailabilityFailure {
	const status = errorStatus(error);
	// The owner's calendar is not connected anymore, or Google refused its access
	if (status === 409) {
		return {
			message: 'Online booking is not available right now. Please reach out directly.',
			reloadSchedules: true,
			retry: false
		};
	}
	// The schedule was paused or deleted meanwhile
	if (status === 404) {
		return {
			message: 'This meeting type is not available anymore.',
			reloadSchedules: true,
			retry: false
		};
	}
	// Rate limit: the API's message says how long to wait
	if (status === 429 && typeof error.value === 'string') {
		return { message: error.value, reloadSchedules: false, retry: true };
	}
	return { message: fallback, reloadSchedules: false, retry: true };
}

export const DATES_FAILED = "We couldn't load the available dates. Please try again.";
export const SLOTS_FAILED = "We couldn't load the free times of this date. Please try again.";
