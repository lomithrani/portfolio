// How the API shows the skills of an experience (GET /domain/:name, POST and
// PUT /experiences). An experience references Skill documents and is never
// rewritten; what the catalogue knows of a skill is resolved here, when it is
// read: an entry stored under another spelling of a skill (aliasOf) is shown
// as that skill, each skill once per list, with its category and the skill
// it is part of. Nothing else of a Skill leaves the API: not its other
// spellings (`names`), not where it stands with the classifier.
//
// Here, and nowhere when an experience is written: a save stores the
// document of the spelling typed (Skill.findOrCreate), so that a spelling is
// another skill's, which may be a model's answer, is undone on every
// experience by unsetting that one `aliasOf`. Matching's anonymous card
// (services/candidateCard.ts) does not come through here: it shows the
// stored skill's own name, the spelling typed.
//
// A skill an entry points at is the owner's own, shown as typed whatever the
// catalogue thinks of it. The skills that one points at (the skill it is
// another spelling of, the skill it is part of) are shown only once they are
// recognised as skills (classified, or set by hand): the classifier creates
// them from what a model answered, and a name nobody recognised yet is never
// put on someone's portfolio in place of, or above, what they typed.
import { SUGGESTABLE_SKILL_STATUSES, isSkillCategory } from 'portfolio-common';
import type { PresentedSkill, PresentedSkillParent } from 'portfolio-common';

/** A Skill as EXPERIENCE_POPULATE read it, once made a plain object */
type PopulatedSkill = {
  _id: unknown;
  displayName: string;
  category?: unknown;
  parent?: unknown;
  aliasOf?: unknown;
  classification?: unknown;
};

/** A reference that was populated: a bare id, or the null of a skill that no longer exists, is not */
const isPopulated = (skill: unknown): skill is PopulatedSkill =>
  typeof skill === 'object' &&
  skill !== null &&
  '_id' in skill &&
  typeof (skill as { displayName?: unknown }).displayName === 'string';

/** Recognised as a skill: classified by the classifier, or set by hand (what the search suggests too) */
const isRecognised = (skill: PopulatedSkill): boolean => {
  const status = (skill.classification as { status?: unknown } | null | undefined)?.status;
  return (SUGGESTABLE_SKILL_STATUSES as readonly unknown[]).includes(status);
};

/** A skill another one points at, when it can be shown: populated, and recognised as a skill */
const isShownTarget = (skill: unknown): skill is PopulatedSkill => isPopulated(skill) && isRecognised(skill);

/**
 * The skill a document stands for: the one it is another spelling of, once
 * that one is recognised as a skill (until then the document is shown as it
 * is, as typed)
 */
const canonical = (skill: PopulatedSkill): PopulatedSkill => (isShownTarget(skill.aliasOf) ? skill.aliasOf : skill);

const category = (skill: PopulatedSkill) => (isSkillCategory(skill.category) ? { category: skill.category } : {});

const presentParent = (parent: unknown, childId: string): PresentedSkillParent | undefined => {
  if (!isPopulated(parent)) return undefined;
  const skill = canonical(parent);
  // Not recognised as a skill (yet): the skill is shown without a family
  if (!isRecognised(skill)) return undefined;
  const _id = String(skill._id);
  // Never its own parent
  if (_id === childId) return undefined;
  return { _id, displayName: skill.displayName, ...category(skill) };
};

/**
 * A populated skill as the API presents it: the canonical skill when it is
 * another spelling of one, with its category and the skill it is part of
 * (both only once recognised as skills). Undefined for a reference that was
 * not populated
 */
export const presentSkill = (stored: unknown): PresentedSkill | undefined => {
  if (!isPopulated(stored)) return undefined;
  const skill = canonical(stored);
  const _id = String(skill._id);
  const parent = presentParent(skill.parent, _id);
  return { _id, displayName: skill.displayName, ...category(skill), ...(parent ? { parent } : {}) };
};

type SkillEntry = { skill: unknown };
type SkilledProject = { hardSkills?: SkillEntry[] | null; softSkills?: SkillEntry[] | null };

/**
 * A project's skill list as presented: each skill once (two spellings of a
 * skill are that skill, the first entry kept). An entry whose skill was not
 * populated (it no longer exists) stays as stored
 */
const presentEntries = <E extends SkillEntry>(entries: E[]): E[] => {
  const listed = new Set<string>();
  return entries.flatMap((entry) => {
    const skill = presentSkill(entry.skill);
    if (!skill) return [entry];
    if (listed.has(skill._id)) return [];
    listed.add(skill._id);
    return [{ ...entry, skill }];
  });
};

/**
 * An experience as the API returns it: `experience` is the plain object
 * (toObject) of one populated with EXPERIENCE_POPULATE. The input is left as
 * it is
 */
export const presentExperience = <T extends { projects?: SkilledProject[] | null }>(experience: T): T => {
  if (!Array.isArray(experience.projects)) return experience;
  return {
    ...experience,
    projects: experience.projects.map((project) => ({
      ...project,
      ...(Array.isArray(project.hardSkills) ? { hardSkills: presentEntries(project.hardSkills) } : {}),
      ...(Array.isArray(project.softSkills) ? { softSkills: presentEntries(project.softSkills) } : {})
    }))
  };
};
