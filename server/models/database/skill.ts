import { Schema, model } from "mongoose";
import type { InferSchemaType, Model, ObjectId } from "mongoose";

export const skillSchema = new Schema({
  displayName: { type: String, required: true, unique: true, index: true },
  names: { type: [String], index: true },
  svg: String,
});

export type Skill = InferSchemaType<typeof skillSchema>;

interface SkillModel extends Model<Skill> {
  findOrCreate(name: string): Promise<ObjectId>;
}

skillSchema.statics.findOrCreate = async function (name: string) {
  let skill = await this.findOne({ names: name });

  if (!skill) {
    skill = new this({ names: [name], displayName: name });
    await skill.save();
  }

  return skill._id;
}



export const Skill = model<Skill, SkillModel>('Skill', skillSchema);
