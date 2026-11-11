import {
	experiencePeriod,
	formatDuration,
	formatMonthRange,
	formatProjectMonths,
	projectEnd
} from '#services/experienceDates.ts';
import { normalizeSkill, projectMatchesFilters, skillOptions } from '#services/filters.ts';
import {
	buildTimeline,
	timelineAxis,
	type MonthSpan,
	type TimelineYear
} from '#services/timeline.ts';

// The preview shown while a skill tag (or a bar of the timeline) is hovered or focused: a short
// card with only the projects concerned, without their descriptions. On the timeline view a
// skill's projects are drawn as a small timeline of their own (skillTimeline).

type Dated = { start?: Date | string | null; end?: Date | string | null };
type SkillEntry = { skill?: unknown };
type PreviewedProject = Dated & {
	name?: string;
	hardSkills?: SkillEntry[] | null;
	softSkills?: SkillEntry[] | null;
};
type PreviewedExperience = Dated & {
	_id?: unknown;
	title?: string;
	company?: { name?: string } | null;
	location?: string | null;
	projects?: PreviewedProject[] | null;
};

export type PreviewEntry = {
	name: string;
	/** Where the project was done ('Backend Engineer · Acme'); '' inside an experience's preview */
	context: string;
	/** 'Mar 2022 – Jun 2023'; '' without dates */
	period: string;
};

export type Preview = {
	kind: 'skill' | 'project' | 'experience';
	title: string;
	/** Under the title: how many projects (a skill), or where (a project, an experience) */
	caption: string;
	/** 'Mar 2022 – Jun 2023 · 1 yr 4 mos' of a project or an experience; '' for a skill */
	period: string;
	/** The projects: those using the skill, or those of the experience */
	entries: PreviewEntry[];
	/** A project's own skills, by display name */
	skills: { hard: string[]; soft: string[] };
};

/** A project of a skill's small timeline: its line of text, and where its bar goes */
export type PreviewBar = PreviewEntry & {
	span: MonthSpan;
	ongoing: boolean;
	/** No start of its own: drawn from its experience's start (dashed) */
	undated: boolean;
};

/** A skill's projects over time: an axis of whole years around them, and a bar for each */
export type PreviewTimeline = MonthSpan & {
	years: TimelineYear[];
	/** Where ongoing bars end, when one is ongoing */
	today?: number;
	/** The earliest first */
	bars: PreviewBar[];
	/** The projects that cannot be placed: their experience has no dates */
	undated: PreviewEntry[];
};

/** What an element's `data-preview` attribute names */
export const previewTarget = {
	skill: (name: string) => `skill:${normalizeSkill(name)}`,
	experience: (experienceId: string) => `experience:${experienceId}`,
	project: (experienceId: string, index: number) => `project:${experienceId}:${index}`
};

const SEPARATOR = ' · ';
const joined = (...parts: (string | undefined | null)[]) =>
	parts
		.map((part) => part?.trim() ?? '')
		.filter(Boolean)
		.join(SEPARATOR);

const skillNames = (entries: SkillEntry[] | null | undefined): string[] =>
	(entries ?? []).flatMap((entry) => {
		const skill = entry.skill;
		if (!skill || typeof skill !== 'object' || !('displayName' in skill)) return [];
		const name = (skill as { displayName?: unknown }).displayName;
		return typeof name === 'string' && name.trim() ? [name.trim()] : [];
	});

const experienceContext = (experience: PreviewedExperience) =>
	joined(experience.title, experience.company?.name);

const periodWithDuration = (start: Dated['start'], end: Dated['end'], now: Date) =>
	joined(formatMonthRange(start, end), formatDuration(start, end, now));

/**
 * The months of a project, as the timeline draws it: one without an end stopped with its
 * experience when that one ended (see projectEnd), it is not "Present"
 */
const projectMonths = (project: PreviewedProject, experience: PreviewedExperience) =>
	formatProjectMonths(project, experiencePeriod(experience));

const noSkills = () => ({ hard: [], soft: [] });

/** The projects using a skill (by key, see normalizeSkill), in the experiences' order */
export function skillPreview(experiences: PreviewedExperience[], key: string): Preview | undefined {
	const skill = normalizeSkill(key);
	const entries: PreviewEntry[] = [];
	for (const experience of experiences) {
		for (const project of experience.projects ?? []) {
			if (!projectMatchesFilters(project, { skills: [skill] })) continue;
			entries.push({
				name: project.name?.trim() ?? '',
				context: experienceContext(experience),
				period: projectMonths(project, experience)
			});
		}
	}
	if (entries.length === 0) return undefined;
	const options = skillOptions(experiences);
	const label = [...options.hard, ...options.soft].find((option) => option.key === skill)?.label;
	return {
		kind: 'skill',
		title: label ?? key,
		caption: entries.length === 1 ? 'Used in 1 project' : `Used in ${entries.length} projects`,
		period: '',
		entries,
		skills: noSkills()
	};
}

/** Years labelled on a skill's small timeline: it is a few hundred pixels wide */
const PREVIEW_YEAR_LABELS = 5;

/**
 * The projects using a skill (by key) as a small timeline, for the timeline view: placed as the
 * page's timeline places them (see buildTimeline), each on a line of its own. Undefined when none
 * of them can be placed (the list of skillPreview is all there is to show).
 */
export function skillTimeline(
	experiences: PreviewedExperience[],
	key: string,
	now: Date = new Date()
): PreviewTimeline | undefined {
	const filters = { skills: [normalizeSkill(key)] };
	const timeline = buildTimeline(experiences, now);
	const bars: PreviewBar[] = timeline.items.flatMap((item) =>
		item.projects
			.filter((entry) => projectMatchesFilters(entry.project, filters))
			.map((entry) => ({
				name: entry.project.name?.trim() ?? '',
				context: experienceContext(item.experience),
				period: projectMonths(entry.project, item.experience),
				span: entry.span,
				ongoing: entry.ongoing,
				undated: entry.undated
			}))
	);
	if (bars.length === 0) return undefined;
	bars.sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
	const undated: PreviewEntry[] = timeline.undated.flatMap((experience) =>
		(experience.projects ?? [])
			.filter((project) => projectMatchesFilters(project, filters))
			.map((project) => ({
				name: project.name?.trim() ?? '',
				context: experienceContext(experience),
				period: ''
			}))
	);
	return {
		...timelineAxis(
			bars.map((bar) => bar.span),
			PREVIEW_YEAR_LABELS
		),
		today: bars.some((bar) => bar.ongoing) ? timeline.today : undefined,
		bars,
		undated
	};
}

/** One project: where it was done, when, and its skills */
export function projectPreview(
	experience: PreviewedExperience,
	index: number,
	now: Date = new Date()
): Preview | undefined {
	const project = experience.projects?.[index];
	if (!project) return undefined;
	return {
		kind: 'project',
		title: project.name?.trim() ?? '',
		caption: experienceContext(experience),
		period: periodWithDuration(
			project.start,
			projectEnd(project, experiencePeriod(experience)),
			now
		),
		entries: [],
		skills: { hard: skillNames(project.hardSkills), soft: skillNames(project.softSkills) }
	};
}

/** One experience: where, when, and the names of its projects */
export function experiencePreview(
	experience: PreviewedExperience,
	now: Date = new Date()
): Preview {
	const period = experiencePeriod(experience);
	return {
		kind: 'experience',
		title: experience.title?.trim() ?? '',
		caption: joined(experience.company?.name, experience.location),
		period: periodWithDuration(period.start, period.ongoing ? undefined : period.end, now),
		entries: (experience.projects ?? []).map((project) => ({
			name: project.name?.trim() ?? '',
			context: '',
			period: projectMonths(project, experience)
		})),
		skills: noSkills()
	};
}

/** The preview a `data-preview` attribute names (see previewTarget); undefined when it is gone */
export function resolvePreview(
	experiences: PreviewedExperience[],
	target: string,
	now: Date = new Date()
): Preview | undefined {
	const separator = target.indexOf(':');
	if (separator === -1) return undefined;
	const kind = target.slice(0, separator);
	const rest = target.slice(separator + 1);
	if (kind === 'skill') return skillPreview(experiences, rest);
	const byId = (id: string) => experiences.find((experience) => String(experience._id) === id);
	if (kind === 'experience') {
		const experience = byId(rest);
		return experience && experiencePreview(experience, now);
	}
	if (kind === 'project') {
		const split = rest.lastIndexOf(':');
		const experience = byId(rest.slice(0, split));
		const index = Number(rest.slice(split + 1));
		return experience && Number.isInteger(index)
			? projectPreview(experience, index, now)
			: undefined;
	}
	return undefined;
}

/** The skill key a `data-preview` attribute names, when it names a skill */
export function previewedSkill(target: string | null | undefined): string | null {
	return target?.startsWith('skill:') ? target.slice('skill:'.length) : null;
}
