import { ExperienceType } from 'portfolio-common';

/**
 * Filters of an experience list. `skills` holds normalized keys (see normalizeSkill), in the
 * order they were selected; `types` empty means every type.
 */
export type ExperienceFilters = { skills: string[]; types: ExperienceType[] };

type SkillEntry = { skill?: unknown };
type FilterableProject = { hardSkills?: SkillEntry[] | null; softSkills?: SkillEntry[] | null };
/** What the filters read of an experience (an API experience with populated skills fits) */
export type FilterableExperience = { type: string; projects?: FilterableProject[] | null };

/** URLSearchParams, or the read-only ones of SvelteKit's `page.url` */
export type ReadableSearchParams = Omit<URLSearchParams, 'set' | 'append' | 'delete' | 'sort'>;

/** A skill the list can be filtered by: its key and the label shown for it */
export type SkillOption = { key: string; label: string };

/** Order of the type chips */
export const EXPERIENCE_TYPE_ORDER: readonly ExperienceType[] = [
	ExperienceType.Professional,
	ExperienceType.Educational,
	ExperienceType.Personal,
	ExperienceType.Leisure
];

export const emptyFilters = (): ExperienceFilters => ({ skills: [], types: [] });

/** Key of a skill name: skills match ignoring case and surrounding spaces ('TypeScript ' = 'typescript') */
export function normalizeSkill(name: string): string {
	return name.trim().toLowerCase();
}

const isExperienceType = (value: string): value is ExperienceType =>
	(EXPERIENCE_TYPE_ORDER as readonly string[]).includes(value);

const unique = <T>(values: T[]): T[] => [...new Set(values)];

/** Display name of a populated skill entry (undefined when not populated or blank) */
const displayNameOf = (entry: SkillEntry): string | undefined => {
	const skill = entry.skill;
	if (!skill || typeof skill !== 'object' || !('displayName' in skill)) return undefined;
	const name = (skill as { displayName?: unknown }).displayName;
	return typeof name === 'string' && name.trim() ? name.trim() : undefined;
};

const skillEntriesOf = (experience: FilterableExperience, kind: 'hardSkills' | 'softSkills') =>
	(experience.projects ?? []).flatMap((project) => project[kind] ?? []);

/** Keys of every skill (technical and soft) of an experience's projects */
function experienceSkillKeys(experience: FilterableExperience): Set<string> {
	const keys = new Set<string>();
	for (const entry of [
		...skillEntriesOf(experience, 'hardSkills'),
		...skillEntriesOf(experience, 'softSkills')
	]) {
		const name = displayNameOf(entry);
		if (name) keys.add(normalizeSkill(name));
	}
	return keys;
}

/**
 * The filters that still apply to these experiences: selected skills and types that no
 * experience has any more (an edit removed them, or a shared link is out of date) have no chip
 * left to clear them, so they are dropped instead of hiding everything. Also normalizes and
 * dedupes the selection.
 */
export function activeFilters(
	experiences: FilterableExperience[],
	filters: ExperienceFilters
): ExperienceFilters {
	const skillKeys = new Set(
		experiences.flatMap((experience) => [...experienceSkillKeys(experience)])
	);
	const types = new Set(experiences.map((experience) => experience.type));
	return {
		skills: unique(filters.skills.map(normalizeSkill)).filter((key) => skillKeys.has(key)),
		types: unique(filters.types).filter((type) => types.has(type))
	};
}

export const hasActiveFilters = (filters: ExperienceFilters): boolean =>
	filters.skills.length > 0 || filters.types.length > 0;

/**
 * The experiences matching the filters, in their order: type in the selected types (none = all)
 * AND any project with any of the selected skills (none = all). Stale selections are ignored
 * (see activeFilters).
 */
export function applyFilters<T extends FilterableExperience>(
	experiences: T[],
	filters: ExperienceFilters
): T[] {
	const { skills, types } = activeFilters(experiences, filters);
	if (skills.length === 0 && types.length === 0) return experiences;
	return experiences.filter((experience) => {
		if (types.length > 0 && !(types as string[]).includes(experience.type)) return false;
		if (skills.length === 0) return true;
		const keys = experienceSkillKeys(experience);
		return skills.some((key) => keys.has(key));
	});
}

/** Whether a skill chip (by display name) matches the selected skills */
export function isSkillHighlighted(filters: ExperienceFilters, displayName: string): boolean {
	return filters.skills.includes(normalizeSkill(displayName));
}

/**
 * The skills to filter by, grouped ignoring case. Each is labelled with its most used spelling
 * (ties: the first seen) and listed once, as technical or soft depending on how it is used most
 * (ties: technical). Sorted alphabetically.
 */
export function skillOptions(experiences: FilterableExperience[]): {
	hard: SkillOption[];
	soft: SkillOption[];
} {
	type Group = { spellings: Map<string, number>; hard: number; soft: number };
	const groups = new Map<string, Group>();
	for (const experience of experiences) {
		for (const kind of ['hardSkills', 'softSkills'] as const) {
			for (const entry of skillEntriesOf(experience, kind)) {
				const name = displayNameOf(entry);
				if (!name) continue;
				const key = normalizeSkill(name);
				const group = groups.get(key) ?? { spellings: new Map(), hard: 0, soft: 0 };
				group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
				if (kind === 'hardSkills') group.hard += 1;
				else group.soft += 1;
				groups.set(key, group);
			}
		}
	}

	const hard: SkillOption[] = [];
	const soft: SkillOption[] = [];
	for (const [key, group] of groups) {
		let label = '';
		let uses = 0;
		// A Map iterates in insertion order: a later spelling wins only with strictly more uses
		for (const [spelling, count] of group.spellings) {
			if (count > uses) {
				label = spelling;
				uses = count;
			}
		}
		(group.soft > group.hard ? soft : hard).push({ key, label });
	}
	const byLabel = (a: SkillOption, b: SkillOption) =>
		a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }) || a.key.localeCompare(b.key);
	return { hard: hard.sort(byLabel), soft: soft.sort(byLabel) };
}

/**
 * The type chips: the types these experiences have (in EXPERIENCE_TYPE_ORDER), each with the
 * number of experiences of that type matching the selected skills, and `all` the number matching
 * the selected skills whatever their type.
 */
export function typeOptions(
	experiences: FilterableExperience[],
	filters: ExperienceFilters
): { all: number; types: { type: ExperienceType; count: number }[] } {
	const present = new Set(experiences.map((experience) => experience.type));
	const matchingSkills = applyFilters(experiences, { skills: filters.skills, types: [] });
	return {
		all: matchingSkills.length,
		types: EXPERIENCE_TYPE_ORDER.filter((type) => present.has(type)).map((type) => ({
			type,
			count: matchingSkills.filter((experience) => experience.type === type).length
		}))
	};
}

/** Selects or unselects a skill (new selections go last) */
export function toggleSkill(filters: ExperienceFilters, name: string): ExperienceFilters {
	const key = normalizeSkill(name);
	return {
		...filters,
		skills: filters.skills.includes(key)
			? filters.skills.filter((skill) => skill !== key)
			: [...filters.skills, key]
	};
}

/** Selects or unselects a type (kept in EXPERIENCE_TYPE_ORDER) */
export function toggleType(filters: ExperienceFilters, type: ExperienceType): ExperienceFilters {
	const selected = filters.types.includes(type)
		? filters.types.filter((existing) => existing !== type)
		: [...filters.types, type];
	return { ...filters, types: EXPERIENCE_TYPE_ORDER.filter((known) => selected.includes(known)) };
}

/**
 * Filters of a URL: one `skills` parameter per skill and one `type` per type
 * (`?skills=typescript&skills=kafka&type=professional`). Unknown types are ignored.
 */
export function filtersFromSearchParams(params: ReadableSearchParams): ExperienceFilters {
	return {
		skills: unique(params.getAll('skills').map(normalizeSkill)).filter(Boolean),
		types: unique(params.getAll('type').map((type) => type.trim().toLowerCase())).filter(
			isExperienceType
		)
	};
}

/** `base` with its filter parameters replaced by these filters (other parameters are kept) */
export function filtersToSearchParams(
	filters: ExperienceFilters,
	base: ReadableSearchParams
): URLSearchParams {
	const params = new URLSearchParams(base.toString());
	params.delete('skills');
	params.delete('type');
	for (const skill of unique(filters.skills.map(normalizeSkill)).filter(Boolean)) {
		params.append('skills', skill);
	}
	for (const type of unique(filters.types)) params.append('type', type);
	return params;
}
