import { Schema, model } from "mongoose";
import type { HydratedDocument, InferSchemaType, Model, Types } from "mongoose";
import {
  SKILL_CATEGORIES,
  SKILL_CLASSIFICATION,
  SKILL_CLASSIFICATION_STATUSES,
  SUGGESTABLE_SKILL_STATUSES
} from "portfolio-common";
import { isDuplicateKeyError } from "../../services/mongoErrors";

/** Skill names compare case-insensitively: 'typescript' is the 'TypeScript' skill */
export const SKILL_NAME_COLLATION = { locale: 'en', strength: 2 };

/**
 * Where a skill stands with the classifier (services/skillClassifier.ts). A
 * skill without one is pending, like one whose status is 'pending'
 */
const classificationSchema = new Schema({
  status: { type: String, enum: SKILL_CLASSIFICATION_STATUSES, required: true },
  /** When it last changed (classified, rejected, set by hand, or a try that settled nothing) */
  at: Date,
  // Tries so far: the times Claude answered and this skill could not be
  // settled, and the one that settled it. A call that got no answer (an
  // outage, a refused key) counts none. Skipped from SKILL_CLASSIFICATION.maxAttempts
  attempts: { type: Number, default: 0 }
}, { _id: false });

// The site's skill catalogue: one document per spelling people typed.
// Experiences reference the document of the spelling typed and are never
// rewritten: what the catalogue learns of a skill afterwards (its category,
// the skill it is part of, the skill it is another spelling of) is metadata
// here, resolved when a skill is read (services/experiencePresentation.ts,
// services/skillSearch.ts), never when an experience is written. So what a
// model said of a spelling is undone by changing that one document: every
// experience, saved before or after, shows the spelling typed again
export const skillSchema = new Schema({
  /** Its spelling, shown wherever the skill is */
  displayName: { type: String, required: true, unique: true, index: true },
  // The casings of its own display name people typed (findOrCreate), and
  // nothing else: another spelling of the skill ('K8s' of 'Kubernetes') is a
  // document of its own that points at it (aliasOf), never a name here
  names: { type: [String], index: true },
  svg: String,
  /** One of portfolio-common's SKILL_CATEGORIES */
  category: { type: String, enum: SKILL_CATEGORIES },
  // The skill this one is part of ('.NET' for '.NET Core'). One level only: a
  // skill that has a parent is never a parent itself, never itself, no cycle
  parent: { type: Schema.Types.ObjectId, ref: 'Skill' },
  // This document is another spelling of that skill ('K8s' of 'Kubernetes').
  // Never chained: it points at a skill without aliasOf. An alias has no
  // parent or category of its own. Experiences that used the spelling keep
  // referencing this document: unsetting the field is all it takes to show
  // the spelling as typed again
  aliasOf: { type: Schema.Types.ObjectId, ref: 'Skill' },
  classification: { type: classificationSchema, default: undefined }
});

// Case-insensitive lookups (findOrCreate) need indexes with their collation.
// Not unique: case variants created before lookups ignored case may coexist
skillSchema.index({ displayName: 1 }, { name: 'displayName_ci', collation: SKILL_NAME_COLLATION });
skillSchema.index({ names: 1 }, { name: 'names_ci', collation: SKILL_NAME_COLLATION });
// The classifier's sweep (pending skills, the oldest first: PENDING_SKILLS
// sorted by _id) and the search (SUGGESTABLE_SKILLS)
skillSchema.index({ 'classification.status': 1, _id: 1 });
// The skills that are part of a skill, and the other spellings of one
skillSchema.index({ parent: 1 }, { sparse: true });
skillSchema.index({ aliasOf: 1 }, { sparse: true });

export type Skill = InferSchemaType<typeof skillSchema>;
export type SkillDocument = HydratedDocument<Skill>;

/**
 * The skills the classifier has not classified yet: no classification, or
 * one still pending (`{ $in: [null] }` also matches a missing field). The
 * sweep adds its own limit on `classification.attempts`
 */
export const PENDING_SKILLS = { 'classification.status': { $in: [null, 'pending'] } };

/**
 * The skills the search may suggest: recognised by the classifier or set by
 * hand. A name someone typed is never shown to other accounts before that
 */
export const SUGGESTABLE_SKILLS = { 'classification.status': { $in: [...SUGGESTABLE_SKILL_STATUSES] } };

/** Whether a skill is still to classify: pending, and not given up on */
export const isPendingSkill = (skill: Pick<Skill, 'classification'>): boolean => {
  const classification = skill.classification;
  if (!classification) return true;
  return classification.status === 'pending' && (classification.attempts ?? 0) < SKILL_CLASSIFICATION.maxAttempts;
};

const pendingSkillListeners = new Set<() => void>();

/**
 * Calls `listener` each time findOrCreate was given a name whose skill, as
 * it is read (its own document, or the skill it is another spelling of), is
 * still to classify (see isPendingSkill): what wakes the classification job
 * after an experience was saved. Synchronous, with nothing of the skill: a
 * listener only schedules work, and what it throws is dropped. Returns the
 * function that removes it
 */
export const onPendingSkillResolved = (listener: () => void): (() => void) => {
  pendingSkillListeners.add(listener);
  return () => {
    pendingSkillListeners.delete(listener);
  };
};

const notifyPendingSkill = () => {
  for (const listener of pendingSkillListeners) {
    try {
      listener();
    } catch {
      // A listener never fails the save that resolved the skill
    }
  }
};

interface SkillModel extends Model<Skill> {
  /**
   * The id of the document of the spelling `name`, ignoring case (its
   * display name or one of its names; the oldest when several match),
   * created when there is none: what an experience stores. Never the skill
   * it is another spelling of (aliasOf): that is resolved when the
   * experience is read, never when it is written
   */
  findOrCreate(name: string): Promise<Types.ObjectId>;
  /**
   * The skill `name` names, ignoring case (its display name or one of its
   * names; the oldest when several match), as its canonical skill when it
   * is another spelling of one: how the classifier finds the skill a name
   * points at. Null when no skill has that name: nothing is created
   */
  findCanonical(name: string): Promise<SkillDocument | null>;
}

/** The skill a document stands for: the one it is another spelling of, when that one still exists */
const canonicalOf = async (skills: Model<Skill>, skill: SkillDocument): Promise<SkillDocument> => {
  if (!skill.aliasOf) return skill;
  const canonical = await skills.findById(skill.aliasOf);
  return canonical ?? skill;
};

skillSchema.statics.findOrCreate = async function (rawName: string) {
  const name = rawName.trim();
  // Atomic upsert: matches one of its names or the display name, ignoring case
  // (the oldest skill wins if case variants exist), and records the name
  // ($addToSet also ignores case: a known name in another casing is not added
  // again). The display name keeps its first spelling. Concurrent inserts of
  // a new name make one fail with a duplicate key error (unique display
  // name); the retry then matches the winner's document. Two casings of a new
  // name inserted at the same instant can still both be created.
  const upsert = () =>
    this.findOneAndUpdate(
      { $or: [{ names: name }, { displayName: name }] },
      { $setOnInsert: { displayName: name }, $addToSet: { names: name } },
      { upsert: true, returnDocument: 'after', collation: SKILL_NAME_COLLATION, sort: { _id: 1 } }
    );

  let skill;
  try {
    skill = await upsert();
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    skill = await upsert();
  }
  // The skill it is shown as when read (presentSkill): itself, or the skill
  // it is another spelling of. Still to classify: the job is woken
  if (isPendingSkill(await canonicalOf(this, skill))) notifyPendingSkill();
  // The experience references the spelling typed, whatever the catalogue
  // says of it: that it is another spelling of a skill may be a model's
  // answer, which is applied when the experience is read and never written
  // into it (matching's anonymous card reads the stored skill's own name)
  return skill._id;
}

skillSchema.statics.findCanonical = async function (rawName: string) {
  const name = rawName.trim();
  if (!name) return null;
  const skill = await this.findOne({ $or: [{ names: name }, { displayName: name }] })
    .collation(SKILL_NAME_COLLATION)
    .sort({ _id: 1 });
  return skill ? canonicalOf(this, skill) : null;
}

export const Skill = model<Skill, SkillModel>('Skill', skillSchema);
