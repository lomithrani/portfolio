import { Schema, model } from 'mongoose'

// What the travel time services answered (services/commute.ts), kept so the
// same question is not asked twice: where a job's address is, and how long a
// way takes. `_id` is the kind of answer and an HMAC of the question (the
// address, or the two points): neither is readable in the key. MongoDB
// deletes an entry once it expires, and the question is asked again.
export const commuteCacheSchema = new Schema({
  _id: { type: String, required: true },
  /** The answer, as its kind stores it (services/commute.ts) */
  value: { type: Schema.Types.Mixed },
  expiresAt: { type: Date, required: true }
}, { versionKey: false, minimize: false })

commuteCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const CommuteCache = model('CommuteCache', commuteCacheSchema)
