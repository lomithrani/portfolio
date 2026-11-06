import { afterEach, describe, it, expect } from 'vitest';
import {
	experiencePeriod,
	formatDuration,
	formatMonth,
	formatMonthRange,
	fromMonthKey,
	sortExperiences,
	toMonthKey
} from '../experienceDates';

const utc = (month: string) => new Date(`${month}-01T00:00:00.000Z`);

describe('toMonthKey and fromMonthKey', () => {
	it('reads stored dates in UTC', () => {
		expect(toMonthKey(utc('2024-03'))).toBe('2024-03');
		expect(toMonthKey('2024-03-01T00:00:00.000Z')).toBe('2024-03');
		expect(toMonthKey('2015-12-31T23:59:59.000Z')).toBe('2015-12');
	});

	it('gives nothing for missing or invalid dates', () => {
		expect(toMonthKey(undefined)).toBeUndefined();
		expect(toMonthKey(null)).toBeUndefined();
		expect(toMonthKey('')).toBeUndefined();
		expect(toMonthKey('undefined')).toBeUndefined();
		expect(toMonthKey(new Date(NaN))).toBeUndefined();
	});

	it('builds UTC midnight of the 1st of the month', () => {
		expect(fromMonthKey('2024-03').toISOString()).toBe('2024-03-01T00:00:00.000Z');
		expect(fromMonthKey('1999-12').toISOString()).toBe('1999-12-01T00:00:00.000Z');
		expect(toMonthKey(fromMonthKey('2031-07'))).toBe('2031-07');
	});

	it('gives an Invalid Date for anything but YYYY-MM', () => {
		for (const value of ['', '2024', '2024-', '-03', '2024-13', '2024-00', '2024-3', 'Mar 2024']) {
			expect(Number.isNaN(fromMonthKey(value).getTime())).toBe(true);
		}
	});
});

describe('formatMonth', () => {
	const originalTz = process.env.TZ;
	afterEach(() => {
		process.env.TZ = originalTz;
	});

	it('formats in UTC, whatever the time zone of the visitor', () => {
		process.env.TZ = 'America/New_York';
		const date = new Date('2024-03-01T00:00:00Z');
		// Local time is the evening of February 29th there
		expect(date.getMonth()).toBe(1);
		expect(formatMonth(date)).toBe('Mar 2024');
		expect(formatMonth('2024-03-01T00:00:00Z')).toBe('Mar 2024');
	});

	it('is empty for an invalid date', () => {
		expect(formatMonth('nope')).toBe('');
	});
});

describe('formatMonthRange', () => {
	it('shows an ongoing period as Present', () => {
		expect(formatMonthRange(utc('2024-03'))).toBe('Mar 2024 – Present');
		expect(formatMonthRange(utc('2024-03'), null)).toBe('Mar 2024 – Present');
	});

	it('shows both ends', () => {
		expect(formatMonthRange(utc('2024-03'), utc('2025-06'))).toBe('Mar 2024 – Jun 2025');
		expect(formatMonthRange('2019-01-01T00:00:00.000Z', '2022-12-01T00:00:00.000Z')).toBe(
			'Jan 2019 – Dec 2022'
		);
	});

	it('shows a single month once', () => {
		expect(formatMonthRange(utc('2024-03'), utc('2024-03'))).toBe('Mar 2024');
	});

	it('is empty without a start', () => {
		expect(formatMonthRange()).toBe('');
		expect(formatMonthRange(undefined, utc('2024-03'))).toBe('');
	});
});

describe('formatDuration', () => {
	const now = new Date('2026-11-03T12:00:00Z');

	it('counts months inclusively', () => {
		expect(formatDuration(utc('2024-03'), utc('2024-03'), now)).toBe('1 mo');
		expect(formatDuration(utc('2024-01'), utc('2024-08'), now)).toBe('8 mos');
		expect(formatDuration(utc('2024-01'), utc('2024-12'), now)).toBe('1 yr');
		expect(formatDuration(utc('2022-01'), utc('2024-03'), now)).toBe('2 yrs 3 mos');
		expect(formatDuration(utc('2023-01'), utc('2024-01'), now)).toBe('1 yr 1 mo');
	});

	it('runs until now when there is no end', () => {
		expect(formatDuration(utc('2024-03'), undefined, now)).toBe('2 yrs 9 mos');
	});

	it('is empty without a start or for a start after the end', () => {
		expect(formatDuration(undefined, utc('2024-03'), now)).toBe('');
		expect(formatDuration(utc('2025-03'), utc('2024-03'), now)).toBe('');
	});
});

describe('experiencePeriod', () => {
	it('uses the experience own dates when it has a start', () => {
		expect(
			experiencePeriod({
				start: '2020-01-01T00:00:00.000Z',
				end: '2022-06-01T00:00:00.000Z',
				projects: [{ start: utc('2010-01') }]
			})
		).toEqual({ start: utc('2020-01'), end: utc('2022-06'), ongoing: false });
		expect(experiencePeriod({ start: utc('2020-01') })).toEqual({
			start: utc('2020-01'),
			end: undefined,
			ongoing: true
		});
	});

	it('derives the period from the projects otherwise', () => {
		expect(
			experiencePeriod({
				projects: [
					{ start: utc('2021-04'), end: utc('2022-01') },
					{ start: utc('2019-02'), end: utc('2020-05') },
					{ name: 'undated' } as { start?: Date }
				]
			})
		).toEqual({ start: utc('2019-02'), end: utc('2022-01'), ongoing: false });
	});

	it('is ongoing when a dated project has no end', () => {
		expect(
			experiencePeriod({
				projects: [{ start: utc('2021-04') }, { start: utc('2019-02'), end: utc('2020-05') }]
			})
		).toEqual({ start: utc('2019-02'), ongoing: true });
	});

	it('is undated without any start', () => {
		expect(experiencePeriod({})).toEqual({ ongoing: false });
		expect(experiencePeriod({ end: utc('2020-01'), projects: [{ end: utc('2020-01') }] })).toEqual({
			ongoing: false
		});
	});
});

describe('sortExperiences', () => {
	const exp = (id: string, start?: string, end?: string) => ({
		id,
		start: start ? utc(start) : undefined,
		end: end ? utc(end) : undefined
	});

	it('puts ongoing first, then by end and start, newest first, undated last', () => {
		const sorted = sortExperiences([
			exp('undated-1'),
			exp('old', '2010-01', '2012-01'),
			exp('current-old', '2018-01'),
			exp('recent', '2020-01', '2024-06'),
			exp('current-new', '2023-01'),
			exp('same-end-later-start', '2022-01', '2024-06'),
			exp('undated-2')
		]);
		expect(sorted.map(({ id }) => id)).toEqual([
			'current-new',
			'current-old',
			'same-end-later-start',
			'recent',
			'old',
			'undated-1',
			'undated-2'
		]);
	});

	it('is stable and does not mutate its input', () => {
		const input = [exp('a', '2020-01', '2021-01'), exp('b', '2020-01', '2021-01'), exp('c')];
		const copy = [...input];
		expect(sortExperiences(input).map(({ id }) => id)).toEqual(['a', 'b', 'c']);
		expect(input).toEqual(copy);
	});

	it('sorts by the period derived from projects', () => {
		const sorted = sortExperiences([
			{ id: 'no-dates', projects: [] },
			{ id: 'projects', projects: [{ start: utc('2023-01') }] },
			exp('own', '2019-01', '2020-01')
		]);
		expect(sorted.map(({ id }) => id)).toEqual(['projects', 'own', 'no-dates']);
	});
});
