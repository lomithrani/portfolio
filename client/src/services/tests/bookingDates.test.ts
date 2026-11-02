import { describe, it, expect, vi } from 'vitest';
import { treaty } from '@elysiajs/eden';
import type { Portfolio } from 'portfolio-api';
import { MAX_AVAILABLE_DATES_RANGE, daysBetween } from 'portfolio-common';
import type { DateRange } from 'portfolio-common';
import {
	bookableDatesFailure,
	firstShownDate,
	isUnbookable,
	loadBookableDates,
	toIsoDate
} from '../bookingDates';

// Monday 7 June 2027, 01:30 in Paris (still Sunday 6 June in UTC)
const NOW = new Date('2027-06-06T23:30:00Z');
const PARIS = { timezone: 'Europe/Paris', maxAdvanceDays: 30 };

const answer = (data: string[]) => Promise.resolve({ data, error: null });

describe('toIsoDate and isUnbookable', () => {
	it('writes date picker dates as the API does', () => {
		expect(toIsoDate({ year: 2027, month: 6, day: 7 })).toBe('2027-06-07');
		expect(toIsoDate({ year: 2027, month: 12, day: 31 })).toBe('2027-12-31');
	});

	it('greys out every date the API did not list', () => {
		const unbookable = isUnbookable(new Set(['2027-06-07', '2027-06-13']));
		expect(unbookable({ year: 2027, month: 6, day: 7 })).toBe(false);
		expect(unbookable({ year: 2027, month: 6, day: 13 })).toBe(false);
		// The Tuesday between, and the same day of another month or year
		expect(unbookable({ year: 2027, month: 6, day: 8 })).toBe(true);
		expect(unbookable({ year: 2027, month: 7, day: 7 })).toBe(true);
		expect(unbookable({ year: 2028, month: 6, day: 7 })).toBe(true);
		// Before any answer: nothing can be picked
		expect(isUnbookable(new Set())({ year: 2027, month: 6, day: 7 })).toBe(true);
	});
});

describe('loadBookableDates', () => {
	it('asks for the horizon of the schedule, from today in its time zone', async () => {
		const fetchRange = vi.fn((range: DateRange) => {
			void range;
			return answer(['2027-06-13', '2027-06-07']);
		});
		const loaded = await loadBookableDates(PARIS, fetchRange, NOW);

		expect(fetchRange).toHaveBeenCalledTimes(1);
		expect(fetchRange).toHaveBeenCalledWith({ from: '2027-06-07', to: '2027-07-07' });
		expect(loaded).toEqual({
			ok: true,
			horizon: { first: '2027-06-07', last: '2027-07-07' },
			dates: ['2027-06-07', '2027-06-13']
		});
	});

	it('reads the dates through Eden, which turns them into Date objects', async () => {
		// The web app's client, answered without a server
		const api = treaty<Portfolio>('http://api.test', {
			fetcher: (async () => Response.json(['2027-06-07', '2027-06-13'])) as unknown as typeof fetch
		});
		const loaded = await loadBookableDates(
			PARIS,
			(range) =>
				api.appointments['available-dates'].get({
					query: { scheduleId: 'a'.repeat(24), ...range }
				}),
			NOW
		);

		expect(loaded).toMatchObject({ ok: true, dates: ['2027-06-07', '2027-06-13'] });
		const bookable = new Set(loaded.ok ? loaded.dates : []);
		expect(isUnbookable(bookable)({ year: 2027, month: 6, day: 7 })).toBe(false);
	});

	it('splits a long horizon into ranges the API accepts, and merges their dates in order', async () => {
		const ranges: DateRange[] = [];
		const loaded = await loadBookableDates(
			{ timezone: 'America/Los_Angeles', maxAdvanceDays: 365 },
			(range) => {
				ranges.push(range);
				return answer([range.to, range.from]);
			},
			NOW
		);

		// Still Sunday 6 June in Los Angeles: 366 dates
		expect(ranges[0].from).toBe('2027-06-06');
		expect(ranges.at(-1)?.to).toBe('2028-06-05');
		expect(ranges).toHaveLength(Math.ceil(366 / MAX_AVAILABLE_DATES_RANGE));
		for (const range of ranges) {
			expect(daysBetween(range.from, range.to) + 1).toBeLessThanOrEqual(MAX_AVAILABLE_DATES_RANGE);
		}
		expect(loaded.ok && loaded.dates).toEqual(ranges.flatMap((range) => [range.from, range.to]));
	});

	it('fails as a whole when any range fails, or the API cannot be reached', async () => {
		let calls = 0;
		const failing = await loadBookableDates(
			{ ...PARIS, maxAdvanceDays: 200 },
			() =>
				++calls === 2
					? Promise.resolve({
							data: null,
							error: { status: 409, value: 'Google Calendar not connected' }
						})
					: answer(['2027-06-07']),
			NOW
		);
		expect(failing).toEqual({
			ok: false,
			horizon: { first: '2027-06-07', last: '2027-12-24' },
			error: { status: 409, value: 'Google Calendar not connected' }
		});

		const unreachable = await loadBookableDates(
			PARIS,
			() => Promise.reject(new TypeError('Failed to fetch')),
			NOW
		);
		expect(unreachable.ok).toBe(false);
	});

	it('reports a schedule with no bookable date as such', async () => {
		const loaded = await loadBookableDates(PARIS, () => answer([]), NOW);
		expect(loaded).toMatchObject({ ok: true, dates: [] });
	});
});

describe('firstShownDate', () => {
	const horizon = { first: '2027-06-07', last: '2027-07-07' };

	it('opens the calendar on the first bookable date, else on today', () => {
		expect(firstShownDate(['2027-06-20', '2027-06-21'], horizon)).toBe('2027-06-20');
		expect(firstShownDate([], horizon)).toBe('2027-06-07');
	});
});

describe('bookableDatesFailure', () => {
	it('tells the visitor booking is off when the owner calendar cannot take bookings', () => {
		expect(bookableDatesFailure({ status: 409, value: 'Google Calendar not connected' })).toEqual({
			message: 'Online booking is not available right now. Please reach out directly.',
			reloadSchedules: true
		});
	});

	it('reloads the schedules when this one is gone', () => {
		expect(bookableDatesFailure({ status: 404, value: 'Schedule not found' }).reloadSchedules).toBe(
			true
		);
	});

	it.each([
		['a server error', { status: 500, value: 'Internal Server Error' }],
		['a network error', { status: undefined, value: new TypeError('Failed to fetch') }],
		['a validation error', { status: 422, value: {} }]
	])('offers to try again after %s', (_, error) => {
		expect(bookableDatesFailure(error)).toEqual({
			message: "We couldn't load the available dates. Please try again.",
			reloadSchedules: false
		});
	});
});
