import { afterEach, describe, it, expect } from 'vitest';
import { withLocale } from 'portfolio-common';
import {
	experiencePeriod,
	formatDuration,
	formatMonth,
	formatMonthCount,
	formatMonthRange,
	formatProjectMonths,
	formatShortDuration,
	fromMonthKey,
	projectEnd,
	reviveExperienceDates,
	sortExperiences,
	toMonthKey
} from '../experienceDates';

const utc = (month: string) => new Date(`${month}-01T00:00:00.000Z`);

describe('projectEnd and formatProjectMonths', () => {
	const ended = { start: utc('2018-01'), end: utc('2020-12'), ongoing: false };
	const ongoing = { start: utc('2018-01'), ongoing: true };

	it('keeps a project’s own end', () => {
		const project = { start: utc('2019-06'), end: utc('2019-09') };
		expect(projectEnd(project, ended)).toEqual(utc('2019-09'));
		expect(projectEnd(project, ongoing)).toEqual(utc('2019-09'));
		expect(formatProjectMonths(project, ended)).toBe('Jun 2019 – Sep 2019');
	});

	it('is ongoing without an end while its experience is', () => {
		expect(projectEnd({ start: utc('2019-06') }, ongoing)).toBeUndefined();
		expect(formatProjectMonths({ start: '2019-06-01T00:00:00.000Z' }, ongoing)).toBe(
			'Jun 2019 – Present'
		);
	});

	it('stops without an end with its experience, when that one ended', () => {
		expect(projectEnd({ start: utc('2019-06') }, ended)).toEqual(utc('2020-12'));
		expect(formatProjectMonths({ start: utc('2019-06'), end: null }, ended)).toBe(
			'Jun 2019 – Dec 2020'
		);
	});

	it('never ends before it began: one month when it starts after its experience ended', () => {
		expect(projectEnd({ start: utc('2021-03') }, ended)).toEqual(utc('2021-03'));
		expect(formatProjectMonths({ start: utc('2021-03') }, ended)).toBe('Mar 2021');
	});

	it('has no months without a start, and no end of its own in an experience without dates', () => {
		expect(formatProjectMonths({ end: utc('2019-09') }, ended)).toBe('');
		expect(formatProjectMonths({}, ongoing)).toBe('');
		expect(projectEnd({ start: utc('2019-06') }, { ongoing: false })).toBeUndefined();
	});
});

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

describe('formatMonthCount', () => {
	it('writes years and months in full words', () => {
		expect(formatMonthCount(1)).toBe('1 month');
		expect(formatMonthCount(3)).toBe('3 months');
		expect(formatMonthCount(12)).toBe('1 year');
		expect(formatMonthCount(13)).toBe('1 year 1 month');
		expect(formatMonthCount(62)).toBe('5 years 2 months');
		expect(formatMonthCount(120)).toBe('10 years');
	});

	it('is empty under a month', () => {
		expect(formatMonthCount(0)).toBe('');
		expect(formatMonthCount(-4)).toBe('');
		expect(formatMonthCount(NaN)).toBe('');
	});
});

describe('formatShortDuration', () => {
	const text = formatShortDuration;

	it('writes whole years from a year on, months under it', () => {
		expect(text(1)).toBe('1 mo');
		expect(text(11)).toBe('11 mos');
		expect(text(12)).toBe('1 yr');
		expect(text(23)).toBe('1 yr');
		expect(text(24)).toBe('2 yrs');
		expect(text(111)).toBe('9 yrs');
	});

	it("is in the page's language", () => {
		const french = (months: number) => withLocale('fr', () => formatShortDuration(months));
		expect(french(1)).toBe('1 mois');
		expect(french(12)).toBe('1 an');
		expect(french(40)).toBe('3 ans');
	});

	it('is empty under a month', () => {
		expect(formatShortDuration(0)).toBe('');
		expect(formatShortDuration(-4)).toBe('');
		expect(formatShortDuration(NaN)).toBe('');
	});
});

describe('reviveExperienceDates', () => {
	// What GET /domain/:name sends, read without Eden Treaty's date parsing
	const answer = () => ({
		name: 'jane.doe',
		headerTitle: '2027-01-01',
		headerSubtitle: '01-09-2024',
		experiences: [
			{
				_id: 'e1',
				title: '2020-03',
				summary: '2024 05 12',
				location: '2021-06-01',
				company: { name: '2019-01-01' },
				start: '2020-03-01T00:00:00.000Z',
				end: '2021-06-01T00:00:00.000Z',
				projects: [
					{
						name: '2020-04',
						summary: 'Shipped on 2020-05-01',
						start: '2020-04-01T00:00:00.000Z',
						hardSkills: [{ skill: { displayName: '2020' }, level: -1 }],
						softSkills: []
					}
				]
			},
			{ _id: 'e2', title: 'Undated', summary: '', projects: [] }
		]
	});

	it('turns only the start and end of experiences and projects into Dates', () => {
		const domain = reviveExperienceDates(answer());
		const [dated, undated] = domain.experiences;

		expect(dated.start).toEqual(utc('2020-03'));
		expect(dated.end).toEqual(utc('2021-06'));
		expect(dated.projects[0].start).toEqual(utc('2020-04'));
		expect(dated.projects[0]).not.toHaveProperty('end');
		expect(undated).not.toHaveProperty('start');
		expect(undated).not.toHaveProperty('end');
	});

	it('leaves every text as its owner wrote it, even one that looks like a date', () => {
		const domain = reviveExperienceDates(answer());
		const [experience] = domain.experiences;

		expect(domain.headerTitle).toBe('2027-01-01');
		expect(domain.headerSubtitle).toBe('01-09-2024');
		expect(experience.title).toBe('2020-03');
		expect(experience.summary).toBe('2024 05 12');
		expect(experience.location).toBe('2021-06-01');
		expect(experience.company).toEqual({ name: '2019-01-01' });
		expect(experience.projects[0].name).toBe('2020-04');
		expect(experience.projects[0].summary).toBe('Shipped on 2020-05-01');
		expect(experience.projects[0].hardSkills[0].skill.displayName).toBe('2020');
	});

	it('gives dates the pages read and sort as before', () => {
		const domain = reviveExperienceDates(answer());
		const [first, second] = sortExperiences(domain.experiences);

		expect(first.title).toBe('2020-03');
		expect(second.title).toBe('Undated');
		expect(formatMonthRange(first.start, first.end)).toBe('Mar 2020 – Jun 2021');
	});

	it('drops a date that cannot be read, and keeps Dates already parsed', () => {
		const start = utc('2022-02');
		const domain = reviveExperienceDates({
			experiences: [{ start, end: 'not a date', projects: [{ start: null, end: '' }] }]
		});

		expect(domain.experiences[0].start).toBe(start);
		expect(domain.experiences[0]).not.toHaveProperty('end');
		expect(domain.experiences[0].projects[0]).toEqual({});
	});

	it('does not change what it was given', () => {
		const original = answer();
		reviveExperienceDates(original);
		expect(original).toEqual(answer());
	});

	it('returns a portfolio without experiences as it is', () => {
		const domain = { name: 'empty', experiences: null };
		expect(reviveExperienceDates(domain)).toBe(domain);
	});
});
