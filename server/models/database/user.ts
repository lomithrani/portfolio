import { Schema, model } from "mongoose";
import type { InferSchemaType } from "mongoose";
import { CONSENT_SOURCES, RECRUITER_PLANS, USER_MODES } from "portfolio-common";

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
    connectedAt: { type: Date },
    // Set, with the tokens removed, when Google refused the stored grant
    // (revoked, expired, other OAuth client): the admin is asked to reconnect
    revokedAt: { type: Date }
  },
  // The space the account last chose (portfolio-common USER_MODES): what the
  // client shows after login. Unset until the account first chooses one. It
  // never authorises anything: routes check what the account has
  activeMode: { type: String, enum: USER_MODES },
  // The recruiter space, created the first time the account chooses it
  // (services/recruiters.ts). Its plan sets the job description PDF imports
  // it gets; jobImportsUsed counts them for the lifetime of the account, and
  // is only changed atomically (services/jobImport.ts)
  recruiter: {
    type: new Schema({
      enabledAt: { type: Date, required: true },
      plan: { type: String, enum: Object.keys(RECRUITER_PLANS), required: true, default: 'free' },
      jobImportsUsed: { type: Number, required: true, default: 0, min: 0 }
    }, { _id: false }),
    default: undefined
  },
  // Every acceptance of the Terms of use and Privacy policy (services/legal.ts),
  // oldest first, appended and never edited: the proof of what the account
  // accepted, when, with which wording of the age confirmation and where.
  // No birth date and no IP address: the age is only declared
  legalAcceptances: {
    type: [new Schema({
      /** portfolio-common LEGAL_VERSION at the time */
      version: { type: String, required: true },
      acceptedAt: { type: Date, required: true },
      /** portfolio-common AGE_CONFIRMATION_KEY: the exact wording ticked */
      ageConfirmationKey: { type: String, required: true },
      source: { type: String, enum: CONSENT_SOURCES, required: true }
    }, { _id: false })],
    default: undefined
  }
});

export type User = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
