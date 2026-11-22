import {
	EXPERIENCE_LIMITS,
	SKILL_SEARCH,
	canSearchSkill,
	isSkillCategory,
	skillSearchText,
	type SkillSuggestion
} from 'portfolio-common';
import { normalizeSkillNames } from './experienceForm.ts';
import { textApi } from './portfolio.ts';

// The skill search of the experience editor (GET /skills/search): while an owner types a skill,
// the skills of the site's catalogue that it could be, next to the skills they already use. It
// only ever suggests: any name can be typed and saved, and a search that fails, is refused or is
// not there leaves the field with the owner's own skills, without a word.

const withCredentials = { credentials: 'include' } as const;

/** The owner's own skills suggested at most (the rest of the list is the catalogue's) */
const OWN_SUGGESTIONS = 6;

/** How long the field stops asking after a search that failed, without a wait of its own */
const PAUSE_MS = { refused: 60_000, failed: 10_000, longest: 5 * 60_000 } as const;

/**
 * What a search answered: the skills found (none: the catalogue has no such skill), `off` on a
 * site without the search (nothing asks again), `unavailable` when it could not be searched right
 * now (too many searches, no session, the API away), with how long to wait before asking again
 */
export type SkillSearchOutcome =
	| { status: 'found'; skills: SkillSuggestion[] }
	| { status: 'off' }
	| { status: 'unavailable'; retryAfterMs: number };

/** A refusal's Retry-After, in milliseconds; undefined without a usable one */
const retryAfterMs = (response: Response | undefined): number | undefined => {
	const value = response?.headers.get('retry-after')?.trim() ?? '';
	const seconds = /^\d+$/.test(value) ? Number(value) : NaN;
	return Number.isSafeInteger(seconds) && seconds > 0 ? seconds * 1000 : undefined;
};

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * The suggestions of an answer, keeping only what the field shows: a name, and when they are
 * given a category of the catalogue, the skill it is part of and the spelling that matched.
 * Anything else is dropped, and an answer that is not one is no suggestion
 */
export const readSkillSuggestions = (answer: unknown): SkillSuggestion[] => {
	const listed =
		answer && typeof answer === 'object' ? (answer as { skills?: unknown }).skills : undefined;
	if (!Array.isArray(listed)) return [];
	const skills: SkillSuggestion[] = [];
	for (const entry of listed) {
		if (!entry || typeof entry !== 'object') continue;
		const { name, category, parent, alias } = entry as Record<string, unknown>;
		const named = text(name);
		if (!named || named.length > EXPERIENCE_LIMITS.skillName) continue;
		const parentName = text(parent);
		const aliasName = text(alias);
		skills.push({
			name: named,
			...(isSkillCategory(category) ? { category } : {}),
			...(parentName ? { parent: parentName } : {}),
			...(aliasName ? { alias: aliasName } : {})
		});
		if (skills.length >= SKILL_SEARCH.results) break;
	}
	return skills;
};

/**
 * The skills of the catalogue that what was typed could be; none, without a request, for a text
 * that is empty or too long to be a skill. Never throws: a failure is an outcome
 */
export const searchSkills = async (
	typed: string,
	signal?: AbortSignal
): Promise<SkillSearchOutcome> => {
	const q = skillSearchText(typed);
	if (!canSearchSkill(q)) return { status: 'found', skills: [] };
	try {
		const result = await textApi.skills.search.get({
			query: { q },
			fetch: { ...withCredentials, signal }
		});
		if (!result.error && result.data) {
			return { status: 'found', skills: readSkillSuggestions(result.data) };
		}
		// Eden's types know only the 422 the route declares: any status can come back
		const status: number = result.error?.status ?? result.status;
		// An API without the route: nothing to ask it, now or later
		if (status === 404) return { status: 'off' };
		// Signed out (the editor says so when it saves), or too many searches: asked again later
		if (status === 401 || status === 429) {
			const wait = retryAfterMs(result.response) ?? PAUSE_MS.refused;
			return { status: 'unavailable', retryAfterMs: Math.min(wait, PAUSE_MS.longest) };
		}
		return { status: 'unavailable', retryAfterMs: PAUSE_MS.failed };
	} catch {
		return { status: 'unavailable', retryAfterMs: PAUSE_MS.failed };
	}
};

// ---------------------------------------------------------------------------------------------
// Asking while typing

/** Whether this site has the search at all, and from when it can be asked again: for the page */
let searchOff = false;
let pausedUntil = 0;

/** Forgets what earlier searches learned of the API (tests) */
export const resetSkillSearch = () => {
	searchOff = false;
	pausedUntil = 0;
};

export interface SkillSearcher {
	/**
	 * What is in the field now: asked after a pause in typing. A search waiting or under way for
	 * an earlier text is dropped, and its answer never told
	 */
	type(typed: string): void;
	/** Drops the search waiting and the one under way (the field was left, a skill was picked) */
	cancel(): void;
}

/**
 * The search of one field. `onanswer` gets the catalogue's skills for what was typed last: once
 * per search that answered (none when it failed), and at once, with none, for a text that is not
 * searched
 */
export const createSkillSearcher = (
	onanswer: (skills: SkillSuggestion[]) => void,
	{
		search = searchSkills,
		delayMs = SKILL_SEARCH.debounceMs,
		now = Date.now
	}: {
		search?: typeof searchSkills;
		delayMs?: number;
		now?: () => number;
	} = {}
): SkillSearcher => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let request: AbortController | undefined;

	const cancel = () => {
		clearTimeout(timer);
		timer = undefined;
		request?.abort();
		request = undefined;
	};

	return {
		type(typed) {
			cancel();
			const q = skillSearchText(typed);
			if (!canSearchSkill(q)) {
				onanswer([]);
				return;
			}
			if (searchOff || now() < pausedUntil) return;
			timer = setTimeout(async () => {
				timer = undefined;
				const mine = new AbortController();
				request = mine;
				const outcome = await search(q, mine.signal);
				// Typed on since, or the field was left: this answer is for another text
				if (mine.signal.aborted) return;
				request = undefined;
				if (outcome.status === 'off') searchOff = true;
				if (outcome.status === 'unavailable') pausedUntil = now() + outcome.retryAfterMs;
				onanswer(outcome.status === 'found' ? outcome.skills : []);
			}, delayMs);
		},
		cancel
	};
};

// ---------------------------------------------------------------------------------------------
// What the field suggests

/** A suggestion of the field: one of the owner's own skills, or a skill of the catalogue */
export interface SkillOption extends SkillSuggestion {
	source: 'own' | 'catalogue';
}

const key = (name: string) => name.trim().toLowerCase();

/**
 * The owner's own skills matching what is typed: not picked yet, not what is typed itself (Enter
 * adds that), the names starting with it first
 */
export const ownSkillMatches = (
	typed: string,
	picked: readonly string[],
	own: readonly string[],
	known: readonly string[]
): string[] => {
	const query = key(typed);
	if (!query) return [];
	const available = normalizeSkillNames([...picked, ...own], known).slice(
		normalizeSkillNames([...picked]).length
	);
	const starts = (skill: string) => key(skill).startsWith(query);
	return available
		.filter((skill) => key(skill).includes(query) && key(skill) !== query)
		.sort((a, b) => Number(starts(b)) - Number(starts(a)))
		.slice(0, OWN_SUGGESTIONS);
};

/**
 * What the field suggests for what is typed: the owner's own skills first, at once, then the
 * catalogue's (`catalogue`: the last answer), each skill once. A skill of the catalogue is left
 * out when it is picked already, when the owner's own skills suggest it, when it is what is typed
 * (Enter adds it, spelled as the catalogue spells it: see catalogueSpellings) and when it no
 * longer matches what is typed (the answer of an earlier text, until the next one comes).
 * SKILL_SEARCH.results at most
 */
export const mergeSkillSuggestions = ({
	typed,
	picked,
	own,
	known,
	catalogue
}: {
	typed: string;
	picked: readonly string[];
	own: readonly string[];
	known: readonly string[];
	catalogue: readonly SkillSuggestion[];
}): SkillOption[] => {
	const query = key(skillSearchText(typed));
	if (!query) return [];
	const options: SkillOption[] = ownSkillMatches(typed, picked, own, known).map((name) => ({
		name,
		source: 'own'
	}));
	const taken = new Set([...picked.map(key), ...options.map(({ name }) => key(name))]);
	for (const suggestion of catalogue) {
		if (options.length >= SKILL_SEARCH.results) break;
		const name = key(suggestion.name);
		if (name === query || taken.has(name)) continue;
		const matches = [suggestion.name, suggestion.alias].some(
			(spelling) => spelling !== undefined && key(skillSearchText(spelling)).includes(query)
		);
		if (!matches) continue;
		taken.add(name);
		options.push({ ...suggestion, source: 'catalogue' });
	}
	return options;
};

/**
 * The spellings typed text is given when it names a skill of the catalogue: 'kubernetes' typed
 * and entered is kept as the catalogue's 'Kubernetes'. Only a skill's own name: another spelling
 * of it ('K8s') is resolved when the experience is saved, or by picking its suggestion
 */
export const catalogueSpellings = (catalogue: readonly SkillSuggestion[]): string[] =>
	catalogue.map(({ name }) => name);

// ---------------------------------------------------------------------------------------------
// The keyboard

/** Where the list of suggestions stands when a key is pressed in the field */
export interface SuggestionListState {
	/** Whether the list shows (it has suggestions and was not closed) */
	open: boolean;
	/** How many suggestions it has, shown or not */
	count: number;
	/** The suggestion the arrows are on; -1: none */
	active: number;
}

/**
 * What a key pressed in the field does to its suggestions; undefined when the key is not theirs
 * (it is the field's, or the dialog's around it):
 * - the arrows move through the suggestions, from the last back to none (the text typed), then
 *   round again, and open a list that was closed;
 * - Enter picks the suggestion the arrows are on (none: Enter adds what is typed, as ever);
 * - Escape closes the list, and only the list: once closed, Escape is the dialog's again.
 */
export const suggestionKeyAction = (
	event: { key: string; isComposing?: boolean },
	{ open, count, active }: SuggestionListState
):
	| { action: 'move'; active: number }
	| { action: 'pick'; index: number }
	| { action: 'close' }
	| undefined => {
	if (event.isComposing) return undefined;
	if (event.key === 'Escape') return open ? { action: 'close' } : undefined;
	if (count === 0) return undefined;
	if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
		const down = event.key === 'ArrowDown';
		if (!open) return { action: 'move', active: down ? 0 : count - 1 };
		const step = down ? 1 : -1;
		return { action: 'move', active: ((active + 1 + step + count + 1) % (count + 1)) - 1 };
	}
	if (event.key === 'Enter' && open && active >= 0 && active < count) {
		return { action: 'pick', index: active };
	}
	return undefined;
};
