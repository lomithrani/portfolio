/**
 * Filters of an experience list: `skills` holds normalized keys (see normalizeSkill), in the
 * order they were selected
 */
export type ExperienceFilters = { skills: string[] };

type SkillEntry = { skill?: unknown };
/** What the filters read of a project */
export type FilterableProject = {
	hardSkills?: SkillEntry[] | null;
	softSkills?: SkillEntry[] | null;
};
/** What the filters read of an experience (an API experience with populated skills fits) */
export type FilterableExperience = { projects?: FilterableProject[] | null };

/** URLSearchParams, or the read-only ones of SvelteKit's `page.url` */
export type ReadableSearchParams = Omit<URLSearchParams, 'set' | 'append' | 'delete' | 'sort'>;

/** A skill the list can be filtered by: its key and the label shown for it */
export type SkillOption = { key: string; label: string };

export const emptyFilters = (): ExperienceFilters => ({ skills: [] });

/** Key of a skill name: skills match ignoring case and surrounding spaces ('TypeScript ' = 'typescript') */
export function normalizeSkill(name: string): string {
	return name.trim().toLowerCase();
}

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
 * The filters that still apply to these experiences: selected skills that no experience has any
 * more (an edit removed them, or a shared link is out of date) have no chip left to clear them,
 * so they are dropped instead of hiding everything. Also normalizes and dedupes the selection.
 */
export function activeFilters(
	experiences: FilterableExperience[],
	filters: ExperienceFilters
): ExperienceFilters {
	const skillKeys = new Set(
		experiences.flatMap((experience) => [...experienceSkillKeys(experience)])
	);
	return {
		skills: unique(filters.skills.map(normalizeSkill)).filter((key) => skillKeys.has(key))
	};
}

export const hasActiveFilters = (filters: ExperienceFilters): boolean => filters.skills.length > 0;

/**
 * The experiences matching the filters, in their order: those with a project using any of the
 * selected skills (none selected = all). Stale selections are ignored (see activeFilters).
 */
export function applyFilters<T extends FilterableExperience>(
	experiences: T[],
	filters: ExperienceFilters
): T[] {
	const { skills } = activeFilters(experiences, filters);
	if (skills.length === 0) return experiences;
	return experiences.filter((experience) => {
		const keys = experienceSkillKeys(experience);
		return skills.some((key) => keys.has(key));
	});
}

/** Whether a skill chip (by display name) matches the selected skills */
export function isSkillHighlighted(filters: ExperienceFilters, displayName: string): boolean {
	return filters.skills.includes(normalizeSkill(displayName));
}

/** Whether a project uses any of the selected skills (never when none is selected) */
export function projectMatchesFilters(
	project: FilterableProject,
	filters: ExperienceFilters
): boolean {
	if (filters.skills.length === 0) return false;
	return [...(project.hardSkills ?? []), ...(project.softSkills ?? [])].some((entry) => {
		const name = displayNameOf(entry);
		return name !== undefined && filters.skills.includes(normalizeSkill(name));
	});
}

/** Whether a project of the experience uses the skill (by key, see normalizeSkill) */
export function experienceUsesSkill(experience: FilterableExperience, key: string): boolean {
	return experienceSkillKeys(experience).has(normalizeSkill(key));
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

/** Filters of a URL: one `skills` parameter per skill (`?skills=typescript&skills=kafka`) */
export function filtersFromSearchParams(params: ReadableSearchParams): ExperienceFilters {
	return { skills: unique(params.getAll('skills').map(normalizeSkill)).filter(Boolean) };
}

/** `base` with its filter parameters replaced by these filters (other parameters are kept) */
export function filtersToSearchParams(
	filters: ExperienceFilters,
	base: ReadableSearchParams
): URLSearchParams {
	const params = new URLSearchParams(base.toString());
	params.delete('skills');
	// Links from when experiences could also be filtered by type
	params.delete('type');
	for (const skill of unique(filters.skills.map(normalizeSkill)).filter(Boolean)) {
		params.append('skills', skill);
	}
	return params;
}
