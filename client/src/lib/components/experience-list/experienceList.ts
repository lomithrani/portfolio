import { ExperienceType } from 'portfolio-common';
import { experiencePeriod, formatDuration, formatMonthRange } from '#services/experienceDates.ts';

type Dated = { start?: Date | string | null; end?: Date | string | null };
type SkillEntry = { skill?: unknown };
type ListedProject = Dated & { hardSkills?: SkillEntry[]; softSkills?: SkillEntry[] };
type ListedExperience = Dated & {
	company?: { name?: string } | null;
	location?: string | null;
	projects?: ListedProject[];
};

/** Badge labels of the experience types */
export const experienceTypeLabels: Record<ExperienceType, string> = {
	[ExperienceType.Professional]: 'Professional',
	[ExperienceType.Personal]: 'Personal',
	[ExperienceType.Educational]: 'Education',
	[ExperienceType.Leisure]: 'Leisure'
};

export type SubtitlePart = { kind: 'company' | 'location' | 'period' | 'duration'; text: string };

/**
 * Subtitle parts of an experience card, in order: company, location, period and duration
 * ('Acme', 'Paris', 'Mar 2024 – Present', '2 yrs 8 mos'). Missing parts are left out.
 */
export function experienceSubtitle(
	experience: ListedExperience,
	now: Date = new Date()
): SubtitlePart[] {
	const period = experiencePeriod(experience);
	const end = period.ongoing ? undefined : period.end;
	const parts: SubtitlePart[] = [
		{ kind: 'company', text: experience.company?.name?.trim() ?? '' },
		{ kind: 'location', text: experience.location?.trim() ?? '' },
		{ kind: 'period', text: formatMonthRange(period.start, end) },
		{ kind: 'duration', text: formatDuration(period.start, end, now) }
	];
	return parts.filter((part) => part.text !== '');
}

const displayNameOf = (entry: SkillEntry): string | undefined => {
	const skill = entry.skill;
	if (!skill || typeof skill !== 'object' || !('displayName' in skill)) return undefined;
	const name = (skill as { displayName?: unknown }).displayName;
	return typeof name === 'string' && name.trim() ? name.trim() : undefined;
};

/**
 * Distinct names of a kind of skill, grouped ignoring case: each group is labelled with its
 * most used spelling (ties: the first seen), sorted alphabetically.
 */
function distinctSkillNames(projects: ListedProject[], kind: 'hardSkills' | 'softSkills') {
	const groups = new Map<string, Map<string, number>>();
	for (const project of projects) {
		for (const entry of project[kind] ?? []) {
			const name = displayNameOf(entry);
			if (!name) continue;
			const key = name.toLowerCase();
			const spellings = groups.get(key) ?? new Map<string, number>();
			spellings.set(name, (spellings.get(name) ?? 0) + 1);
			groups.set(key, spellings);
		}
	}
	const labels = [...groups.values()].map((spellings) => {
		let label = '';
		let best = 0;
		// Map keeps insertion order: a later spelling wins only with strictly more uses
		for (const [spelling, count] of spellings) {
			if (count > best) {
				label = spelling;
				best = count;
			}
		}
		return label;
	});
	return labels.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/** Skill names already used by these experiences, for the editor's suggestions and casing */
export function collectKnownSkills(experiences: ListedExperience[]): {
	hard: string[];
	soft: string[];
} {
	const projects = experiences.flatMap((experience) => experience.projects ?? []);
	return {
		hard: distinctSkillNames(projects, 'hardSkills'),
		soft: distinctSkillNames(projects, 'softSkills')
	};
}
