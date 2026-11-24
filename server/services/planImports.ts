import { RateLimitCounter, User } from '../models/database'
import { rateLimitKey } from './rateLimit'

// The job imports a recruiter plan allows for the account's lifetime
// (User.recruiter.jobImportsUsed), carried over a deletion: deleting an
// account and signing in again with the same Google account starts its next
// recruiter space from what the deleted one used (services/accountQuotas.ts
// carries them when it is deleted). Apart from accountQuotas.ts, which needs
// the counters of every paid feature, so that creating a recruiter space
// (services/recruiters.ts, which every recruiter route and the matching feeds
// load) loads nothing of those features.

/** How long the job imports a deleted recruiter space used are remembered (the plan's allowance is for the account's lifetime) */
export const CARRIED_PLAN_IMPORTS_MS = 30 * 24 * 60 * 60_000

/** Key of the job imports of the plan a deleted account of `googleId` used */
export const carriedPlanImportsKey = (googleId: string) => rateLimitKey('carried:job-imports-used', googleId)

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
