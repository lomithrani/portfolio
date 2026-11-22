import { SKILL_SEARCH, canSearchSkill, isSkillCategory, skillSearchText } from 'portfolio-common';
import type { SkillSuggestion } from 'portfolio-common';
import type { Types } from 'mongoose';
import { FieldValidationError, TooManyRequestsError } from '../errors';
import { Skill } from '../models/database';
import { SKILL_NAME_COLLATION, SUGGESTABLE_SKILLS } from '../models/database/skill';
import { consumeRateLimit, rateLimitKey } from './rateLimit';
import type { RateLimit } from './rateLimit';
import { m } from './skillSearch.messages';
import { m as limits } from './rateLimit.messages';

// The skill search of the experience editor (plugins/skills.ts): while an
// owner types a skill, the catalogue's skills that what they typed could be.
//
// Only skills recognised as skills are ever suggested (SUGGESTABLE_SKILLS:
// classified by the classifier, or set by hand): a name someone typed is
// never shown to another account before that, whatever is searched, and one
// the classifier rejected never is. That holds for everything a suggestion
// says: the skill it adds, the skill it is part of, the spelling that
// matched. Nothing is classified here, no model is asked: the search reads
// the catalogue as it stands.
//
// What is typed is never logged, and never kept: the counter of the account's
// searches is keyed by a hash of the account (rateLimitKey).

/**
 * Searches per account: the field asks once per pause in typing
 * (SKILL_SEARCH.debounceMs), a skill takes a handful
 */
export const SKILL_SEARCHES_PER_USER: RateLimit = { limit: 120, windowMs: 60_000 };

/**
 * Documents read for each way of matching (exact, start, anywhere): more than
 * are answered, since several can be one skill (its spellings) and some are
 * not suggested (another spelling of a skill not recognised yet)
 */
const CANDIDATES_PER_STAGE = 40;

/** GET /skills/search */
export interface SkillSearchResult {
  skills: SkillSuggestion[];
}

/** What the search reads of a Skill: never more than it needs to answer */
const SEARCH_FIELDS = 'displayName names category parent aliasOf classification.status';

interface CatalogueSkill {
  _id: Types.ObjectId;
  displayName: string;
  names?: string[] | null;
  category?: string | null;
  parent?: Types.ObjectId | null;
  aliasOf?: Types.ObjectId | null;
  classification?: { status?: string | null } | null;
}

const suggestableStatuses: readonly unknown[] = SUGGESTABLE_SKILLS['classification.status'].$in;
const isSuggestable = (skill: CatalogueSkill) => suggestableStatuses.includes(skill.classification?.status);

/** How well a spelling matches what was typed: the whole of it, its start, or somewhere in it */
type Rank = 0 | 1 | 2;

const folded = (text: string) => text.trim().toLowerCase();

const rankOf = (spelling: string, query: string): Rank | undefined => {
  const text = folded(spelling);
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  return text.includes(query) ? 2 : undefined;
};

/** What was typed, as a pattern that matches it and nothing else: 'c++' is no quantifier, '.net' no wildcard */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The ways a skill matches what was typed, the best first: each is read only
 * while the ones before it did not fill the answer, so a short text ('c')
 * reads a few documents, never every skill that has the letter
 */
const stages = (text: string): { rank: Rank; filter: Record<string, unknown> }[] => {
  const pattern = literal(text);
  const matching = (regex: string) => ({ $regex: regex, $options: 'i' });
  return [
    // Ignoring case through the collation, on the indexes findOrCreate uses
    { rank: 0, filter: { $or: [{ displayName: text }, { names: text }] } },
    { rank: 1, filter: { $or: [{ displayName: matching(`^${pattern}`) }, { names: matching(`^${pattern}`) }] } },
    { rank: 2, filter: { $or: [{ displayName: matching(pattern) }, { names: matching(pattern) }] } }
  ];
};

interface Found {
  suggestion: SkillSuggestion;
  rank: Rank;
}

const byName = (a: string, b: string) =>
  a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);

/**
 * The skills of the catalogue that `text` (as skillSearchText left it) could
 * be: the skill it names first, then those starting with it, then those
 * containing it, each by name; SKILL_SEARCH.results at most, each skill once
 */
export async function suggestSkills(text: string): Promise<SkillSuggestion[]> {
  const query = folded(text);
  const read = new Map<string, CatalogueSkill>();
  const matched = new Set<string>();
  const found = new Map<string, Found>();

  /** The skills with these ids, read once for the whole search */
  const load = async (ids: (Types.ObjectId | null | undefined)[]) => {
    const missing = ids.filter((id): id is Types.ObjectId => !!id && !read.has(String(id)));
    if (missing.length === 0) return;
    const skills = await Skill.find({ _id: { $in: missing } }).select(SEARCH_FIELDS).lean<CatalogueSkill[]>();
    for (const skill of skills) read.set(String(skill._id), skill);
  };
  const byId = (id: Types.ObjectId | null | undefined) => (id ? read.get(String(id)) : undefined);
  /** The skill a document stands for: the one it is another spelling of, while that one exists */
  const canonicalOf = (skill: CatalogueSkill) => byId(skill.aliasOf) ?? skill;

  for (const stage of stages(text)) {
    const skills = await Skill.find({ ...SUGGESTABLE_SKILLS, ...stage.filter, _id: { $nin: [...matched] } })
      .collation(SKILL_NAME_COLLATION)
      .sort({ displayName: 1, _id: 1 })
      .limit(CANDIDATES_PER_STAGE)
      .select(SEARCH_FIELDS)
      .lean<CatalogueSkill[]>();
    for (const skill of skills) {
      matched.add(String(skill._id));
      read.set(String(skill._id), skill);
    }
    await load(skills.map((skill) => skill.aliasOf));
    await load(skills.map((skill) => canonicalOf(skill).parent));
    // A skill named as a parent that became another spelling of a skill since
    await load(skills.map((skill) => byId(canonicalOf(skill).parent)?.aliasOf));

    for (const skill of skills) {
      const canonical = canonicalOf(skill);
      // Another spelling of a skill that is not recognised yet (the classifier
      // made it up as the target, to classify later): nothing to suggest
      if (!isSuggestable(canonical)) continue;

      // The spelling that matched best: the skill's own name first
      let best: { spelling: string; rank: Rank } | undefined;
      for (const spelling of [skill.displayName, ...(skill.names ?? [])]) {
        const rank = rankOf(spelling, query);
        if (rank !== undefined && (!best || rank < best.rank)) best = { spelling, rank };
      }
      // Matched by the database in a way this code does not see (a collation's
      // equivalence): ranked as the stage that found it, under its own name
      best ??= { spelling: skill.displayName, rank: stage.rank };

      const name = canonical.displayName;
      const alias =
        folded(best.spelling) === folded(name)
          ? undefined
          : folded(best.spelling) === folded(skill.displayName)
            ? skill.displayName
            : best.spelling.trim();

      const parentSkill = byId(canonical.parent);
      const parent = parentSkill ? canonicalOf(parentSkill) : undefined;
      const suggestion: SkillSuggestion = {
        name,
        ...(isSkillCategory(canonical.category) ? { category: canonical.category } : {}),
        // Never a parent that is not recognised itself, nor the skill as its own
        ...(parent && isSuggestable(parent) && String(parent._id) !== String(canonical._id)
          ? { parent: parent.displayName }
          : {}),
        ...(alias ? { alias } : {})
      };

      // Each skill once: by its best match, and under its own name rather than
      // another spelling when both match as well
      const key = String(canonical._id);
      const known = found.get(key);
      if (!known || best.rank < known.rank || (best.rank === known.rank && known.suggestion.alias && !alias)) {
        found.set(key, { suggestion, rank: best.rank });
      }
    }
    // What a later stage finds comes after all of these
    if (found.size >= SKILL_SEARCH.results) break;
  }

  return [...found.values()]
    .sort((a, b) => a.rank - b.rank || byName(a.suggestion.name, b.suggestion.name))
    .slice(0, SKILL_SEARCH.results)
    .map(({ suggestion }) => suggestion);
}

const waitText = (seconds: number) => limits.wait.minutes(Math.max(1, Math.ceil(seconds / 60)));

/**
 * The skills that what `userId` typed could be. 422 on `q` for a text that is
 * empty or too long to be a skill; 429 over the account's searches a minute
 */
export async function searchSkills(userId: string, q: string): Promise<SkillSearchResult> {
  const text = skillSearchText(q);
  if (!canSearchSkill(text)) throw new FieldValidationError('q', () => m.invalidQuery(SKILL_SEARCH.maxLength));
  const retryAfter = await consumeRateLimit(rateLimitKey('skill-search:user', userId), SKILL_SEARCHES_PER_USER);
  if (retryAfter !== null) throw new TooManyRequestsError(() => m.tooManySearches(waitText(retryAfter)), retryAfter);
  return { skills: await suggestSkills(text) };
}
