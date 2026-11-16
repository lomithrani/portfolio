import { RateLimitCounter, User } from '../models/database'
import { FEEDBACK_ATTEMPTS_PER_ACCOUNT, FEEDBACK_PER_ACCOUNT, feedbackAccountKey, feedbackAttemptsKey } from './feedback'
import { JOB_IMPORT_DAILY_WINDOW_MS, jobImportAttemptsKey } from './jobImport'
import { carryRateLimit, rateLimitKey } from './rateLimit'
import type { RateLimit } from './rateLimit'
import {
  RESUME_IMPORT_DAILY_WINDOW_MS,
  RESUME_IMPORT_MONTHLY_WINDOW_MS,
  resumeImportAttemptsKey,
  resumeImportUserKey
} from './resumeImport'
import {
  STEP_SUGGESTION_ATTEMPTS_PER_OWNER,
  STEP_SUGGESTIONS_PER_OWNER,
  stepSuggestionAttemptsKey,
  stepSuggestionOwnerKey
} from './stepSuggestions'

// The per-account quotas (paid imports, step suggestions, feedback) are keyed by the
// user id, which a deleted and re-created account does not keep: without
// this, deleting the account (DELETE /me) and signing in again with the same
// Google account would start every quota from zero, and one person could use
// up the site-wide daily limits. So deleteAccount carries what the account
// used over to counters keyed by an HMAC of its Google account id (`sub`),
// which expire with their window (at most 30 days), and a new account of the
// same Google identity starts from them. Nothing else of the account is kept.

interface CarriedQuota {
  /** Name of the carried counter (its key is an HMAC of the Google id) */
  name: string
  /** Key of the account's own counter */
  accountKey: (userId: string) => string
  windowMs: RateLimit['windowMs']
}

// A function, not a constant: recruiters.ts imports this module and jobImport.ts
// imports recruiters.ts, so the key functions may not be defined yet when it loads
const carriedQuotas = (): readonly CarriedQuota[] => [
  { name: 'resume-import:user', accountKey: resumeImportUserKey, windowMs: RESUME_IMPORT_MONTHLY_WINDOW_MS },
  { name: 'resume-import:attempts', accountKey: resumeImportAttemptsKey, windowMs: RESUME_IMPORT_DAILY_WINDOW_MS },
  { name: 'job-import:attempts', accountKey: jobImportAttemptsKey, windowMs: JOB_IMPORT_DAILY_WINDOW_MS },
  { name: 'step-suggestion:owner', accountKey: stepSuggestionOwnerKey, windowMs: STEP_SUGGESTIONS_PER_OWNER.windowMs },
  {
    name: 'step-suggestion:attempts',
    accountKey: stepSuggestionAttemptsKey,
    windowMs: STEP_SUGGESTION_ATTEMPTS_PER_OWNER.windowMs
  },
  { name: 'feedback:account', accountKey: feedbackAccountKey, windowMs: FEEDBACK_PER_ACCOUNT.windowMs },
  { name: 'feedback:attempts', accountKey: feedbackAttemptsKey, windowMs: FEEDBACK_ATTEMPTS_PER_ACCOUNT.windowMs }
]

/** How long the job imports a deleted recruiter space used are remembered (the plan's allowance is for the account's lifetime) */
export const CARRIED_PLAN_IMPORTS_MS = 30 * 24 * 60 * 60_000

const carriedKey = (name: string, googleId: string) => rateLimitKey(`carried:${name}`, googleId)

/** Key of the job imports of the plan a deleted account of `googleId` used */
export const carriedPlanImportsKey = (googleId: string) => carriedKey('job-imports-used', googleId)

/**
 * Before an account is deleted: carries the quotas it used (current windows,
 * and the job imports of its recruiter plan) over to its Google identity.
 * Idempotent (counts are never lowered), so an interrupted deletion can run
 * it again. An account without a Google id (never signed in since googleId
 * existed) has nothing to carry over to.
 */
export async function carryOverAccountQuotas(
  userId: string,
  googleId: string | null | undefined,
  jobImportsUsed: number | null | undefined
) {
  if (!googleId) return
  await Promise.all(
    carriedQuotas().map((quota) => carryRateLimit(quota.accountKey(userId), carriedKey(quota.name, googleId), quota))
  )
  if (jobImportsUsed && jobImportsUsed > 0) {
    await RateLimitCounter.updateOne(
      { _id: carriedPlanImportsKey(googleId) },
      { $max: { count: jobImportsUsed }, $setOnInsert: { expiresAt: new Date(Date.now() + CARRIED_PLAN_IMPORTS_MS) } },
      { upsert: true }
    )
  }
}

/** When an account is created: starts its quotas from what a deleted account of the same Google identity used */
export async function restoreAccountQuotas(userId: string, googleId: string) {
  await Promise.all(
    carriedQuotas().map((quota) => carryRateLimit(carriedKey(quota.name, googleId), quota.accountKey(userId), quota))
  )
}

/**
 * When a recruiter space is created: starts its plan's job imports from what
 * a deleted account of the same Google identity used
 */
export async function restorePlanImports(userId: string) {
  const user = await User.findById(userId, { googleId: 1 }).lean()
  if (!user?.googleId) return
  const carried = await RateLimitCounter.findById(carriedPlanImportsKey(user.googleId)).lean()
  if (!carried || carried.count <= 0) return
  await User.updateOne(
    { _id: userId, recruiter: { $exists: true } },
    { $max: { 'recruiter.jobImportsUsed': carried.count } }
  )
}
