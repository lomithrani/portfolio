import { createHmac } from 'node:crypto'
import { env } from '../env'
import { RateLimitCounter } from '../models/database'

export interface RateLimit {
  /** Requests allowed per window */
  limit: number
  windowMs: number
}

// Derived from JWT_SECRET, so the hashes need no setting of their own; a new
// JWT_SECRET resets the rate limit counters and the per-email booking caps
const HASH_KEY = createHmac('sha256', env.JWT_SECRET).update('portfolio:hashValue').digest()

/**
 * HMAC-SHA256 (hex) of a value, to key data by an IP address or an email
 * without storing it. Keyed: a database dump alone cannot be matched against
 * a list of candidate addresses
 */
export const hashValue = (value: string) => createHmac('sha256', HASH_KEY).update(value).digest('hex')

/** Counter key of a value (an IP address, an email) */
export const rateLimitKey = (scope: string, value: string) => `${scope}:${hashValue(value)}`

/**
 * Counts one request against `key` in the current fixed window. Returns the
 * seconds until the window ends when this request is over the limit, null
 * when it is allowed. Atomic: concurrent requests each get their own count.
 */
export async function consumeRateLimit(key: string, { limit, windowMs }: RateLimit) {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const expiresAt = new Date(windowStart + windowMs)

  // An upsert on _id: MongoDB retries the insert itself when two requests race to create it
  const counter = await RateLimitCounter.findOneAndUpdate(
    { _id: `${key}:${windowStart}` },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
    { upsert: true, returnDocument: 'after' }
  ).lean()

  if ((counter?.count ?? 1) <= limit) return null
  return Math.ceil((expiresAt.getTime() - now) / 1000)
}
