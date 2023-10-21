import { InferSchemaType, Schema, model } from "mongoose";

export const userSchema = new Schema({
  name: { type: String },
  surname: { type: String },
  email: { type: String, required: true, index: true, unique: true }
});

export type User = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);