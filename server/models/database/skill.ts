import { Schema, model } from "mongoose";
import type { InferSchemaType, Model, Types } from "mongoose";
import { isDuplicateKeyError } from "../../services/mongoErrors";

/** Skill names compare case-insensitively: 'typescript' is the 'TypeScript' skill */
const SKILL_NAME_COLLATION = { locale: 'en', strength: 2 };

export const skillSchema = new Schema({
  displayName: { type: String, required: true, unique: true, index: true },
  names: { type: [String], index: true },
  svg: String,
});

// Case-insensitive lookups (findOrCreate) need indexes with their collation.
// Not unique: case variants created before lookups ignored case may coexist
skillSchema.index({ displayName: 1 }, { name: 'displayName_ci', collation: SKILL_NAME_COLLATION });
skillSchema.index({ names: 1 }, { name: 'names_ci', collation: SKILL_NAME_COLLATION });

export type Skill = InferSchemaType<typeof skillSchema>;

interface SkillModel extends Model<Skill> {
  findOrCreate(name: string): Promise<Types.ObjectId>;
}

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
  return skill._id;
}

export const Skill = model<Skill, SkillModel>('Skill', skillSchema);
