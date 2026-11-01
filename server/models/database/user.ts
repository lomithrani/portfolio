import { Schema, model } from "mongoose";
import type { InferSchemaType } from "mongoose";

export const userSchema = new Schema({
  name: { type: String },
  surname: { type: String },
  email: { type: String, required: true, index: true, unique: true },
  // Google account ID (`sub` claim), the stable identity used to log in.
  // Sparse: users created before it existed get it on their next login.
  googleId: { type: String, unique: true, sparse: true },
  // Google Calendar connection (appointments). The OAuth tokens are secrets:
  // `select: false` keeps them out of every query unless one asks for them
  // explicitly, which only services/googleCalendar.ts does.
  googleCalendar: {
    refreshToken: { type: String, select: false },
    accessToken: { type: String, select: false },
    tokenExpiry: { type: Date },
    connectedAt: { type: Date }
  }
});

export type User = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
