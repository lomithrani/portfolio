import { InferSchemaType, Schema, model } from "mongoose";

export const skillSchema = new Schema({
  name: { type: String, required: true },
  svg: String,
  level: Number
});

export type Skill = InferSchemaType<typeof skillSchema>;
export const Skill = model('Skill', skillSchema);