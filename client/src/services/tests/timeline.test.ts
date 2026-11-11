import { describe, it, expect } from 'vitest';
import { ExperienceType } from 'portfolio-common';
import {
	buildTimeline,
	placeSpan,
	timelineMinWidth,
	viewFromSearchParams,
	viewToSearchParams
} from '../timeline';

const utc = (month: string) => new Date(`${month}-01T00:00:00.000Z`);
/** A month as the timeline counts them: months since year 0 */
const m = (month: string) => {
	const [year, number] = month.split('-').map(Number);
	return year * 12 + number - 1;
};
const NOW = new Date('2026-11-11T10:00:00.000Z');

type Project = { name: string; start?: Date; end?: Date };
type Experience = {
	title: string;
	type: ExperienceType;
	start?: Date;
	end?: Date;
	projects: Project[];
};

const experience = (
	title: string,
	start?: string,
	end?: string,
	projects: Project[] = [],
	type = ExperienceType.Professional
): Experience => ({
	title,
	type,
	start: start ? utc(start) : undefined,
	end: end ? utc(end) : undefined,
	projects
});
const project = (name: string, start?: string, end?: string): Project => ({
	name,
	start: start ? utc(start) : undefined,
	end: end ? utc(end) : undefined
});

const build = (...experiences: Experience[]) => buildTimeline(experiences, NOW);
const laneOf = (timeline: ReturnType<typeof build>, title: string) =>
	timeline.items.find((item) => item.experience.title === title)?.lane;
const itemOf = (timeline: ReturnType<typeof build>, title: string) => {
	const item = timeline.items.find((entry) => entry.experience.title === title);
	if (!item) throw new Error(`No ${title} on the timeline`);
	return item;
};

describe('the view of a URL', () => {
	it('is the timeline only when the URL asks for it', () => {
		expect(viewFromSearchParams(new URLSearchParams('view=timeline'))).toBe('timeline');
		expect(viewFromSearchParams(new URLSearchParams(''))).toBe('list');
		expect(viewFromSearchParams(new URLSearchParams('view=list'))).toBe('list');
		expect(viewFromSearchParams(new URLSearchParams('view=gantt'))).toBe('list');
	});

	it('is written without touching the other parameters, the list leaving none', () => {
		const base = new URLSearchParams('skills=kafka&skills=go');
		expect(viewToSearchParams('timeline', base).toString()).toBe(
			'skills=kafka&skills=go&view=timeline'
		);
		expect(
			viewToSearchParams('list', new URLSearchParams('view=timeline&skills=go')).toString()
		).toBe('skills=go');
		// The base is not modified
		expect(base.toString()).toBe('skills=kafka&skills=go');
	});
});

describe('buildTimeline', () => {
	it('keeps a career that never overlaps on one lane, the earliest first', () => {
		const timeline = build(
			experience('Second', '2020-01', '2022-06'),
			experience('First', '2016-07', '2019-11'),
			experience('Third', '2022-09')
		);

		expect(timeline.lanes).toBe(1);
		expect(timeline.items.map((item) => item.experience.title)).toEqual([
			'First',
			'Second',
			'Third'
		]);
		expect(itemOf(timeline, 'First').span).toEqual({ start: m('2016-07'), end: m('2019-12') });
	});

	it('gives experiences that overlap lanes of their own', () => {
		const timeline = build(
			experience('Job', '2018-01', '2022-12'),
			experience('Side project', '2019-01', '2020-06', [], ExperienceType.Personal),
			experience('Course', '2020-03', '2020-05', [], ExperienceType.Educational)
		);

		expect(timeline.lanes).toBe(3);
		expect(laneOf(timeline, 'Job')).toBe(0);
		expect(laneOf(timeline, 'Side project')).toBe(1);
		expect(laneOf(timeline, 'Course')).toBe(2);
	});

	it('reuses a lane once the experience in it is over', () => {
		const timeline = build(
			experience('Job', '2018-01', '2024-12'),
			experience('Side project', '2019-01', '2020-06', [], ExperienceType.Personal),
			experience('Course', '2021-03', '2021-05', [], ExperienceType.Educational)
		);

		expect(timeline.lanes).toBe(2);
		expect(laneOf(timeline, 'Course')).toBe(1);
	});

	it('puts jobs on the top lanes, whatever started first', () => {
		const timeline = build(
			experience('Studies', '2014-09', '2017-06', [], ExperienceType.Educational),
			experience('Apprenticeship', '2015-09', '2017-06')
		);

		expect(laneOf(timeline, 'Apprenticeship')).toBe(0);
		expect(laneOf(timeline, 'Studies')).toBe(1);
	});

	it('takes a job ending the month the next one starts as a handoff, not an overlap', () => {
		const timeline = build(
			experience('Before', '2018-09', '2022-03'),
			experience('After', '2022-03')
		);

		expect(timeline.lanes).toBe(1);
		// Drawn up to the start of the next one
		expect(itemOf(timeline, 'Before').span.end).toBe(m('2022-03'));
		expect(itemOf(timeline, 'After').span.start).toBe(m('2022-03'));
	});

	it('does not hand off when that would leave nothing of the first one', () => {
		// Both are the same single month
		expect(
			build(experience('A', '2022-03', '2022-03'), experience('B', '2022-03', '2022-03')).lanes
		).toBe(2);
		// A project of the first one lies entirely in the shared month
		const timeline = build(
			experience('Before', '2018-09', '2022-03', [project('Handover', '2022-03', '2022-03')]),
			experience('After', '2022-03')
		);
		expect(timeline.lanes).toBe(2);
		expect(itemOf(timeline, 'Before').projects[0].span).toEqual({
			start: m('2022-03'),
			end: m('2022-04')
		});
	});

	it('runs what is ongoing to the current month', () => {
		const timeline = build(
			experience('Job', '2022-03', undefined, [
				project('Done', '2022-03', '2023-08'),
				project('Current', '2025-01')
			])
		);
		const job = itemOf(timeline, 'Job');

		expect(job.ongoing).toBe(true);
		expect(job.span).toEqual({ start: m('2022-03'), end: m('2026-12') });
		expect(job.projects.map((entry) => entry.ongoing)).toEqual([false, true]);
		expect(job.projects[1].span.end).toBe(m('2026-12'));
		expect(timeline.today).toBe(m('2026-12'));
	});

	it('has no current month to show when everything is over', () => {
		expect(build(experience('Job', '2018-01', '2020-12')).today).toBeUndefined();
	});

	it('gives overlapping projects rows of their own inside their experience', () => {
		const timeline = build(
			experience('Job', '2018-09', '2022-06', [
				project('API', '2018-09', '2020-06'),
				project('Pipeline', '2020-01', '2022-03'),
				project('Migration', '2020-06', '2021-01'),
				project('Wrap-up', '2022-04', '2022-06')
			])
		);
		const job = itemOf(timeline, 'Job');
		const rows = Object.fromEntries(job.projects.map((entry) => [entry.project.name, entry.row]));

		expect(job.projectRows).toBe(2);
		// Migration starts the month API ends (a handoff); Wrap-up fits the first row again
		expect(rows).toEqual({ API: 0, Pipeline: 1, Migration: 0, 'Wrap-up': 0 });
		expect(job.projects[0].span.end).toBe(m('2020-06'));
		// Projects keep their position in the experience
		expect(job.projects.map((entry) => entry.index)).toEqual([0, 1, 2, 3]);
	});

	it('draws a project without dates over its whole experience', () => {
		const job = itemOf(build(experience('Job', '2020-09', '2023-06', [project('Budget')])), 'Job');

		expect(job.projects[0]).toMatchObject({
			undated: true,
			ongoing: false,
			span: { start: m('2020-09'), end: m('2023-07') }
		});
	});

	it('stops a project without an end with its experience, when that one ended', () => {
		const job = itemOf(
			build(experience('Job', '2018-01', '2020-12', [project('Left open', '2019-06')])),
			'Job'
		);

		expect(job.projects[0]).toMatchObject({
			ongoing: false,
			span: { start: m('2019-06'), end: m('2021-01') }
		});
	});

	it('gives one month to a project without an end that starts after its experience ended', () => {
		const job = itemOf(
			build(experience('Job', '2018-01', '2020-12', [project('Afterthought', '2021-03')])),
			'Job'
		);

		expect(job.projects[0]).toMatchObject({
			ongoing: false,
			span: { start: m('2021-03'), end: m('2021-04') }
		});
		expect(
			build(experience('Job', '2018-01', '2020-12', [project('Afterthought', '2021-03')])).today
		).toBeUndefined();
	});

	it('starts a project that only has an end with its experience', () => {
		const job = itemOf(
			build(experience('Job', '2020-09', undefined, [project('Handover', undefined, '2021-02')])),
			'Job'
		);

		expect(job.projects[0]).toMatchObject({
			undated: true,
			ongoing: false,
			span: { start: m('2020-09'), end: m('2021-03') }
		});
	});

	it('gives its first month to what is ongoing but starts later', () => {
		const later = experience('Next job', '2027-03');
		const alone = build(later);
		expect(itemOf(alone, 'Next job').span).toEqual({ start: m('2027-03'), end: m('2027-04') });
		// The current month is before the axis: no line for it
		expect([alone.start, alone.end]).toEqual([m('2027-01'), m('2028-01')]);
		expect(alone.today).toBeUndefined();

		// With something running now, the line is on the axis and the later job after it
		const both = build(experience('Job', '2024-01'), later);
		expect(both.today).toBe(m('2026-12'));
		expect(itemOf(both, 'Next job').span.start).toBeGreaterThan(both.today!);
	});

	it('widens an experience to the projects that run past its own dates', () => {
		const job = itemOf(
			build(experience('Job', '2019-01', '2020-12', [project('Early', '2018-10', '2019-03')])),
			'Job'
		);

		expect(job.span).toEqual({ start: m('2019-01'), end: m('2021-01') });
		expect(job.extent).toEqual({ start: m('2018-10'), end: m('2021-01') });
	});

	it('takes the period of an experience without dates from its projects', () => {
		const job = itemOf(
			build(
				experience('Freelance', undefined, undefined, [
					project('One', '2019-02', '2019-08'),
					project('Two', '2021-01', '2021-04')
				])
			),
			'Freelance'
		);

		expect(job.span).toEqual({ start: m('2019-02'), end: m('2021-05') });
	});

	it('lists apart the experiences without any date', () => {
		const dated = experience('Job', '2018-01', '2020-12');
		const undated = experience('Hackathons', undefined, undefined, [project('Prototypes')]);
		const timeline = build(undated, dated);

		expect(timeline.items.map((item) => item.experience)).toEqual([dated]);
		expect(timeline.undated).toEqual([undated]);
	});

	it('survives an end before the start', () => {
		const job = itemOf(build(experience('Job', '2020-06', '2020-01')), 'Job');

		expect(job.span).toEqual({ start: m('2020-06'), end: m('2020-07') });
	});

	it('spans whole years, labelled so that the labels keep some room', () => {
		const short = build(experience('Job', '2018-03', '2020-11'));
		expect([short.start, short.end]).toEqual([m('2018-01'), m('2021-01')]);
		expect(short.years).toEqual([
			{ year: 2018, month: m('2018-01'), labelled: true },
			{ year: 2019, month: m('2019-01'), labelled: true },
			{ year: 2020, month: m('2020-01'), labelled: true }
		]);

		const long = build(experience('Job', '2001-03', '2020-11'));
		expect(long.years).toHaveLength(20);
		expect(long.years.filter((year) => year.labelled).map((year) => year.year)).toEqual([
			2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020
		]);
	});

	it('keeps the year lines few, however far apart the dates are', () => {
		const century = build(experience('Job', '1901-03', '2020-11'));
		expect(century.years.map((year) => year.year)).toEqual([
			1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020
		]);
		expect(century.years.every((year) => year.labelled)).toBe(true);

		const absurd = build(experience('Typo', '0100-01', '9999-12'));
		expect(absurd.years.length).toBeLessThanOrEqual(13);
		expect(absurd.years[0]).toEqual({ year: 1000, month: 12000, labelled: true });
	});

	it('is empty without dated experiences', () => {
		expect(build()).toEqual({ start: 0, end: 0, years: [], lanes: 0, items: [], undated: [] });
	});
});

describe('placeSpan', () => {
	it('gives the place of a span inside another as percentages', () => {
		const year = { start: m('2020-01'), end: m('2021-01') };
		expect(placeSpan({ start: m('2020-04'), end: m('2020-07') }, year)).toEqual({
			left: '25%',
			width: '25%'
		});
		expect(placeSpan(year, year)).toEqual({ left: '0%', width: '100%' });
		expect(placeSpan({ start: m('2020-02'), end: m('2020-03') }, year)).toEqual({
			left: '8.3333%',
			width: '8.3333%'
		});
	});

	it('does not divide by an empty span', () => {
		expect(placeSpan({ start: 5, end: 5 }, { start: 5, end: 5 })).toEqual({
			left: '0%',
			width: '0%'
		});
	});
});

describe('timelineMinWidth', () => {
	it('is 10 px a month for short careers', () => {
		expect(timelineMinWidth(36)).toBe(360);
		expect(timelineMinWidth(108)).toBe(1080);
	});

	it('squeezes longer careers into a desktop page, never under 5 px a month', () => {
		expect(timelineMinWidth(156)).toBe(1100);
		expect(timelineMinWidth(220)).toBe(1100);
		expect(timelineMinWidth(480)).toBe(2400);
	});

	it('is nothing without months', () => {
		expect(timelineMinWidth(0)).toBe(0);
	});
});
