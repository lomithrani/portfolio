// The skill catalogue of the site: what it knows of a skill beyond the name people typed (its
// category, the family it is part of, its other spellings), the search that suggests skills while
// an owner types one, and how the experiences page counts with it (a family's months, the skills
// ranked by time used). Built on the month arithmetic of experienceMonths.ts, which it leaves as
// it is: the anonymous card of matching counts with that alone, never with anything here (a
// category, a family or an alias may come from a model, see parseSkillClassification).
import { EXPERIENCE_LIMITS } from './experienceLimits';
import { normalizeSkill, skillDisplayName, skillMonths, skillUsesByKey } from './experienceMonths';
import type { DateInput } from './experienceMonths';
import { cleanIssueText } from './issueText';
import { skillMessages } from './skills.messages';

/**
 * The categories of the catalogue, in the order the experiences page lists them (soft skills
 * last, `other` right before them)
 */
export const SKILL_CATEGORIES = [
	'language',
	'framework',
	'infrastructure',
	'data',
	'security',
	'practice',
	'tool',
	'soft',
	'other'
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const isSkillCategory = (value: unknown): value is SkillCategory =>
	typeof value === 'string' && (SKILL_CATEGORIES as readonly string[]).includes(value);

/** The heading of a category, in the language in use: read it when it is shown */
export const skillCategoryLabel = (category: SkillCategory): string =>
	skillMessages.category[category];

/**
 * Where a skill of the catalogue stands with the classifier. `pending`: not classified yet (a
 * skill without a classification is pending too). `classified`: the classifier recognised it.
 * `rejected`: the classifier does not recognise it as a skill (kept, shown to its owner as typed,
 * never suggested to anyone else). `manual`: set by the operator or a seed, which the classifier
 * never touches.
 */
export const SKILL_CLASSIFICATION_STATUSES = [
	'pending',
	'classified',
	'rejected',
	'manual'
] as const;
export type SkillClassificationStatus = (typeof SKILL_CLASSIFICATION_STATUSES)[number];

/** The statuses of the skills the search suggests: a name is never suggested before it was recognised */
export const SUGGESTABLE_SKILL_STATUSES: readonly SkillClassificationStatus[] = [
	'classified',
	'manual'
];

/** Why a spelling is another name of a skill (the classifier says which, see parseSkillClassification) */
export const SKILL_ALIAS_KINDS = ['abbreviation', 'spelling', 'rename'] as const;
export type SkillAliasKind = (typeof SKILL_ALIAS_KINDS)[number];

/** The limits of the classifier: names per call, catalogue names sent with them, tries per skill */
export const SKILL_CLASSIFICATION = {
	/** Skill names classified by one call */
	batchSize: 40,
	/** Canonical names of the catalogue sent with a batch, so parents and aliases reuse them */
	knownNames: 500,
	/** After this many failed tries a skill is skipped, until an operator resets it */
	maxAttempts: 3
} as const;

/** The rules of the skill search (GET /skills/search): the text it takes, what it answers */
export const SKILL_SEARCH = {
	minLength: 1,
	maxLength: EXPERIENCE_LIMITS.skillName,
	/** Skills suggested at most */
	results: 8,
	/** How long the field waits after a keystroke before it asks */
	debounceMs: 250
} as const;

/** What was typed, as it is searched: trimmed, its runs of spaces as one */
export const skillSearchText = (raw: string): string => raw.replace(/\s+/g, ' ').trim();

/** Whether `text` (as skillSearchText left it) can be searched: neither empty nor too long */
export const canSearchSkill = (text: string): boolean =>
	text.length >= SKILL_SEARCH.minLength && text.length <= SKILL_SEARCH.maxLength;

/** A skill of the catalogue suggested for what was typed */
export interface SkillSuggestion {
	/** Its canonical spelling: what picking the suggestion adds */
	name: string;
	category?: SkillCategory;
	/** The canonical spelling of the skill it is part of ('.NET' for '.NET Core') */
	parent?: string;
	/** The spelling that matched, when it is not `name`: typed 'k8s' → { name: 'Kubernetes', alias: 'K8s' } */
	alias?: string;
}

/** The skill a skill is part of, as the API presents it with that skill */
export interface PresentedSkillParent {
	_id: string;
	displayName: string;
	category?: SkillCategory;
}

/**
 * A skill of a project as the API presents it (GET /domain/:name, POST and PUT /experiences): its
 * canonical spelling (an entry stored under another spelling of a skill is shown as that skill),
 * its category and the skill it is part of. Never its other spellings, nor where it stands with
 * the classifier.
 */
export interface PresentedSkill {
	_id: string;
	displayName: string;
	category?: SkillCategory;
	parent?: PresentedSkillParent;
}

// ---------------------------------------------------------------------------------------------
// Families: a skill can be part of another ('.NET Core' is part of '.NET'), one level only

/** A skill of a project as the API sends it: `skill` populated (see PresentedSkill) */
type SkillEntry = { skill?: unknown };
type SkilledProject = {
	start?: DateInput;
	end?: DateInput;
	hardSkills?: readonly SkillEntry[] | null;
	softSkills?: readonly SkillEntry[] | null;
};
type SkilledExperience<P extends SkilledProject = SkilledProject> = {
	start?: DateInput;
	end?: DateInput;
	projects?: readonly P[] | null;
};

/** A skill of these experiences, as the catalogue places it */
export interface SkillTaxonomyNode {
	/** See normalizeSkill */
	key: string;
	/** Its most used spelling (ties: the first seen) */
	label: string;
	category?: SkillCategory;
	/** The key of the skill it is part of. A skill that has one is never a parent itself */
	parentKey?: string;
	/** The keys of the skills that are part of it, in the order they were first seen */
	childKeys: readonly string[];
}

/**
 * The skills of some experiences by key (see normalizeSkill), with their families. A skill only
 * named as the parent of another (the owner uses '.NET Core', never '.NET' itself) has a node too.
 */
export type SkillTaxonomy = ReadonlyMap<string, SkillTaxonomyNode>;

const entriesOf = (project: SkilledProject): SkillEntry[] => [
	...(project.hardSkills ?? []),
	...(project.softSkills ?? [])
];

const categoryOf = (skill: unknown): SkillCategory | undefined => {
	if (!skill || typeof skill !== 'object' || !('category' in skill)) return undefined;
	const category = (skill as { category?: unknown }).category;
	return isSkillCategory(category) ? category : undefined;
};

/** The most counted spelling: a later one wins only with strictly more uses (a Map keeps its order) */
const mostUsed = (spellings: ReadonlyMap<string, number>): string => {
	let label = '';
	let uses = 0;
	for (const [spelling, count] of spellings) {
		if (count > uses) {
			label = spelling;
			uses = count;
		}
	}
	return label;
};

const count = (counts: Map<string, number>, name: string) =>
	counts.set(name, (counts.get(name) ?? 0) + 1);

/**
 * The taxonomy of these experiences, read from the populated skill entries of their projects
 * (`skill.displayName`, `skill.category`, `skill.parent.displayName`, as the API presents them:
 * PresentedSkill). Families have one level: a parent that is itself part of another skill hands
 * its children to that one, a skill is never its own parent, and skills that would be each
 * other's parent have none.
 */
export function skillTaxonomy(experiences: readonly SkilledExperience[]): SkillTaxonomy {
	type Seen = {
		/** How it is spelled where it is used */
		spellings: Map<string, number>;
		/** How it is spelled where it is named as a parent */
		referenced: Map<string, number>;
		category?: SkillCategory;
		referencedCategory?: SkillCategory;
		parent?: string;
	};
	const seen = new Map<string, Seen>();
	const at = (key: string): Seen => {
		let node = seen.get(key);
		if (!node) {
			node = { spellings: new Map(), referenced: new Map() };
			seen.set(key, node);
		}
		return node;
	};

	for (const experience of experiences) {
		for (const project of experience.projects ?? []) {
			for (const entry of entriesOf(project)) {
				const name = skillDisplayName(entry);
				if (name === undefined) continue;
				const key = normalizeSkill(name);
				const node = at(key);
				count(node.spellings, name);
				node.category ??= categoryOf(entry.skill);

				const parent = (entry.skill as { parent?: unknown }).parent;
				const parentName = skillDisplayName({ skill: parent });
				if (parentName === undefined) continue;
				const parentKey = normalizeSkill(parentName);
				if (parentKey === key) continue;
				node.parent ??= parentKey;
				const parentNode = at(parentKey);
				count(parentNode.referenced, parentName);
				parentNode.referencedCategory ??= categoryOf(parent);
			}
		}
	}

	// One level: each skill hangs from the root of its chain of parents
	const rootOf = (key: string): string | undefined => {
		const walked = new Set([key]);
		let current = key;
		for (;;) {
			const next = seen.get(current)?.parent;
			if (next === undefined) break;
			if (walked.has(next)) {
				// A loop: a skill of the loop has no parent, one that leads into it hangs from where it enters
				if (next === key) return undefined;
				current = next;
				break;
			}
			walked.add(next);
			current = next;
		}
		return current === key ? undefined : current;
	};

	const nodes = new Map<string, SkillTaxonomyNode & { childKeys: string[] }>();
	for (const [key, node] of seen) {
		const parentKey = rootOf(key);
		const category = node.category ?? node.referencedCategory;
		nodes.set(key, {
			key,
			label: mostUsed(node.spellings) || mostUsed(node.referenced),
			...(category ? { category } : {}),
			...(parentKey ? { parentKey } : {}),
			childKeys: []
		});
	}
	for (const node of nodes.values()) {
		if (node.parentKey) nodes.get(node.parentKey)?.childKeys.push(node.key);
	}
	return nodes;
}

/** The keys a skill stands for: its own, and those of the skills that are part of it */
export function skillFamilyKeys(key: string, taxonomy: SkillTaxonomy): string[] {
	const own = normalizeSkill(key);
	return [own, ...(taxonomy.get(own)?.childKeys ?? [])];
}

const projectSkillKeys = (project: SkilledProject): Set<string> => {
	const keys = new Set<string>();
	for (const entry of entriesOf(project)) {
		const name = skillDisplayName(entry);
		if (name !== undefined) keys.add(normalizeSkill(name));
	}
	return keys;
};

/**
 * Whether a project uses a skill or a skill that is part of it (by name or key, see
 * normalizeSkill), technical or soft: '.NET' matches the projects using '.NET' or '.NET Core',
 * '.NET Core' only its own. What the filters of the experiences page match with.
 */
export function projectUsesSkillFamily(
	project: SkilledProject,
	skill: string,
	taxonomy: SkillTaxonomy
): boolean {
	const keys = projectSkillKeys(project);
	return skillFamilyKeys(skill, taxonomy).some((key) => keys.has(key));
}

/** A skill of some experiences with how much it was used: what the experiences page ranks */
export interface RankedSkill {
	/** See normalizeSkill */
	key: string;
	/** Its most used spelling (ties: the first seen) */
	label: string;
	/** Technical or soft, by how it is listed most (ties: technical); a parent never used itself, as its children */
	kind: 'hard' | 'soft';
	/**
	 * The calendar months it was used (see skillMonths): for a parent, those of its family (itself
	 * and the skills that are part of it), each month counted once
	 */
	months: number;
	/** The months of the projects using the skill itself */
	ownMonths: number;
	/** How many projects use it: for a parent, it or a skill that is part of it */
	projects: number;
	/** How many projects use the skill itself (0 for a parent only named by its children) */
	ownProjects: number;
	category?: SkillCategory;
	parentKey?: string;
	/** The skills that are part of it, the most used first (the order of the ranking) */
	childKeys: string[];
}

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every skill of these experiences once (technical and soft, a parent only named by its children
 * included), the most used first: by months, then by projects, then by label. `taxonomy`: the
 * one of these experiences (skillTaxonomy), when the caller has it already.
 */
export function rankedSkills<P extends SkilledProject>(
	experiences: readonly SkilledExperience<P>[],
	now: Date = new Date(),
	taxonomy: SkillTaxonomy = skillTaxonomy(experiences)
): RankedSkill[] {
	// Each project's keys read once, and how each skill is listed (technical or soft)
	const keysOf = new Map<P, Set<string>>();
	const listed = new Map<string, { hard: number; soft: number }>();
	for (const experience of experiences) {
		for (const project of experience.projects ?? []) {
			keysOf.set(project, projectSkillKeys(project));
			for (const kind of ['hardSkills', 'softSkills'] as const) {
				for (const entry of project[kind] ?? []) {
					const name = skillDisplayName(entry);
					if (name === undefined) continue;
					const key = normalizeSkill(name);
					const uses = listed.get(key) ?? { hard: 0, soft: 0 };
					uses[kind === 'hardSkills' ? 'hard' : 'soft'] += 1;
					listed.set(key, uses);
				}
			}
		}
	}

	const own = skillUsesByKey(experiences, now);
	const ranked: RankedSkill[] = [];
	for (const node of taxonomy.values()) {
		const ownUse = own.get(node.key);
		const ownMonths = ownUse?.months ?? 0;
		const ownProjects = ownUse?.projects ?? 0;
		let months = ownMonths;
		let projects = ownProjects;
		const uses = { ...(listed.get(node.key) ?? { hard: 0, soft: 0 }) };
		if (node.childKeys.length > 0) {
			const family = [node.key, ...node.childKeys];
			const usesFamily = (project: P) => {
				const keys = keysOf.get(project);
				return keys !== undefined && family.some((key) => keys.has(key));
			};
			months = skillMonths(experiences, usesFamily, now);
			projects = 0;
			for (const project of keysOf.keys()) if (usesFamily(project)) projects += 1;
			// Never used itself: technical or soft as the skills that are part of it
			if (uses.hard + uses.soft === 0) {
				for (const key of node.childKeys) {
					uses.hard += listed.get(key)?.hard ?? 0;
					uses.soft += listed.get(key)?.soft ?? 0;
				}
			}
		}
		ranked.push({
			key: node.key,
			label: node.label,
			kind: uses.soft > uses.hard ? 'soft' : 'hard',
			months,
			ownMonths,
			projects,
			ownProjects,
			...(node.category ? { category: node.category } : {}),
			...(node.parentKey ? { parentKey: node.parentKey } : {}),
			childKeys: [...node.childKeys]
		});
	}

	ranked.sort(
		(a, b) =>
			b.months - a.months ||
			b.projects - a.projects ||
			a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }) ||
			byCodeUnit(a.key, b.key)
	);
	const rank = new Map(ranked.map((skill, index) => [skill.key, index]));
	for (const skill of ranked) {
		skill.childKeys.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
	}
	return ranked;
}

// ---------------------------------------------------------------------------------------------
// The classifier's answer: untrusted (a model wrote it, from names people typed), so every part of
// it passes these rules before anything is stored, and what breaks one is dropped

/** What the classifier says of one skill name, once checked */
export type SkillClassification =
	| {
			/** The name that was asked, as asked */
			name: string;
			/** Not a skill: nothing else is kept */
			recognised: false;
	  }
	| {
			name: string;
			recognised: true;
			/** The name with its casing and spacing corrected ('c#' → 'C#'), else the name as asked */
			canonical: string;
			category?: SkillCategory;
			/** The skill it is a flavour, an edition or a part of ('.NET' for '.NET Core'). Never with `aliasOf` */
			parent?: string;
			/** The skill it is another name of ('Kubernetes' for 'K8s'), always with `aliasKind` */
			aliasOf?: string;
			aliasKind?: SkillAliasKind;
	  };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** A scheme (`https://`) or `www.`: a skill name is never a link. 'Node.js' and 'ASP.NET' are none */
const SKILL_NAME_LINK = /[a-z][a-z0-9+.-]*:\/\/|(^|[^a-z0-9])www\./i;
const SKILL_NAME_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/**
 * A skill name written by the classifier (a parent, the skill a spelling is an alias of, a
 * corrected spelling), cleaned like a text people type: nothing invisible (cleanIssueText), its
 * runs of spaces as one, at most EXPERIENCE_LIMITS.skillName characters. Undefined for what is
 * not a name: not a text, empty, too long, on several lines, a link or an email address.
 */
export function cleanSkillName(value: unknown): string | undefined {
	// Longer than any name: never worth cleaning
	if (typeof value !== 'string' || value.length > EXPERIENCE_LIMITS.skillName * 10)
		return undefined;
	const cleaned = cleanIssueText(value);
	if (cleaned.includes('\n')) return undefined;
	const name = cleaned.replace(/\s+/g, ' ').trim();
	if (!name || name.length > EXPERIENCE_LIMITS.skillName) return undefined;
	// As a reader would take it: full-width and other compatibility forms folded ('＠' is '@')
	const read = name.normalize('NFKC');
	if (SKILL_NAME_LINK.test(read) || SKILL_NAME_EMAIL.test(read)) return undefined;
	return name;
}

/** A skill name without its case and spaces: 'Node JS' and 'nodejs' are the same spelling corrected */
const foldSkillName = (name: string): string => normalizeSkill(name).replace(/\s+/g, '');

/** Whether two skill names are one, ignoring case and spaces ('C #' and 'c#') */
export const sameSkillSpelling = (a: string, b: string): boolean =>
	foldSkillName(a) === foldSkillName(b);

/**
 * The classifier's answer for the names `asked`, checked: one result per asked name, at its
 * index, `undefined` where the answer has nothing usable for it (the skill stays pending).
 *
 * `raw` is `{ skills: [...] }` (or the array itself), each item an object for one asked name:
 * `{ index?, recognised, canonical?, category?, parent?, aliasOf?, aliasKind? }`. An item is
 * matched by its `index` (an integer, the position of the name in `asked`) when it has one, else
 * by its position in the array; the first item for a name decides, later ones are ignored.
 *
 * What breaks a rule is dropped for that skill alone, never the batch, and nothing throws:
 * - an item that is not an object, whose `index` names no asked name, or whose `recognised` is
 *   not a boolean gives nothing;
 * - not recognised: `{ name, recognised: false }` and nothing else;
 * - `canonical` is kept only when it is the asked name ignoring case and spaces (a corrected
 *   spelling: 'c#' → 'C#'), else the asked name is;
 * - `category` must be one of SKILL_CATEGORIES;
 * - `parent` and `aliasOf` are cleaned (cleanSkillName) and are never the skill itself;
 * - `aliasOf` needs an `aliasKind` of SKILL_ALIAS_KINDS;
 * - an alias has neither a parent nor a category of its own: with a valid `aliasOf`, `parent`
 *   and `category` are dropped.
 */
export function parseSkillClassification(
	raw: unknown,
	asked: readonly string[]
): (SkillClassification | undefined)[] {
	const results: (SkillClassification | undefined)[] = asked.map(() => undefined);
	const items = Array.isArray(raw)
		? raw
		: isRecord(raw) && Array.isArray(raw.skills)
			? raw.skills
			: [];
	const decided = new Set<number>();

	items.forEach((item: unknown, position: number) => {
		try {
			checkItem(item, position);
		} catch {
			// Nothing usable for this name: it stays pending
		}
	});
	return results;

	function checkItem(item: unknown, position: number): void {
		if (!isRecord(item)) return;
		const index = 'index' in item ? item.index : position;
		if (typeof index !== 'number' || !Number.isInteger(index)) return;
		if (index < 0 || index >= asked.length || decided.has(index)) return;
		decided.add(index);

		const name = asked[index];
		if (typeof name !== 'string') return;
		if (item.recognised === false) {
			results[index] = { name, recognised: false };
			return;
		}
		if (item.recognised !== true) return;

		const corrected = cleanSkillName(item.canonical);
		const canonical =
			corrected !== undefined && sameSkillSpelling(corrected, name) ? corrected : name.trim();
		const other = (value: unknown) => {
			const cleaned = cleanSkillName(value);
			return cleaned !== undefined && !sameSkillSpelling(cleaned, name) ? cleaned : undefined;
		};

		const aliasKind = SKILL_ALIAS_KINDS.find((kind) => kind === item.aliasKind);
		const aliasOf = aliasKind ? other(item.aliasOf) : undefined;
		if (aliasOf !== undefined) {
			results[index] = { name, recognised: true, canonical, aliasOf, aliasKind };
			return;
		}
		const parent = other(item.parent);
		results[index] = {
			name,
			recognised: true,
			canonical,
			...(isSkillCategory(item.category) ? { category: item.category } : {}),
			...(parent !== undefined ? { parent } : {})
		};
	}
}
