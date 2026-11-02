import { afterEach, describe, it, expect, vi } from 'vitest';
import { treaty } from '@elysiajs/eden';
import type { Portfolio } from 'portfolio-api';
import { MAX_AVAILABLE_DATES_RANGE, addDays, daysBetween } from 'portfolio-common';
import type { DateRange } from 'portfolio-common';
import {
	DATES_FAILED,
	SLOTS_FAILED,
	availabilityFailure,
	firstShownDate,
	isUnbookable,
	loadBookableDates,
	toIsoDate
} from '../bookingDates';

// The API's booking horizon of a Paris schedule bookable 30 days ahead, on Monday 7 June 2027
const HORIZON = { first: '2027-06-07', last: '2027-07-07' };

const answer = (dates: string[], horizon = HORIZON) =>
	Promise.resolve({ data: { horizon, dates }, error: null });

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
	afterEach(() => {
		vi.useRealTimers();
	});

	it("asks without a date first: the API's clock sets the horizon, whatever the visitor's says", async () => {
		// A device clock years ahead plays no part
		vi.useFakeTimers({ now: new Date('2031-01-01T00:00:00Z') });
		const fetchRange = vi.fn((range: Partial<DateRange>) => {
			void range;
			return answer(['2027-06-13', '2027-06-07', '2027-06-13']);
		});
		const loaded = await loadBookableDates(fetchRange);

		expect(fetchRange).toHaveBeenCalledTimes(1);
		expect(fetchRange).toHaveBeenCalledWith({});
		expect(loaded).toEqual({ ok: true, horizon: HORIZON, dates: ['2027-06-07', '2027-06-13'] });
	});

	it('reads the answer through Eden, which turns its dates into Date objects', async () => {
		// The web app's client, answered without a server
		const api = treaty<Portfolio>('http://api.test', {
			fetcher: (async () =>
				Response.json({
					horizon: HORIZON,
					dates: ['2027-06-07', '2027-06-13']
				})) as unknown as typeof fetch
		});
		const loaded = await loadBookableDates((range) =>
			api.appointments['available-dates'].get({ query: { scheduleId: 'a'.repeat(24), ...range } })
		);

		expect(loaded).toEqual({ ok: true, horizon: HORIZON, dates: ['2027-06-07', '2027-06-13'] });
		const bookable = new Set(loaded.ok ? loaded.dates : []);
		expect(isUnbookable(bookable)({ year: 2027, month: 6, day: 7 })).toBe(false);
	});

	it('asks for the rest of a long horizon in ranges the API accepts, and merges the dates in order', async () => {
		// A year ahead in Los Angeles: 366 dates, the first 62 in the first answer
		const horizon = { first: '2027-06-06', last: '2028-06-05' };
		const ranges: Partial<DateRange>[] = [];
		const loaded = await loadBookableDates((range) => {
			ranges.push(range);
			const from = range.from ?? horizon.first;
			const to = range.to ?? addDays(from, MAX_AVAILABLE_DATES_RANGE - 1);
			return answer([to, from], horizon);
		});

		expect(ranges[0]).toEqual({});
		const rest = ranges.slice(1) as DateRange[];
		expect(rest[0].from).toBe(addDays(horizon.first, MAX_AVAILABLE_DATES_RANGE));
		expect(rest.at(-1)?.to).toBe(horizon.last);
		expect(ranges).toHaveLength(Math.ceil(366 / MAX_AVAILABLE_DATES_RANGE));
		rest.forEach((range, i) => {
			expect(daysBetween(range.from, range.to) + 1).toBeLessThanOrEqual(MAX_AVAILABLE_DATES_RANGE);
			// Consecutive, without gaps
			const previousEnd =
				i === 0 ? addDays(horizon.first, MAX_AVAILABLE_DATES_RANGE - 1) : rest[i - 1].to;
			expect(range.from).toBe(addDays(previousEnd, 1));
		});
		expect(loaded.ok && loaded.dates).toEqual([
			horizon.first,
			addDays(horizon.first, MAX_AVAILABLE_DATES_RANGE - 1),
			...rest.flatMap((range) => [range.from, range.to])
		]);
	});

	it('keeps the dates inside the horizon of the first answer', async () => {
		// Asked again past midnight, a later range could reach one more date
		let calls = 0;
		const loaded = await loadBookableDates((range) =>
			++calls === 1
				? answer(['2027-06-07'], { first: '2027-06-07', last: '2027-08-08' })
				: answer([range.to ?? '', '2027-08-09'], { first: '2027-06-08', last: '2027-08-09' })
		);
		expect(loaded).toEqual({
			ok: true,
			horizon: { first: '2027-06-07', last: '2027-08-08' },
			dates: ['2027-06-07', '2027-08-08']
		});
	});

	it('fails as a whole when any request fails, or the API cannot be reached', async () => {
		const notConnected = { status: 409, value: 'Google Calendar not connected' };
		let calls = 0;
		const failing = await loadBookableDates(() =>
			++calls === 2
				? Promise.resolve({ data: null, error: notConnected })
				: answer(['2027-06-07'], { first: '2027-06-07', last: '2027-12-24' })
		);
		expect(failing).toEqual({ ok: false, error: notConnected });

		const failingFirst = await loadBookableDates(() =>
			Promise.resolve({ data: null, error: { status: 404, value: 'Schedule not found' } })
		);
		expect(failingFirst).toEqual({
			ok: false,
			error: { status: 404, value: 'Schedule not found' }
		});

		const unreachable = await loadBookableDates(() =>
			Promise.reject(new TypeError('Failed to fetch'))
		);
		expect(unreachable.ok).toBe(false);
	});

	it('reports a schedule with no bookable date as such', async () => {
		const loaded = await loadBookableDates(() => answer([]));
		expect(loaded).toEqual({ ok: true, horizon: HORIZON, dates: [] });
	});
});

describe('firstShownDate', () => {
	it('opens the calendar on the date picked when still bookable, else the first bookable one, else today', () => {
		const dates = ['2027-06-20', '2027-07-05'];
		expect(firstShownDate(dates, HORIZON, '2027-07-05')).toBe('2027-07-05');
		// Booked out meanwhile, or nothing picked
		expect(firstShownDate(dates, HORIZON, '2027-07-06')).toBe('2027-06-20');
		expect(firstShownDate(dates, HORIZON, '')).toBe('2027-06-20');
		expect(firstShownDate([], HORIZON)).toBe('2027-06-07');
	});
});

describe('availabilityFailure', () => {
	it('tells the visitor booking is off when the owner calendar cannot take bookings', () => {
		expect(
			availabilityFailure({ status: 409, value: 'Google Calendar not connected' }, DATES_FAILED)
		).toEqual({
			message: 'Online booking is not available right now. Please reach out directly.',
			reloadSchedules: true,
			retry: false
		});
	});

	it('reloads the schedules when this one is gone', () => {
		expect(availabilityFailure({ status: 404, value: 'Schedule not found' }, SLOTS_FAILED)).toEqual(
			{
				message: 'This meeting type is not available anymore.',
				reloadSchedules: true,
				retry: false
			}
		);
	});

	it("passes on the API's rate limit message, which says how long to wait", () => {
		const limited = {
			status: 429,
			value: 'Too many requests from your network. Try again in 12 minutes'
		};
		expect(availabilityFailure(limited, DATES_FAILED)).toEqual({
			message: limited.value,
			reloadSchedules: false,
			retry: true
		});
	});

	it.each([
		['a server error', { status: 500, value: 'Internal Server Error' }],
		['a network error', { status: undefined, value: new TypeError('Failed to fetch') }],
		['a validation error', { status: 422, value: {} }],
		['a rate limit without its message', { status: 429, value: {} }]
	])('offers to try again after %s', (_, error) => {
		expect(availabilityFailure(error, DATES_FAILED)).toEqual({
			message: DATES_FAILED,
			reloadSchedules: false,
			retry: true
		});
		expect(availabilityFailure(error, SLOTS_FAILED).message).toBe(SLOTS_FAILED);
	});
});
