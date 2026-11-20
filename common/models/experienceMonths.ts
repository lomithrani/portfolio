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

/** Months `start` to `end`, `end` excluded: Jan to Mar 2024 is { start: Jan, end: Apr } */
export type MonthSpan = { start: number; end: number };

/** Months `start` to `last`, both included: where the timeline places what it draws */
export type PlacedMonths = { start: number; last: number };

/**
 * The months of an experience of this period, both included: an ongoing one runs to the current
 * month (`nowMonth`, a monthIndex), one starting later takes its first month. Undefined when the
 * period has no start: the experience cannot be placed.
 */
export function periodMonths(
	period: ExperiencePeriod,
	nowMonth: number
): PlacedMonths | undefined {
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
	if (!own) return undefined;
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
	const spans: MonthSpan[] = [];
	for (const experience of experiences) {
		for (const project of experience.projects ?? []) {
			if (!usesSkill(project)) continue;
			const span = projectMonthSpan(project, experience, now);
			if (span) spans.push(span);
		}
	}
	// The month after the current one: nothing is counted from there on
	return countMonths(spans, monthIndex(now) + 1);
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
