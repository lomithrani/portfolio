// The month arithmetic of experiences and their projects, shared by the experiences page (its
// timeline, the time its skill previews add up) and the API, so both can count the same months.
// Dates have month precision: the API stores them as UTC midnight of the 1st of the month, and
// everything here reads them in UTC, so every time zone counts the same months. A month is
// counted since year 0 (monthIndex), so what follows is plain arithmetic. No messages and no
// Intl: how a month or a number of months is written stays with the code that shows it.
import { ExperienceType } from './experienceType';

/** A stored date: a Date, its ISO string, or nothing */
export type DateInput = Date | string | undefined | null;

type Dated = { start?: DateInput; end?: DateInput };
type DatedExperience = Dated & { projects?: readonly Dated[] | null };

/** A valid Date from a stored date, or undefined */
export function toDate(date: DateInput): Date | undefined {
	if (date === undefined || date === null || date === '') return undefined;
	const value = date instanceof Date ? date : new Date(date);
	return Number.isNaN(value.getTime()) ? undefined : value;
}

/** Months since year 0 (UTC), to compare dates at month precision */
export const monthIndex = (date: Date) => date.getUTCFullYear() * 12 + date.getUTCMonth();

export type ExperiencePeriod = { start?: Date; end?: Date; ongoing: boolean };

/**
 * Period of an experience: its own start/end when it has a start, else derived from its
 * projects (earliest start; end = latest end, or ongoing if a dated project has no end)
 */
export function experiencePeriod(experience: DatedExperience): ExperiencePeriod {
	const start = toDate(experience.start);
	if (start) {
		const end = toDate(experience.end);
		return { start, end, ongoing: !end };
	}

	let earliest: Date | undefined;
	let latest: Date | undefined;
	let ongoing = false;
	for (const project of experience.projects ?? []) {
		const projectStart = toDate(project.start);
		if (!projectStart) continue;
		if (!earliest || projectStart < earliest) earliest = projectStart;
		const projectEnd = toDate(project.end);
		if (!projectEnd) ongoing = true;
		else if (!latest || projectEnd > latest) latest = projectEnd;
	}
	if (!earliest) return { ongoing: false };
	return ongoing ? { start: earliest, ongoing } : { start: earliest, end: latest, ongoing };
}

/**
 * When a project of an experience (of this period) ended: its own end; without one it stopped
 * with its experience when that one ended, never before it began. Undefined while it is ongoing.
 */
export function projectEnd(project: Dated, period: ExperiencePeriod): Date | undefined {
	const end = toDate(project.end);
	if (end || period.ongoing || !period.end) return end;
	const start = toDate(project.start);
	return start && start > period.end ? start : period.end;
}

/**
 * How many months `start` to `end` lasted, both included (Mar to May 2024 is 3), `end` defaulting
 * to the current month: what an experience card says it lasted, `monthCount(period.start,
 * period.end, now)` of its experiencePeriod (one with a planned end counts to that end). 0 without
 * a start, or when it ends before it starts.
 */
export function monthCount(start: DateInput, end: DateInput, now: Date = new Date()): number {
	const from = toDate(start);
	if (!from) return 0;
	const to = toDate(end) ?? now;
	return Math.max(0, monthIndex(to) - monthIndex(from) + 1);
}

/**
 * Experiences in the order the experiences page lists them: ongoing first, then by end, then by
 * start, the most recent first (each taking its period as experiencePeriod gives it), the ones
 * that cannot be placed last; stable, and the input is left as it is
 */
export function sortExperiences<T extends DatedExperience>(experiences: readonly T[]): T[] {
	const keyed = experiences.map((experience, index) => {
		const period = experiencePeriod(experience);
		return {
			experience,
			index,
			dated: period.start !== undefined,
			end: period.ongoing ? Infinity : period.end ? monthIndex(period.end) : -Infinity,
			start: period.start ? monthIndex(period.start) : -Infinity
		};
	});
	keyed.sort((a, b) => {
		if (a.dated !== b.dated) return a.dated ? -1 : 1;
		if (a.end !== b.end) return b.end - a.end;
		if (a.start !== b.start) return b.start - a.start;
		return a.index - b.index;
	});
	return keyed.map(({ experience }) => experience);
}

/** Months `start` to `end`, `end` excluded: Jan to Mar 2024 is { start: Jan, end: Apr } */
export type MonthSpan = { start: number; end: number };

/** Months `start` to `last`, both included: where the timeline places what it draws */
export type PlacedMonths = { start: number; last: number };

/**
 * The months of an experience of this period, both included: an ongoing one runs to the current
 * month (`nowMonth`, a monthIndex), one starting later takes its first month. Undefined when the
 * period has no start: the experience cannot be placed.
 */
export function periodMonths(period: ExperiencePeriod, nowMonth: number): PlacedMonths | undefined {
	if (!period.start) return undefined;
	const start = monthIndex(period.start);
	const last = Math.max(
		start,
		period.ongoing ? nowMonth : period.end ? monthIndex(period.end) : start
	);
	return { start, last };
}

/**
 * The months of a project of an experience (of this period, placed at `own`: see periodMonths).
 * Without a start it began with its experience, and lasted as long unless it has an end
 * (`undated`); without an end it is ongoing, unless its experience ended (see projectEnd).
 */
export function placeProject(
	project: Dated,
	period: ExperiencePeriod,
	own: PlacedMonths,
	nowMonth: number
): PlacedMonths & { ongoing: boolean; undated: boolean } {
	const projectStart = toDate(project.start);
	if (!projectStart) {
		const ownEnd = toDate(project.end);
		return {
			start: own.start,
			last: ownEnd ? Math.max(own.start, monthIndex(ownEnd)) : own.last,
			ongoing: !ownEnd && period.ongoing,
			undated: true
		};
	}
	const from = monthIndex(projectStart);
	const end = projectEnd(project, period);
	return {
		start: from,
		last: Math.max(from, end ? monthIndex(end) : nowMonth),
		ongoing: !end,
		undated: false
	};
}

/**
 * The months a project of an experience lasted, as the timeline places it: all of them, where the
 * timeline cuts a bar short at the next one's start. Undefined when the experience has no dates:
 * the project cannot be placed.
 */
export function projectMonthSpan(
	project: Dated,
	experience: DatedExperience,
	now: Date = new Date()
): MonthSpan | undefined {
	const nowMonth = monthIndex(now);
	const period = experiencePeriod(experience);
	const own = periodMonths(period, nowMonth);
	return own && placedSpan(project, period, own, nowMonth);
}

/** The months of a project of an experience placed at `own` (see placeProject), as a span */
function placedSpan(
	project: Dated,
	period: ExperiencePeriod,
	own: PlacedMonths,
	nowMonth: number
): MonthSpan {
	const { start, last } = placeProject(project, period, own, nowMonth);
	return { start, end: last + 1 };
}

/** The months spans cover before `until` (excluded), each counted once however many cover it */
function countMonths(spans: MonthSpan[], until: number): number {
	const counted = spans
		.filter((span) => span.start < until)
		.map((span) => ({ start: span.start, end: Math.min(span.end, until) }))
		.sort((a, b) => a.start - b.start);
	let months = 0;
	let reached = -Infinity;
	for (const span of counted) {
		const from = Math.max(span.start, reached);
		if (span.end > from) months += span.end - from;
		reached = Math.max(reached, span.end);
	}
	return months;
}

/**
 * The months a skill was used in all: the calendar months of the projects using it (`usesSkill`,
 * see projectUsesSkill), as the timeline places them (see projectMonthSpan), each counted once
 * however many of them ran that month, up to the current month (a project planned later, or to a
 * later end, was not used yet). Projects of an experience without dates count for nothing.
 */
export function skillMonths<P extends Dated>(
	experiences: readonly (Dated & { projects?: readonly P[] | null })[],
	usesSkill: (project: P) => boolean,
	now: Date = new Date()
): number {
	const nowMonth = monthIndex(now);
	const spans: MonthSpan[] = [];
	for (const experience of experiences) {
		const using = (experience.projects ?? []).filter((project) => usesSkill(project));
		if (using.length === 0) continue;
		// Each experience's period worked out once, as projectMonthSpan works it out
		const period = experiencePeriod(experience);
		const own = periodMonths(period, nowMonth);
		if (!own) continue;
		for (const project of using) spans.push(placedSpan(project, period, own, nowMonth));
	}
	// The month after the current one: nothing is counted from there on
	return countMonths(spans, nowMonth + 1);
}

/**
 * The months of professional experience in all: the calendar months of the professional
 * experiences (ExperienceType.Professional), each counted once however many of them ran that
 * month (two jobs at once are not twice the experience), up to the current month. Each takes its
 * period as experiencePeriod gives it (its own dates, else its projects'); one that cannot be
 * placed counts for nothing.
 */
export function professionalMonths(
	experiences: readonly (DatedExperience & { type?: ExperienceType | null })[],
	now: Date = new Date()
): number {
	const nowMonth = monthIndex(now);
	const spans: MonthSpan[] = [];
	for (const experience of experiences) {
		if (experience.type !== ExperienceType.Professional) continue;
		const months = periodMonths(experiencePeriod(experience), nowMonth);
		if (months) spans.push({ start: months.start, end: months.last + 1 });
	}
	return countMonths(spans, nowMonth + 1);
}

/** A skill of a project as the API sends it: `skill` populated with its `displayName` */
type SkillEntry = { skill?: unknown };
type SkilledProject = {
	hardSkills?: readonly SkillEntry[] | null;
	softSkills?: readonly SkillEntry[] | null;
};

/** Key of a skill name: skills match ignoring case and surrounding spaces ('TypeScript ' = 'typescript') */
export function normalizeSkill(name: string): string {
	return name.trim().toLowerCase();
}

/** Display name of a populated skill entry (undefined when not populated or blank) */
export function skillDisplayName(entry: SkillEntry): string | undefined {
	const skill = entry.skill;
	if (!skill || typeof skill !== 'object' || !('displayName' in skill)) return undefined;
	const name = (skill as { displayName?: unknown }).displayName;
	return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

/** Whether a project uses a skill (by name or key, see normalizeSkill), technical or soft */
export function projectUsesSkill(project: SkilledProject, skill: string): boolean {
	const key = normalizeSkill(skill);
	return [...(project.hardSkills ?? []), ...(project.softSkills ?? [])].some((entry) => {
		const name = skillDisplayName(entry);
		return name !== undefined && normalizeSkill(name) === key;
	});
}

/** How much a skill was used: its months, as skillMonths counts them, and its projects */
export type SkillUse = {
	/** The calendar months of the projects using it, each counted once (see skillMonths) */
	months: number;
	/** How many projects use it, dated or not: the page's "Used in 3 projects" */
	projects: number;
	/**
	 * How many of those projects can be placed (their experience has dates): with none, its months
	 * cannot be counted (the page shows no time); with some and no month, it is not used yet (each
	 * of them is planned later)
	 */
	placed: number;
};

/**
 * Every skill of these experiences' projects, technical or soft, by key (see normalizeSkill), with
 * how much it was used: what skillMonths(experiences, (project) => projectUsesSkill(project, key),
 * now) counts for each key, how many projects use it and how many of those can be placed, in one
 * pass (each experience's period worked out once, each project placed once), for the API, which
 * ranks a candidate's skills
 */
export function skillUsesByKey<P extends Dated & SkilledProject>(
	experiences: readonly (Dated & { projects?: readonly P[] | null })[],
	now: Date = new Date()
): Map<string, SkillUse> {
	const nowMonth = monthIndex(now);
	const used = new Map<string, { spans: MonthSpan[]; projects: number }>();
	for (const experience of experiences) {
		const projects = experience.projects ?? [];
		if (projects.length === 0) continue;
		const period = experiencePeriod(experience);
		const own = periodMonths(period, nowMonth);
		for (const project of projects) {
			const keys = new Set<string>();
			for (const entry of [...(project.hardSkills ?? []), ...(project.softSkills ?? [])]) {
				const name = skillDisplayName(entry);
				if (name !== undefined) keys.add(normalizeSkill(name));
			}
			if (keys.size === 0) continue;
			const span = own && placedSpan(project, period, own, nowMonth);
			for (const key of keys) {
				const skill = used.get(key) ?? { spans: [], projects: 0 };
				skill.projects += 1;
				if (span) skill.spans.push(span);
				used.set(key, skill);
			}
		}
	}
	// The month after the current one: nothing is counted from there on (as skillMonths)
	const until = nowMonth + 1;
	return new Map(
		[...used].map(([key, { spans, projects }]) => [
			key,
			{ months: countMonths(spans, until), projects, placed: spans.length }
		])
	);
}
