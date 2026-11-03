// Calendar dates of appointment booking, written YYYY-MM-DD and read in a
// schedule's IANA time zone. Shared by the API, which clamps the dates it is
// asked about to the booking horizon, and the booking page, which asks for the
// bookable dates of that whole horizon (GET /appointments/available-dates).

/** Most dates GET /appointments/available-dates evaluates in one request */
export const MAX_AVAILABLE_DATES_RANGE = 62;

/** maxAdvanceDays of a schedule that sets none (the schema default) */
const DEFAULT_MAX_ADVANCE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight UTC of a YYYY-MM-DD date, in milliseconds: calendar arithmetic without DST */
const utcDay = (date: string): number => Date.parse(`${date}T00:00:00Z`);

/** Whether `value` is a real calendar date written YYYY-MM-DD (2026-02-30 is not) */
export const isCalendarDate = (value: string): boolean => {
	const match = ISO_DATE.exec(value);
	if (!match) return false;
	const [year, month, day] = match.slice(1).map(Number);
	const date = new Date(utcDay(value));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
};

/** The date `days` calendar days after `date` (before it when negative) */
export const addDays = (date: string, days: number): string =>
	new Date(utcDay(date) + days * DAY_MS).toISOString().slice(0, 10);

/** Calendar days from `from` to `to`: 0 on the same date, negative when `to` is earlier */
export const daysBetween = (from: string, to: string): number =>
	Math.round((utcDay(to) - utcDay(from)) / DAY_MS);

/** The YYYY-MM-DD wall-clock date of an instant in an IANA time zone */
export const wallDateInTimezone = (instant: Date, timezone: string): string => {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(instant);
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value ?? '';
	return `${part('year')}-${part('month')}-${part('day')}`;
};

export interface BookingHorizon {
	/** Today, in the schedule's time zone */
	first: string;
	/** Today + maxAdvanceDays */
	last: string;
}

/**
 * The dates a visitor may book on a schedule: from today to today +
 * maxAdvanceDays, in the schedule's time zone. A date in it can still have no
 * slot: no availability that day, inside the minimum notice, calendar busy.
 */
export const bookingHorizon = (
	schedule: { timezone: string; maxAdvanceDays?: number | null },
	now: Date = new Date()
): BookingHorizon => {
	const first = wallDateInTimezone(now, schedule.timezone);
	return { first, last: addDays(first, schedule.maxAdvanceDays ?? DEFAULT_MAX_ADVANCE_DAYS) };
};

export interface DateRange {
	from: string;
	to: string;
}

/** [from, to] split into consecutive ranges of at most `maxDates` dates; none when `to` is earlier */
export const splitDateRange = (
	from: string,
	to: string,
	maxDates: number = MAX_AVAILABLE_DATES_RANGE
): DateRange[] => {
	const ranges: DateRange[] = [];
	for (let start = from; start <= to; start = addDays(start, maxDates)) {
		const end = addDays(start, maxDates - 1);
		ranges.push({ from: start, to: end < to ? end : to });
	}
	return ranges;
};
