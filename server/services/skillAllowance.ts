import { SKILL_CLASSIFICATION } from 'portfolio-common'
import { rateLimitKey, takeRateLimitAmount } from './rateLimit'
import type { RateLimit } from './rateLimit'

// What one account adds to the classifier's queue. Every skill name the
// catalogue lacks is a Skill document the background job
// (skillClassificationJob.ts) asks Claude about, the oldest first: without a
// bound, one save of thousands of made-up names would take days of the site's
// calls, ahead of everyone else's skills. So an account adds
// SKILL_CLASSIFICATION.newNamesPerDay new names a UTC day to that queue; the
// names beyond are still stored and shown to their owner as typed, held back
// (Skill.findOrCreate, `held`): never sent, until a save within an account's
// allowance resolves them again (the same account another day, or anyone else
// who types the name), or an operator releases them. A save is never refused
// for it.

/** New skill names per account and UTC day that the classifier will be asked; an object so tests can change the limit */
export const NEW_SKILL_NAMES_PER_USER: RateLimit = {
  limit: SKILL_CLASSIFICATION.newNamesPerDay,
  windowMs: 24 * 60 * 60_000
}

/** The counter key of an account's new skill names: a hash of the account, never its id */
export const newSkillNamesKey = (userId: string) => rateLimitKey('skill-names:user', userId)

/**
 * For Experience's saves (ExperienceRequestContext.newSkillNames): of `wanted`
 * names the classifier was not asked about yet, how many the account may
 * still add today. All of them are counted, allowed or not, and never given
 * back
 */
export const newSkillNamesAllowance = (userId: string) => async (wanted: number) =>
  (await takeRateLimitAmount(newSkillNamesKey(userId), NEW_SKILL_NAMES_PER_USER, wanted)).allowed
