import {
	SKILL_CATEGORIES,
	normalizeSkill,
	projectUsesSkillFamily,
	rankedSkills,
	skillDisplayName,
	skillFamilyKeys,
	skillTaxonomy,
	type DateInput,
	type RankedSkill,
	type SkillCategory,
	type SkillTaxonomy
} from 'portfolio-common';

// How a skill is named and matched (normalizeSkill, skillDisplayName) is portfolio-common's
// (common/models/experienceMonths.ts), so the API counts a skill on the same projects as the
// page. Families are the catalogue's (common/models/skills.ts): a skill can be part of another
// ('.NET Core' is part of '.NET'), and filtering by the one it is part of matches it too
// (projectUsesSkillFamily). A function that takes no taxonomy matches each skill alone.
export { normalizeSkill };
export type { RankedSkill, SkillTaxonomy };

/**
 * Filters of an experience list: `skills` holds normalized keys (see normalizeSkill), in the
 * order they were selected
 */
export type ExperienceFilters = { skills: string[] };

type SkillEntry = { skill?: unknown };
/** What the filters read of a project */
export type FilterableProject = {
	start?: DateInput;
	end?: DateInput;
	hardSkills?: SkillEntry[] | null;
	softSkills?: SkillEntry[] | null;
};
/** What the filters read of an experience (an API experience with populated skills fits) */
export type FilterableExperience = {
	start?: DateInput;
	end?: DateInput;
	projects?: FilterableProject[] | null;
};

/** URLSearchParams, or the read-only ones of SvelteKit's `page.url` */
export type ReadableSearchParams = Omit<URLSearchParams, 'set' | 'append' | 'delete' | 'sort'>;

/** A skill the list can be filtered by: its key and the label shown for it */
export type SkillOption = { key: string; label: string };

export const emptyFilters = (): ExperienceFilters => ({ skills: [] });

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const skillEntriesOf = (experience: FilterableExperience, kind: 'hardSkills' | 'softSkills') =>
	(experience.projects ?? []).flatMap((project) => project[kind] ?? []);

/** Keys of every skill (technical and soft) of an experience's projects */
function experienceSkillKeys(experience: FilterableExperience): Set<string> {
	const keys = new Set<string>();
	for (const entry of [
		...skillEntriesOf(experience, 'hardSkills'),
		...skillEntriesOf(experience, 'softSkills')
	]) {
		const name = skillDisplayName(entry);
		if (name) keys.add(normalizeSkill(name));
	}
	return keys;
}

/** No family: each skill matches alone */
const NO_FAMILIES: SkillTaxonomy = new Map();

/**
 * The filters that still apply to these experiences: selected skills that no experience has any
 * more (an edit removed them, or a shared link is out of date) have no chip left to clear them,
 * so they are dropped instead of hiding everything. A skill that only others are part of (the
 * owner uses '.NET Core', never '.NET' itself) has a chip, and stays. Also normalizes and dedupes
 * the selection. `taxonomy`: the one of these experiences, when the caller has it already.
 */
export function activeFilters(
	experiences: FilterableExperience[],
	filters: ExperienceFilters,
	taxonomy: SkillTaxonomy = skillTaxonomy(experiences)
): ExperienceFilters {
	return {
		skills: unique(filters.skills.map(normalizeSkill)).filter((key) => taxonomy.has(key))
	};
}

export const hasActiveFilters = (filters: ExperienceFilters): boolean => filters.skills.length > 0;

/**
 * The experiences matching the filters, in their order: those with a project using any of the
 * selected skills, or a skill that is part of one (none selected = all). Stale selections are
 * ignored (see activeFilters).
 */
export function applyFilters<T extends FilterableExperience>(
	experiences: T[],
	filters: ExperienceFilters,
	taxonomy: SkillTaxonomy = skillTaxonomy(experiences)
): T[] {
	const { skills } = activeFilters(experiences, filters, taxonomy);
	if (skills.length === 0) return experiences;
	const wanted = new Set(skills.flatMap((key) => skillFamilyKeys(key, taxonomy)));
	return experiences.filter((experience) => {
		for (const key of experienceSkillKeys(experience)) if (wanted.has(key)) return true;
		return false;
	});
}

/**
 * Whether a skill (by display name) is the skill `key` names, or part of it: '.NET Core' is
 * '.net core', and matches '.net' too once the taxonomy says it is part of it
 */
export function skillMatchesKey(
	displayName: string,
	key: string,
	taxonomy: SkillTaxonomy = NO_FAMILIES
): boolean {
	return skillFamilyKeys(key, taxonomy).includes(normalizeSkill(displayName));
}

/** Whether a skill chip (by display name) matches the selected skills: one of them, or part of one */
export function isSkillHighlighted(
	filters: ExperienceFilters,
	displayName: string,
	taxonomy: SkillTaxonomy = NO_FAMILIES
): boolean {
	return filters.skills.some((key) => skillMatchesKey(displayName, key, taxonomy));
}

/**
 * Whether a project uses any of the selected skills, or a skill that is part of one (never when
 * none is selected), as portfolio-common's projectUsesSkillFamily says
 */
export function projectMatchesFilters(
	project: FilterableProject,
	filters: ExperienceFilters,
	taxonomy: SkillTaxonomy = NO_FAMILIES
): boolean {
	if (filters.skills.length === 0) return false;
	return filters.skills.some((key) => projectUsesSkillFamily(project, key, taxonomy));
}

/**
 * Whether a project of the experience uses the skill (by key, see normalizeSkill), or a skill
 * that is part of it
 */
export function experienceUsesSkill(
	experience: FilterableExperience,
	key: string,
	taxonomy: SkillTaxonomy = NO_FAMILIES
): boolean {
	const keys = experienceSkillKeys(experience);
	return skillFamilyKeys(key, taxonomy).some((family) => keys.has(family));
}

/**
 * The skills of some experiences by name, grouped ignoring case. Each is labelled with its most
 * used spelling (ties: the first seen) and listed once, as technical or soft depending on how it
 * is used most (ties: technical). Sorted alphabetically. The filters' panel lists them by time
 * used instead (skillIndex, on portfolio-common's rankedSkills, which names and sorts each skill
 * into technical or soft by these same rules: client/src/services/tests/skillCatalogue.test.ts)
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
				const name = skillDisplayName(entry);
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

// ---------------------------------------------------------------------------------------------
// The skills of a page, ranked: what the filters' panel and the cards' tags are ordered by

/** The skills of a page: their families, and every one of them once, the most used first */
export type SkillIndex = {
	taxonomy: SkillTaxonomy;
	/** See portfolio-common's rankedSkills: by time used, then projects, then label */
	ranked: RankedSkill[];
	byKey: ReadonlyMap<string, RankedSkill>;
	/** Where each skill stands in `ranked` (0: the most used) */
	rank: ReadonlyMap<string, number>;
};

/** The skills of these experiences (every experience of the page, unfiltered), read once */
export function skillIndex(
	experiences: FilterableExperience[],
	now: Date = new Date()
): SkillIndex {
	const taxonomy = skillTaxonomy(experiences);
	const ranked = rankedSkills(experiences, now, taxonomy);
	return {
		taxonomy,
		ranked,
		byKey: new Map(ranked.map((skill) => [skill.key, skill])),
		rank: new Map(ranked.map((skill, index) => [skill.key, index]))
	};
}

/**
 * Whether a skill is listed with the soft skills: by its category when the catalogue gave it one,
 * else by how the owner listed it
 */
export const isSoftSkill = (skill: Pick<RankedSkill, 'kind' | 'category'>): boolean =>
	skill.category ? skill.category === 'soft' : skill.kind === 'soft';

/**
 * How many skills the panel shows before "All N skills": fixed counts, so the server renders the
 * rows without measuring anything. Small screens (under md) show fewer technical ones.
 */
export const COLLAPSED_SKILLS = { hard: 8, hardSmall: 5, soft: 5 } as const;

export type CollapsedSkill = {
	skill: RankedSkill;
	/** Shown on small screens too (the rest only from md up) */
	small: boolean;
};

export type CollapsedSkills = {
	/** The "Most used" row: the top technical skills, a family folded into the skill it is part of */
	hard: CollapsedSkill[];
	/** The "Soft skills" row */
	soft: CollapsedSkill[];
	/**
	 * Whether skills are left behind "All N skills": on every screen, on small screens only, or
	 * on none (the rows show them all: no button)
	 */
	more: 'always' | 'small' | 'never';
	/** N: every skill of the page */
	total: number;
};

/**
 * The rows of the collapsed panel. The selected skills are always among them: those the rows
 * would leave out (further down the ranking, or part of another skill) go last, in the order
 * they were selected.
 */
export function collapsedSkills(
	index: SkillIndex,
	selected: readonly string[] = []
): CollapsedSkills {
	const top = index.ranked.filter((skill) => !skill.parentKey);
	const hardTop = top.filter((skill) => !isSoftSkill(skill));
	const softTop = top.filter(isSoftSkill);
	const hard: CollapsedSkill[] = hardTop.slice(0, COLLAPSED_SKILLS.hard).map((skill, position) => ({
		skill,
		small: position < COLLAPSED_SKILLS.hardSmall || selected.includes(skill.key)
	}));
	const soft: CollapsedSkill[] = softTop
		.slice(0, COLLAPSED_SKILLS.soft)
		.map((skill) => ({ skill, small: true }));
	const fitting = hard.length + soft.length;

	const shown = new Set([...hard, ...soft].map(({ skill }) => skill.key));
	for (const key of selected) {
		const skill = index.byKey.get(key);
		if (!skill || shown.has(key)) continue;
		shown.add(key);
		(isSoftSkill(skill) ? soft : hard).push({ skill, small: true });
	}

	return {
		hard,
		soft,
		more:
			index.ranked.length > fitting
				? 'always'
				: hardTop.length > COLLAPSED_SKILLS.hardSmall
					? 'small'
					: 'never',
		total: index.ranked.length
	};
}

/** A skill and the skills that are part of it, the most used first */
export type SkillFamily = { skill: RankedSkill; children: RankedSkill[] };

export type SkillGroup = {
	/** The category the group is headed with; none when no skill of the page has a category */
	category?: SkillCategory;
	/** Without categories: the technical skills, then the soft ones */
	kind: 'hard' | 'soft';
	/** How many skills it lists, those that are part of another included */
	count: number;
	/** The most used first, each with the skills that are part of it */
	families: SkillFamily[];
};

export type SkillGroups = {
	/** Whether the groups are categories (a skill of the page has one), or the two kinds */
	categorized: boolean;
	groups: SkillGroup[];
	/** How many skills the groups list in all */
	count: number;
};

/** The order of the groups: the catalogue's, the skills without a category with `other`, soft last */
const GROUP_ORDER: readonly SkillCategory[] = [
	...SKILL_CATEGORIES.filter((category) => category !== 'soft' && category !== 'other'),
	'other',
	'soft'
];

/**
 * Every skill of the page for the expanded panel, the ones whose label holds `query` (ignoring
 * case and accents) when there is one: grouped by category in the catalogue's order (soft skills last, those without a
 * category with "Other" right before them), each group sorted by time used, a skill followed by
 * the skills that are part of it, whatever their own category (a skill without a category is
 * listed under theirs). Without a single category, two
 * groups, technical then soft, as the owner listed them. A skill that matches the query while
 * the skill it is part of does not is listed alone, where its family would be.
 */
export function skillGroups(index: SkillIndex, query = ''): SkillGroups {
	// For this search only, accents aside ('neg' finds 'Négociation', however the accent was
	// typed): never in normalizeSkill, which is a skill's key
	const fold = (value: string) => normalizeSkill(value.normalize('NFD').replace(/\p{M}/gu, ''));
	const text = fold(query);
	const matches = (skill: RankedSkill) => !text || fold(skill.label).includes(text);
	const categorized = index.ranked.some((skill) => skill.category);
	// A skill the catalogue gave no category yet goes with the skills that are part of it (the
	// most used of them that has one)
	const categoryOf = (skill: RankedSkill): SkillCategory | undefined =>
		skill.category ??
		skill.childKeys.map((key) => index.byKey.get(key)?.category).find((category) => category);
	const groupOf = (skill: RankedSkill): SkillCategory => {
		const category = categoryOf(skill);
		if (category ? category === 'soft' : skill.kind === 'soft') return 'soft';
		return categorized ? (category ?? 'other') : 'other';
	};

	const byGroup = new Map<SkillCategory, SkillFamily[]>();
	for (const skill of index.ranked) {
		if (skill.parentKey) continue;
		const children = skill.childKeys.flatMap((key) => index.byKey.get(key) ?? []).filter(matches);
		const families: SkillFamily[] = matches(skill)
			? [{ skill, children }]
			: children.map((child) => ({ skill: child, children: [] }));
		if (families.length === 0) continue;
		const group = groupOf(skill);
		byGroup.set(group, [...(byGroup.get(group) ?? []), ...families]);
	}

	const groups: SkillGroup[] = GROUP_ORDER.flatMap((category) => {
		const families = byGroup.get(category);
		if (!families) return [];
		return {
			...(categorized ? { category } : {}),
			kind: category === 'soft' ? ('soft' as const) : ('hard' as const),
			count: families.reduce((sum, family) => sum + 1 + family.children.length, 0),
			families
		};
	});
	return { categorized, groups, count: groups.reduce((sum, group) => sum + group.count, 0) };
}

/**
 * The tags of a project's card: beyond `shown` of a kind the rest fold behind a "+N" button,
 * unless that would hide fewer than `minFolded` (the button takes the room of a tag)
 */
export const CARD_SKILLS = { shown: 6, minFolded: 2 } as const;

/** These skills (by display name), the most used on the page first; those it does not rank last */
export function orderSkillsByRank<T extends { displayName: string }>(
	skills: readonly T[],
	rank: ReadonlyMap<string, number>
): T[] {
	const at = (skill: T) => rank.get(normalizeSkill(skill.displayName)) ?? Infinity;
	return skills
		.map((skill, position) => ({ skill, position, rank: at(skill) }))
		.sort((a, b) => (a.rank === b.rank ? a.position - b.position : a.rank < b.rank ? -1 : 1))
		.map(({ skill }) => skill);
}

/**
 * The tags of a card that show, and those folded behind "+N": the first CARD_SKILLS.shown, and
 * any `pinned` one after them (it matches the filters, or the skill being previewed: never hidden)
 */
export function foldSkills<T>(
	skills: readonly T[],
	pinned: (skill: T) => boolean = () => false
): { shown: T[]; hidden: T[] } {
	if (skills.length - CARD_SKILLS.shown < CARD_SKILLS.minFolded) {
		return { shown: [...skills], hidden: [] };
	}
	const shown: T[] = [];
	const hidden: T[] = [];
	skills.forEach((skill, position) =>
		(position < CARD_SKILLS.shown || pinned(skill) ? shown : hidden).push(skill)
	);
	return { shown, hidden };
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
