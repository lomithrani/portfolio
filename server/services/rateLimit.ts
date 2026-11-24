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

/** The fixed window of `key` holding the instant `at`: its counter's _id and its end */
const windowOf = (key: string, windowMs: number, at: number) => {
  const windowStart = Math.floor(at / windowMs) * windowMs
  return { counterId: `${key}:${windowStart}`, resetsAt: new Date(windowStart + windowMs) }
}

export interface RateLimitUsage {
  /** Requests counted in the current window */
  count: number
  /** When the current window ends (its counter then starts again from 0) */
  resetsAt: Date
}

export interface RateLimitTaken extends RateLimitUsage {
  /** Counter this request was counted on: pass it to refundRateLimit */
  counterId: string
  /** Seconds until the window ends when this request is over the limit, null when it is allowed */
  retryAfterSeconds: number | null
}

/**
 * Counts one request against `key` in the current fixed window, over the
 * limit or not, and says whether it is allowed. Atomic: concurrent requests
 * each get their own count.
 */
export async function takeRateLimit(key: string, { limit, windowMs }: RateLimit): Promise<RateLimitTaken> {
  const now = Date.now()
  const { counterId, resetsAt } = windowOf(key, windowMs, now)

  // An upsert on _id: MongoDB retries the insert itself when two requests race to create it
  const counter = await RateLimitCounter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: resetsAt } },
    { upsert: true, returnDocument: 'after' }
  ).lean()

  const count = counter?.count ?? 1
  return {
    counterId,
    count,
    resetsAt,
    retryAfterSeconds: count <= limit ? null : Math.ceil((resetsAt.getTime() - now) / 1000)
  }
}

/**
 * Counts `amount` at once against `key` in the current fixed window, and says
 * how many of them fit under the limit (`allowed`: from 0 to `amount`). All
 * of them are counted, those over the limit too. Atomic, like takeRateLimit
 */
export async function takeRateLimitAmount(key: string, { limit, windowMs }: RateLimit, amount: number) {
  const { counterId, resetsAt } = windowOf(key, windowMs, Date.now())
  const wanted = Math.max(0, Math.floor(amount))
  const counter = await RateLimitCounter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { count: wanted }, $setOnInsert: { expiresAt: resetsAt } },
    { upsert: true, returnDocument: 'after' }
  ).lean()
  const count = counter?.count ?? wanted
  return { count, resetsAt, allowed: Math.max(0, Math.min(wanted, limit - (count - wanted))) }
}

/**
 * Counts one request against `key` in the current fixed window. Returns the
 * seconds until the window ends when this request is over the limit, null
 * when it is allowed. Atomic: concurrent requests each get their own count.
 */
export async function consumeRateLimit(key: string, rateLimit: RateLimit) {
  return (await takeRateLimit(key, rateLimit)).retryAfterSeconds
}

/**
 * Gives back one request counted by takeRateLimit, on the counter it was
 * counted on (never below 0). Nothing happens once that window is over: its
 * counter is gone, or no longer the current one.
 */
export async function refundRateLimit(counterId: string) {
  await RateLimitCounter.updateOne({ _id: counterId, count: { $gt: 0 } }, { $inc: { count: -1 } })
}

/** Requests counted against `key` in the current window, without counting one */
export async function peekRateLimit(key: string, { windowMs }: Pick<RateLimit, 'windowMs'>): Promise<RateLimitUsage> {
  const { counterId, resetsAt } = windowOf(key, windowMs, Date.now())
  const counter = await RateLimitCounter.findById(counterId).lean()
  return { count: counter?.count ?? 0, resetsAt }
}

/**
 * Copies the count of `fromKey`'s current window onto `toKey`'s current
 * window, unless `toKey` already counts more (never lowers a count); the copy
 * expires with that window. Returns the count copied (0: nothing to copy)
 */
export async function carryRateLimit(fromKey: string, toKey: string, { windowMs }: Pick<RateLimit, 'windowMs'>) {
  const now = Date.now()
  const from = windowOf(fromKey, windowMs, now)
  const counter = await RateLimitCounter.findById(from.counterId).lean()
  const count = counter?.count ?? 0
  if (count <= 0) return 0
  const to = windowOf(toKey, windowMs, now)
  await RateLimitCounter.updateOne(
    { _id: to.counterId },
    { $max: { count }, $setOnInsert: { expiresAt: to.resetsAt } },
    { upsert: true }
  )
  return count
}
