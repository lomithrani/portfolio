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
  /** When it last changed (classified, rejected, set by hand, or a failed try) */
  at: Date,
  /** Tries so far, failed ones included: skipped from SKILL_CLASSIFICATION.maxAttempts */
  attempts: { type: Number, default: 0 }
}, { _id: false });

// The site's skill catalogue: one document per skill people typed. Experiences
// reference it and are never rewritten: what the catalogue learns of a skill
// afterwards (its category, the skill it is part of, the skill it is another
// spelling of) is metadata here, resolved when a skill is read or looked up
export const skillSchema = new Schema({
  /** The canonical spelling, shown everywhere */
  displayName: { type: String, required: true, unique: true, index: true },
  /** The spellings that resolve to this skill (findOrCreate) */
  names: { type: [String], index: true },
  svg: String,
  /** One of portfolio-common's SKILL_CATEGORIES */
  category: { type: String, enum: SKILL_CATEGORIES },
  // The skill this one is part of ('.NET' for '.NET Core'). One level only: a
  // skill that has a parent is never a parent itself, never itself, no cycle
  parent: { type: Schema.Types.ObjectId, ref: 'Skill' },
  // This document is another spelling of that skill ('K8s' of 'Kubernetes').
  // Never chained: it points at a skill without aliasOf. An alias has no
  // parent or category of its own
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
 * Calls `listener` each time findOrCreate resolved a name to a skill still
 * to classify (see isPendingSkill): what wakes the classification job after
 * an experience was saved. Synchronous, with nothing of the skill: a
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
   * The id of the skill `name` names, created when no skill has that name:
   * the canonical skill when the name is another spelling of one (aliasOf)
   */
  findOrCreate(name: string): Promise<Types.ObjectId>;
  /**
   * The skill `name` names, ignoring case (its display name or one of its
   * names; the oldest when several match), as its canonical skill when it
   * is another spelling of one. Null when no skill has that name: nothing
   * is created
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
  // Atomic upsert: matches an alias or the display name, ignoring case (the
  // oldest skill wins if case variants exist), and records the alias ($addToSet
  // also ignores case: a known name in another casing is not added again). The
  // display name keeps its first spelling. Concurrent inserts of a new name
  // make one fail with a duplicate key error (unique display name); the retry
  // then matches the winner's document. Two casings of a new name inserted at
  // the same instant can still both be created.
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
  // Another spelling of a skill: the experience references that skill.
  // Nothing stored is rewritten: an experience saved before the name was
  // known as an alias keeps its reference, resolved when it is read
  const canonical = await canonicalOf(this, skill);
  if (isPendingSkill(canonical)) notifyPendingSkill();
  return canonical._id;
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
