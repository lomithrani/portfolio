import { ExperienceType } from 'portfolio-common';
import { experiencePeriod, monthIndex, toDate } from '#services/experienceDates.ts';

// The timeline view of the experiences page: experiences and their projects as bars over a
// time axis. Everything has month precision (see experienceDates.ts) and is counted in months
// since year 0, so the layout is plain arithmetic the server and the browser agree on.

/** The views of the experiences page; the list is the default */
export type ExperienceView = 'list' | 'timeline';

/** URLSearchParams, or the read-only ones of SvelteKit's `page.url` */
type ReadableSearchParams = Pick<URLSearchParams, 'get' | 'toString'>;

/** View of a URL: `?view=timeline`, anything else is the list */
export function viewFromSearchParams(params: ReadableSearchParams): ExperienceView {
	return params.get('view') === 'timeline' ? 'timeline' : 'list';
}

/** `base` with its view parameter set for this view (other parameters are kept) */
export function viewToSearchParams(
	view: ExperienceView,
	base: ReadableSearchParams
): URLSearchParams {
	const params = new URLSearchParams(base.toString());
	if (view === 'timeline') params.set('view', 'timeline');
	else params.delete('view');
	return params;
}

type Dated = { start?: Date | string | null; end?: Date | string | null };
type SourceProject = Dated;
type SourceExperience = Dated & { type?: ExperienceType; projects?: SourceProject[] | null };

/** Months `start` to `end`, `end` excluded: Jan to Mar 2024 is { start: Jan, end: Apr } */
export type MonthSpan = { start: number; end: number };

export type TimelineProject<P> = {
	project: P;
	/** Its position in the experience's projects */
	index: number;
	span: MonthSpan;
	ongoing: boolean;
	/** No start of its own: drawn over its experience's whole period */
	undated: boolean;
	/** Row inside its experience: projects that overlap get rows of their own */
	row: number;
};

export type TimelineExperience<E, P> = {
	experience: E;
	/** The experience's own period */
	span: MonthSpan;
	/** Its period and its projects': what the experience takes of its lane */
	extent: MonthSpan;
	ongoing: boolean;
	/** Lane of the timeline: experiences that overlap get lanes of their own */
	lane: number;
	projects: TimelineProject<P>[];
	projectRows: number;
};

export type TimelineYear = { year: number; month: number; labelled: boolean };

export type Timeline<E, P> = {
	/** The axis: whole years around everything drawn (both 0 when nothing is dated) */
	start: number;
	end: number;
	years: TimelineYear[];
	/** Where ongoing bars end (the month after the current one), when something is ongoing */
	today?: number;
	lanes: number;
	/** Dated experiences, the earliest first */
	items: TimelineExperience<E, P>[];
	/** Experiences without any date, in their order: they cannot be placed */
	undated: E[];
};

/**
 * An interval to place: months `start` to `last`, both included. `floor` is the last month
 * something starts inside it (its own start when it holds nothing).
 */
type Placed = { start: number; last: number; floor: number };

/**
 * `a` then `b` can share a row: `b` starts after `a`, or in `a`'s last month (a handoff: one job
 * ends the month the next starts, which month precision cannot tell from one following the
 * other). In a handoff `a` is drawn up to `b`'s start, so everything in `a` must start before it.
 */
const follows = (a: Placed, b: Placed) => a.last <= b.start && a.floor < b.start;

/**
 * Rows for intervals, taken in `order`: each goes in the first row where it overlaps nothing.
 * Returns the row of each interval, and the row count.
 */
function packRows(intervals: Placed[], order: number[]): { rows: number[]; count: number } {
	const placed: Placed[][] = [];
	const rows = new Array<number>(intervals.length).fill(0);
	for (const index of order) {
		const interval = intervals[index];
		let row = placed.findIndex((others) =>
			others.every((other) => follows(other, interval) || follows(interval, other))
		);
		if (row === -1) row = placed.push([]) - 1;
		placed[row].push(interval);
		rows[index] = row;
	}
	return { rows, count: placed.length };
}

/**
 * The month each interval is drawn up to (excluded): the month after its last, or the start of
 * the interval that takes over from it in the same row (see `follows`).
 */
function drawnEnds(intervals: Placed[], rows: number[]): number[] {
	return intervals.map((interval, index) => {
		let end = interval.last + 1;
		intervals.forEach((other, otherIndex) => {
			if (otherIndex === index || rows[otherIndex] !== rows[index]) return;
			if (other.start > interval.start && other.start < end) end = other.start;
		});
		return end;
	});
}

const byStartThenLength = (intervals: Placed[]) => (a: number, b: number) =>
	intervals[a].start - intervals[b].start || intervals[b].last - intervals[a].last || a - b;

/** Years to label so the labels keep some room: every year up to 12, then every 2, 5 or 10 */
const yearStep = (years: number) => (years <= 12 ? 1 : years <= 24 ? 2 : years <= 60 ? 5 : 10);

/**
 * Lays the experiences out over time.
 *
 * - An experience without a start takes its period from its projects; without any date it is
 *   listed apart (`undated`).
 * - An ongoing experience or project runs to the current month. A project without an end stops
 *   with its experience when that one ended; a project without a start covers its experience.
 * - Experiences that overlap get lanes of their own (jobs first, so a career stays on the top
 *   lane), and so do overlapping projects inside an experience. Ending the month the next one
 *   starts is not an overlap.
 */
export function buildTimeline<E extends SourceExperience>(
	experiences: E[],
	now: Date = new Date()
): Timeline<E, NonNullable<E['projects']>[number]> {
	type P = NonNullable<E['projects']>[number];
	const nowMonth = monthIndex(now);

	const undated: E[] = [];
	const drafts: {
		experience: E;
		own: Placed;
		ongoing: boolean;
		projects: { project: P; index: number; placed: Placed; ongoing: boolean; undated: boolean }[];
	}[] = [];

	for (const experience of experiences) {
		const period = experiencePeriod(experience);
		if (!period.start) {
			undated.push(experience);
			continue;
		}
		const start = monthIndex(period.start);
		const last = Math.max(
			start,
			period.ongoing ? nowMonth : period.end ? monthIndex(period.end) : start
		);

		const projects = (experience.projects ?? []).map((project: P, index) => {
			const projectStart = toDate(project.start);
			if (!projectStart) {
				return {
					project,
					index,
					placed: { start, last, floor: start },
					ongoing: period.ongoing,
					undated: true
				};
			}
			const from = monthIndex(projectStart);
			const projectEnd = toDate(project.end);
			// No end: ongoing, unless its experience ended (then it stopped with it)
			const ongoing = !projectEnd && (period.ongoing || last < from);
			const to = projectEnd ? monthIndex(projectEnd) : ongoing ? nowMonth : last;
			return {
				project,
				index,
				placed: { start: from, last: Math.max(from, to), floor: from },
				ongoing,
				undated: false
			};
		});

		drafts.push({
			experience,
			own: { start, last, floor: start },
			ongoing: period.ongoing,
			projects
		});
	}

	// What each experience takes of its lane: its own period and its projects'
	const extents: Placed[] = drafts.map(({ own, projects }) => ({
		start: Math.min(own.start, ...projects.map(({ placed }) => placed.start)),
		last: Math.max(own.last, ...projects.map(({ placed }) => placed.last)),
		floor: Math.max(own.start, ...projects.map(({ placed }) => placed.start))
	}));
	// Jobs take their lanes first: a career reads along the top, and what ran next to it
	// (studies, side projects) goes under it, in the order it began
	const rank = (index: number) =>
		drafts[index].experience.type === ExperienceType.Professional ? 0 : 1;
	const chronological = byStartThenLength(extents);
	const laneOrder = drafts
		.map((_, index) => index)
		.sort((a, b) => rank(a) - rank(b) || chronological(a, b));
	const lanes = packRows(extents, laneOrder);
	const extentEnds = drawnEnds(extents, lanes.rows);

	const items = drafts.map(({ experience, own, ongoing, projects }, index) => {
		// Nothing of an experience is drawn past where the next one of its lane takes over
		const limit = extentEnds[index];
		const placed = projects.map((project) => project.placed);
		const order = placed.map((_, i) => i).sort(byStartThenLength(placed));
		const rows = packRows(placed, order);
		const ends = drawnEnds(placed, rows.rows);
		return {
			experience,
			span: { start: own.start, end: Math.min(own.last + 1, limit) },
			extent: { start: extents[index].start, end: limit },
			ongoing,
			lane: lanes.rows[index],
			projects: projects.map((project, i) => ({
				project: project.project,
				index: project.index,
				span: { start: project.placed.start, end: Math.min(ends[i], limit) },
				ongoing: project.ongoing,
				undated: project.undated,
				row: rows.rows[i]
			})),
			projectRows: rows.count
		};
	});
	items.sort(
		(a, b) => a.extent.start - b.extent.start || a.lane - b.lane || b.extent.end - a.extent.end
	);

	if (items.length === 0) {
		return { start: 0, end: 0, years: [], lanes: 0, items, undated };
	}

	const start = Math.floor(Math.min(...items.map((item) => item.extent.start)) / 12) * 12;
	const end = Math.ceil(Math.max(...items.map((item) => item.extent.end)) / 12) * 12;
	const step = yearStep((end - start) / 12);
	const years: TimelineYear[] = [];
	for (let month = start; month < end; month += 12) {
		const year = month / 12;
		years.push({ year, month, labelled: year % step === 0 });
	}
	const anyOngoing = items.some(
		(item) => item.ongoing || item.projects.some((project) => project.ongoing)
	);
	const today = anyOngoing && nowMonth + 1 <= end ? nowMonth + 1 : undefined;

	return { start, end, years, today, lanes: lanes.count, items, undated };
}

/** Where a span sits inside another, as CSS percentages (`margin-left` and `width`) */
export function placeSpan(span: MonthSpan, within: MonthSpan): { left: string; width: string } {
	const total = Math.max(1, within.end - within.start);
	const percent = (months: number) => `${Number(((months / total) * 100).toFixed(4))}%`;
	return {
		left: percent(span.start - within.start),
		width: percent(Math.max(0, span.end - span.start))
	};
}

/**
 * The least width of the time axis, in pixels: 10 px a month (a year is 120 px) up to 1100 px,
 * which fits a desktop page without scrolling; longer careers are squeezed into that width,
 * never under 5 px a month (then the timeline scrolls). A wider page stretches it.
 */
export function timelineMinWidth(months: number): number {
	if (months <= 0) return 0;
	return Math.round(months * Math.min(10, Math.max(5, 1100 / months)));
}
