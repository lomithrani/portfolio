import { Schema, model } from 'mongoose';
import type { InferSchemaType, Types } from 'mongoose';

// The discovery of a candidate (Path 2, matching on open jobs, behind MATCHING):
// whether they asked to be proposed to recruiters, as an anonymous card, and
// what that card shows. One per account (unique index), created the first
// time the account turns discovery on or sets its card; an account without one
// is off. Written only by services/discovery.ts.
//
// Apart from the Domain (GET /domain/:name answers a whole portfolio, to
// anyone) and from the PerfectJob (PUT /perfect-job replaces it whole).
// Private: no route returns it to anyone but its owner, and it is never
// logged. Deleted with the account (services/accountDeletion.ts).
const discoveryConsentSchema = new Schema({
  /** The consent given (`granted`), or taken back (`withdrawn`) */
  action: { type: String, enum: ['granted', 'withdrawn'], required: true },
  at: { type: Date, required: true },
  /** portfolio-common LEGAL_VERSION, when granted */
  termsVersion: { type: String },
  /**
   * portfolio-common's discoveryConsentKey(), when granted: the exact wording
   * ticked (the 18+ confirmation), in the language it was read in
   */
  wordingKey: { type: String }
}, { _id: false });

export const discoveryProfileSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  /**
   * Since when the candidate is proposed to recruiters: the date of the
   * latest consent, which lapses DISCOVERY_CONSENT_MONTHS later. Unset: off
   * (never turned on, or withdrawn)
   */
  enabledAt: { type: Date },
  /**
   * When the candidate last signed in or changed their discovery: paused
   * DISCOVERY_INACTIVITY_DAYS later, until they come back
   */
  lastActiveAt: { type: Date },
  /** What the anonymous card shows (portfolio-common's parseDiscoveryCard) */
  card: {
    /** A line of their own, atop the card */
    headline: { type: String },
    /** Experiences of their portfolio the card leaves out */
    hiddenExperiences: { type: [Schema.Types.ObjectId], default: undefined }
  },
  /**
   * Every consent given and taken back, oldest first, appended and never
   * edited (GDPR art. 7(1)): what the candidate agreed to, when, with which
   * wording. No birth date: the age is only declared
   */
  consents: { type: [discoveryConsentSchema], default: undefined }
}, { timestamps: true });

// The candidates proposed to recruiters, and only them (the feeds, the
// metrics): a profile turned off is not in the index
discoveryProfileSchema.index(
  { enabledAt: 1 },
  { partialFilterExpression: { enabledAt: { $exists: true } } }
);

export type DiscoveryProfile = InferSchemaType<typeof discoveryProfileSchema> & { _id: Types.ObjectId };
export const DiscoveryProfile = model('DiscoveryProfile', discoveryProfileSchema);
