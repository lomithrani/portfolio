import { Schema, model } from "mongoose";
import type { InferSchemaType, Model, Types } from "mongoose";
import { isDuplicateKeyError } from "../../services/mongoErrors";

export const skillSchema = new Schema({
  displayName: { type: String, required: true, unique: true, index: true },
  names: { type: [String], index: true },
  svg: String,
});

export type Skill = InferSchemaType<typeof skillSchema>;

interface SkillModel extends Model<Skill> {
  findOrCreate(name: string): Promise<Types.ObjectId>;
}

skillSchema.statics.findOrCreate = async function (name: string) {
  // Atomic upsert: matches an alias or the display name (the unique key) and
  // records the alias. Concurrent inserts of a new name make one fail with a
  // duplicate key error; the retry then matches the winner's document.
  const upsert = () =>
    this.findOneAndUpdate(
      { $or: [{ names: name }, { displayName: name }] },
      { $setOnInsert: { displayName: name }, $addToSet: { names: name } },
      { upsert: true, returnDocument: 'after' }
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
