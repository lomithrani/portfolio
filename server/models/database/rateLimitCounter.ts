import { Schema, model } from 'mongoose'

// Fixed-window request counters of services/rateLimit.ts. Kept in MongoDB, not
// in memory, so limits hold across restarts, deploys and replicas. `_id` is
// `<key>:<window start>`; MongoDB deletes a counter once its window is over.
export const rateLimitCounterSchema = new Schema({
  _id: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true }
}, { versionKey: false })

rateLimitCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const RateLimitCounter = model('RateLimitCounter', rateLimitCounterSchema)
