import { createHash } from 'node:crypto'
import { RateLimitCounter } from '../models/database'

export interface RateLimit {
  /** Requests allowed per window */
  limit: number
  windowMs: number
}

/** SHA-256 (hex) of a value, to key data by an IP address or an email without storing it */
export const hashValue = (value: string) => createHash('sha256').update(value).digest('hex')

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
