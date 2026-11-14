import { describe, it, expect } from 'vitest';
import { ExperienceType } from 'portfolio-common';
import {
	buildTimeline,
	closestMonthWidth,
	defaultMonthWidth,
	placeSpan,
	projectMonthSpan,
	shortestBarMonths,
	timelineAxis,
	timelineTicks,
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

describe('timelineAxis', () => {
	it('spans the whole years around the spans it is given', () => {
		expect(
			timelineAxis([
				{ start: m('2019-06'), end: m('2020-12') },
				{ start: m('2018-03'), end: m('2019-02') }
			])
		).toEqual({
			start: m('2018-01'),
			end: m('2021-01'),
			years: [
				{ year: 2018, month: m('2018-01'), labelled: true },
				{ year: 2019, month: m('2019-01'), labelled: true },
				{ year: 2020, month: m('2020-01'), labelled: true }
			]
		});
	});

	it('labels fewer years when asked to: a small timeline has room for a few', () => {
		const axis = timelineAxis([{ start: m('2016-01'), end: m('2025-01') }], 5);
		expect(axis.years).toHaveLength(9);
		expect(axis.years.filter((year) => year.labelled).map((year) => year.year)).toEqual([
			2016, 2018, 2020, 2022, 2024
		]);
	});

	it('is empty without spans', () => {
		expect(timelineAxis([])).toEqual({ start: 0, end: 0, years: [] });
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

describe('projectMonthSpan', () => {
	it('is every month of the project, its last one included', () => {
		const job = experience('Job', '2020-01', '2022-12');
		expect(projectMonthSpan(project('Short', '2021-03', '2021-05'), job, NOW)).toEqual({
			start: m('2021-03'),
			end: m('2021-06')
		});
	});

	it('keeps the months the timeline cuts off a bar at a handoff', () => {
		const first = project('First', '2021-01', '2021-03');
		const job = experience('Job', '2020-01', '2022-12', [first, project('Next', '2021-03')]);

		expect(itemOf(build(job), 'Job').projects[0].span.end).toBe(m('2021-03'));
		expect(projectMonthSpan(first, job, NOW)?.end).toBe(m('2021-04'));
	});

	it('follows the experience for what the project does not say', () => {
		const ended = experience('Ended', '2018-01', '2020-12');
		const ongoing = experience('Ongoing', '2025-01');

		// No end: it stopped with its experience, or runs to the current month
		expect(projectMonthSpan(project('Open', '2019-06'), ended, NOW)?.end).toBe(m('2021-01'));
		expect(projectMonthSpan(project('Open', '2025-06'), ongoing, NOW)?.end).toBe(m('2026-12'));
		// No start: it began with its experience
		expect(projectMonthSpan(project('Undated'), ended, NOW)).toEqual({
			start: m('2018-01'),
			end: m('2021-01')
		});
	});

	it('is nothing in an experience without dates', () => {
		expect(projectMonthSpan(project('Undated'), experience('Undated'), NOW)).toBeUndefined();
	});
});

describe('the zoom the timeline opens with', () => {
	it('makes the shortest bar 120 px wide', () => {
		const timeline = build(
			experience('Job', '2016-01', '2025-12', [
				project('Long', '2016-01', '2020-12'),
				project('Sprint', '2021-03', '2021-04')
			])
		);

		expect(shortestBarMonths(timeline)).toBe(2);
		expect(defaultMonthWidth(timeline)).toBe(60);
	});

	it('counts the experiences too: one without projects is a bar to read', () => {
		const timeline = build(
			experience('Course', '2019-05', '2019-05'),
			experience('Job', '2020-01', '2022-12', [project('Long', '2020-01', '2022-12')])
		);

		expect(shortestBarMonths(timeline)).toBe(1);
		expect(defaultMonthWidth(timeline)).toBe(120);
	});

	it('is far when every bar is long (the page stretches a short axis)', () => {
		const timeline = build(experience('Job', '2010-01', '2019-12'));

		expect(shortestBarMonths(timeline)).toBe(120);
		expect(defaultMonthWidth(timeline)).toBe(1);
	});

	it('never opens wider than the widest axis allows', () => {
		const timeline = build(
			experience('Then', '1950-01', '1950-01'),
			experience('Now', '2026-01', '2026-01')
		);
		const months = timeline.end - timeline.start;

		expect(closestMonthWidth(months)).toBeCloseTo(48_000 / months);
		expect(defaultMonthWidth(timeline)).toBeCloseTo(48_000 / months);
	});

	it('is nothing when nothing is drawn', () => {
		expect(shortestBarMonths(build())).toBe(0);
		expect(defaultMonthWidth(build())).toBe(0);
		expect(closestMonthWidth(0)).toBe(0);
	});

	it('closes in up to 240 px a month', () => {
		expect(closestMonthWidth(120)).toBe(240);
		expect(closestMonthWidth(480)).toBe(100);
	});
});

describe('timelineTicks', () => {
	const axis = { start: m('2024-01'), end: m('2026-01') };
	const labels = (monthWidth: number, over = axis) =>
		timelineTicks(over, monthWidth)
			.filter((tick) => tick.label)
			.map((tick) => tick.label);

	it('names every month when a month is wide enough, Januaries by their year', () => {
		const ticks = timelineTicks(axis, 80);

		expect(ticks).toHaveLength(24);
		expect(ticks.slice(0, 3)).toEqual([
			{ month: m('2024-01'), label: '2024', year: true },
			{ month: m('2024-02'), label: 'Feb 2024', year: false },
			{ month: m('2024-03'), label: 'Mar 2024', year: false }
		]);
	});

	it('steps back to quarters, half-years and years as the zoom goes out', () => {
		expect(labels(60)).toEqual([
			'2024',
			'Apr 2024',
			'Jul 2024',
			'Oct 2024',
			'2025',
			'Apr 2025',
			'Jul 2025',
			'Oct 2025'
		]);
		expect(labels(20)).toEqual(['2024', 'Jul 2024', '2025', 'Jul 2025']);
		expect(labels(8)).toEqual(['2024', '2025']);
	});

	it('labels round years on a long axis, the others keeping a line while there is room', () => {
		const long = { start: m('2000-01'), end: m('2026-01') };

		expect(labels(2, long)).toEqual(['2000', '2005', '2010', '2015', '2020', '2025']);
		// 24 px a year: a line each
		expect(timelineTicks(long, 2)).toHaveLength(26);
		// 6 px a year: only the labelled ones
		expect(timelineTicks(long, 0.5).map((tick) => tick.label)).toEqual(['2000', '2020']);
	});

	it('is nothing without an axis or a width', () => {
		expect(timelineTicks({ start: 0, end: 0 }, 60)).toEqual([]);
		expect(timelineTicks(axis, 0)).toEqual([]);
	});
});
