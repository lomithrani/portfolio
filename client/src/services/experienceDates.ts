// Experience and project dates have month precision: the API stores them as UTC
// midnight of the 1st of the month. Everything here reads them in UTC, so the server
// render and every visitor's time zone show the same month.
import { intlLocale } from 'portfolio-common';
import { m } from './experienceDates.messages.ts';

type DateInput = Date | string | undefined | null;

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

const MONTH_KEY = /^(\d{4})-(\d{2})$/;

// One format per language, made the first time a month is shown in it (never at module load:
// the language is only known while a page is rendered)
const monthFormats = new Map<string, Intl.DateTimeFormat>();
const monthFormat = (): Intl.DateTimeFormat => {
	const locale = intlLocale('en-US');
	let format = monthFormats.get(locale);
	if (!format) {
		format = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });
		monthFormats.set(locale, format);
	}
	return format;
};

/** A valid Date from a stored date, or undefined */
export function toDate(date: DateInput): Date | undefined {
	if (date === undefined || date === null || date === '') return undefined;
	const value = date instanceof Date ? date : new Date(date);
	return Number.isNaN(value.getTime()) ? undefined : value;
}

/** Months since year 0 (UTC), to compare dates at month precision */
export const monthIndex = (date: Date) => date.getUTCFullYear() * 12 + date.getUTCMonth();

/** 'YYYY-MM' month key of a stored date (UTC), or undefined */
export function toMonthKey(date: DateInput): string | undefined {
	const value = toDate(date);
	if (!value) return undefined;
	return `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}`;
}

/** Date at UTC midnight of the 1st of the month, from 'YYYY-MM' (Invalid Date otherwise) */
export function fromMonthKey(month: string): Date {
	const match = MONTH_KEY.exec(month);
	if (!match) return new Date(NaN);
	const monthNumber = Number(match[2]);
	if (monthNumber < 1 || monthNumber > 12) return new Date(NaN);
	return new Date(Date.UTC(Number(match[1]), monthNumber - 1, 1));
}

/**
 * 'Mar 2024' ('mars 2024' in French), always formatted in UTC, in the page's language; '' for
 * an invalid date
 */
export function formatMonth(date: Date | string): string {
	const value = toDate(date);
	return value ? monthFormat().format(value) : '';
}

/** 'Mar 2024 – Present', 'Mar 2024 – Jun 2025', 'Mar 2024' (same month); '' when no start */
export function formatMonthRange(start?: DateInput, end?: DateInput): string {
	const from = toDate(start);
	if (!from) return '';
	const to = toDate(end);
	if (!to) return m.ongoing(formatMonth(from));
	if (monthIndex(to) === monthIndex(from)) return formatMonth(from);
	return m.range(formatMonth(from), formatMonth(to));
}

/** '2 yrs 3 mos', '8 mos', '1 yr' (inclusive months, end defaults to now); '' when no start */
export function formatDuration(start?: DateInput, end?: DateInput, now: Date = new Date()): string {
	const from = toDate(start);
	if (!from) return '';
	const to = toDate(end) ?? now;
	const months = monthIndex(to) - monthIndex(from) + 1;
	if (months < 1) return '';
	return m.duration(Math.floor(months / 12), months % 12);
}

/** '5 years 2 months', '1 year', '3 months', in full words; '' under a month */
export function formatMonthCount(months: number): string {
	if (!(months >= 1)) return '';
	return m.monthCount(Math.floor(months / 12), Math.floor(months % 12));
}

type Dated = { start?: Date | string | null; end?: Date | string | null };

export type ExperiencePeriod = { start?: Date; end?: Date; ongoing: boolean };

/**
 * Period of an experience: its own start/end when it has a start, else derived from its
 * projects (earliest start; end = latest end, or ongoing if a dated project has no end)
 */
export function experiencePeriod(
	experience: Dated & { projects?: Dated[] | null }
): ExperiencePeriod {
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
 * 'Jun 2019 – Dec 2020' of a project of an experience (of this period), as its card, its previews
 * and the timeline show it: "Present" only while both are ongoing (see projectEnd); '' when no start
 */
export const formatProjectMonths = (project: Dated, period: ExperiencePeriod): string =>
	formatMonthRange(project.start, projectEnd(project, period));

/** Sort for display: ongoing first, then by end desc, then start desc; undated last; stable */
export function sortExperiences<T extends Parameters<typeof experiencePeriod>[0]>(
	experiences: T[]
): T[] {
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

type WithDates = { start?: DateInput; end?: DateInput };
type WithProjects = WithDates & { projects?: WithDates[] | null };

/** The same object with its start and end as Dates (left out when absent or not a date) */
const withDates = <T extends WithDates>(dated: T): T => {
	const { start, end, ...rest } = dated;
	const revived: WithDates = rest;
	const from = toDate(start);
	const to = toDate(end);
	if (from) revived.start = from;
	if (to) revived.end = to;
	return revived as T;
};

/**
 * A portfolio as the API sent it, read without Eden Treaty's date parsing (every text stays as
 * its owner wrote it, even '2027-01-01'), with only its real dates turned into Dates: the start
 * and end of each experience and of each of its projects
 */
export function reviveExperienceDates<D extends { experiences?: WithProjects[] | null }>(
	domain: D
): D {
	if (!Array.isArray(domain.experiences)) return domain;
	return {
		...domain,
		experiences: domain.experiences.map((experience) => {
			const revived = withDates(experience);
			if (Array.isArray(experience.projects)) {
				revived.projects = experience.projects.map((project) => withDates(project));
			}
			return revived;
		})
	};
}
