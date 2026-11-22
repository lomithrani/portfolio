import { SKILL_CLASSIFICATION } from 'portfolio-common'
import { env } from '../env'
import type { ServerEnv } from '../env'
import { onPendingSkillResolved } from '../models/database/skill'
import { logger } from './logger'
import { takeRateLimit } from './rateLimit'
import type { RateLimit } from './rateLimit'
import { SKILL_CLASSIFIER_MODEL, classifyPendingSkills, emptySkillBatchCounts } from './skillClassifier'
import type { SkillBatchCounts } from './skillClassifier'

// The background job of the skill catalogue: every
// SKILL_CLASSIFICATION_INTERVAL_MS, and shortly after an experience was
// saved with a skill not classified yet, one sweep has Claude classify the
// skills still to classify (skillClassifier.ts), the oldest first, in
// batches. Nothing is classified while someone types, and no request waits
// for it: a sweep runs on a timer, never fails a request and never throws
// out of its timer.
//
// Each call is billed, so a sweep makes at most SKILL_SWEEP_BATCHES of them,
// the site at most SKILL_CLASSIFICATION_DAILY_LIMIT per UTC day (counted
// when Claude is called, never given back), and a sweep first takes a lease
// in MongoDB so two instances of the API do not start a sweep in the same
// clock minute. The lease is that minute's, not the sweep's: a call still
// under way when the minute ends can overlap the next minute's sweep of
// another instance, which then asks the same names once more (one call paid
// twice; its results are skipped, each skill being written only while it is
// still to classify). Off without ANTHROPIC_API_KEY, or with either setting
// at 0.

const DAY_MS = 24 * 60 * 60_000

/** Batches (calls to Claude) a sweep makes at most */
export const SKILL_SWEEP_BATCHES = 5

/**
 * The lease a sweep takes before it does anything: one sweep started per
 * clock minute for the whole site, whichever instance of the API runs it
 * (see above for what it does not cover). A property so tests can change its
 * window
 */
export const skillSweepLease: RateLimit = { limit: 1, windowMs: 60_000 }

/** Counter keys of the lease and of the day's calls; properties so each test can count on keys of its own */
export const skillClassificationCounters = {
  leaseKey: 'skill-classification:lease',
  callsKey: 'skill-classification:calls'
}

/**
 * How long after a save resolved a skill still to classify its sweep runs
 * (the saves of the meantime share it), and how long the job's stop waits
 * for a sweep under way: properties so tests can shorten them
 */
export const skillClassificationTimings = { kickDelayMs: 15_000, stopWaitMs: 2_000 }

/** The calls to Claude the site makes per UTC day */
export const skillClassificationBudget = (): RateLimit => ({ limit: env.SKILL_CLASSIFICATION_DAILY_LIMIT, windowMs: DAY_MS })

type JobSettings = Pick<ServerEnv, 'ANTHROPIC_API_KEY' | 'SKILL_CLASSIFICATION_INTERVAL_MS' | 'SKILL_CLASSIFICATION_DAILY_LIMIT'>

/** Whether a sweep may call Claude at all: a key, and a daily limit that is not 0 */
export const skillClassificationEnabled = (
  settings: Pick<JobSettings, 'ANTHROPIC_API_KEY' | 'SKILL_CLASSIFICATION_DAILY_LIMIT'> = env
) => Boolean(settings.ANTHROPIC_API_KEY) && settings.SKILL_CLASSIFICATION_DAILY_LIMIT > 0

/** One-line state of the job, for the startup log (never the key) */
export const describeSkillClassification = (settings: JobSettings) => {
  if (!settings.ANTHROPIC_API_KEY) return 'off (no ANTHROPIC_API_KEY)'
  if (settings.SKILL_CLASSIFICATION_INTERVAL_MS <= 0) return 'off (SKILL_CLASSIFICATION_INTERVAL_MS is 0)'
  if (settings.SKILL_CLASSIFICATION_DAILY_LIMIT <= 0) return 'off (SKILL_CLASSIFICATION_DAILY_LIMIT is 0)'
  const seconds = Math.round(settings.SKILL_CLASSIFICATION_INTERVAL_MS / 1000)
  return `on (${SKILL_CLASSIFIER_MODEL}, every ${seconds} s and after a save, at most ${settings.SKILL_CLASSIFICATION_DAILY_LIMIT} calls of ${SKILL_CLASSIFICATION.batchSize} skills per day)`
}

// ── A sweep ─────────────────────────────────────────────────

export type SkillSweepResult =
  | {
      ran: false
      /**
       * `off`: no key, or a daily limit of 0. `running`: this process is
       * already sweeping. `leased`: a sweep took this minute's lease.
       * `failed`: MongoDB could not be asked
       */
      reason: 'off' | 'running' | 'leased' | 'failed'
      /** With `leased`: when the lease can be taken again */
      retryAfterSeconds?: number
    }
  | {
      ran: true
      counts: SkillBatchCounts
      /** The day's calls were used up before everything was classified */
      budgetReached: boolean
    }

/** The sweep this process is running, if any */
let sweeping: Promise<SkillSweepResult> | undefined
/** Set by the job's stop: the sweep under way starts no other batch (the next sweep clears it) */
let stopping = false

const runSweep = async (): Promise<SkillSweepResult> => {
  let lease = await takeRateLimit(skillClassificationCounters.leaseKey, skillSweepLease)
  if (lease.retryAfterSeconds !== null) return { ran: false, reason: 'leased', retryAfterSeconds: lease.retryAfterSeconds }

  const counts = emptySkillBatchCounts()
  let budgetReached = false
  // Taken when Claude is about to be called, never given back
  const mayCall = async () => {
    const taken = await takeRateLimit(skillClassificationCounters.callsKey, skillClassificationBudget())
    budgetReached = taken.retryAfterSeconds !== null
    return !budgetReached
  }

  try {
    for (let batch = 0; batch < SKILL_SWEEP_BATCHES && !stopping; batch++) {
      if (batch > 0 && Date.now() >= lease.resetsAt.getTime()) {
        // The minute it was taken for is over: go on only with the next one's
        lease = await takeRateLimit(skillClassificationCounters.leaseKey, skillSweepLease)
        if (lease.retryAfterSeconds !== null) break
      }
      const result = await classifyPendingSkills({ mayCall })
      for (const key of Object.keys(counts) as (keyof SkillBatchCounts)[]) counts[key] += result.counts[key]
      // Nothing left, the day's calls used up, or a call that got no answer (the next would ask the
      // same skills again). After an answer that could not be used the next batch is a smaller one,
      // or other skills: the sweep goes on
      if (result.state !== 'done' && !(result.state === 'failed' && result.narrowed)) break
    }
  } finally {
    // One line per sweep that had something to do: counts only, never a skill name
    if (counts.calls > 0 || counts.rejected > 0 || budgetReached) {
      logger.info('Skill classification sweep', {
        model: SKILL_CLASSIFIER_MODEL,
        calls: counts.calls,
        asked: counts.asked,
        classified: counts.classified,
        rejected: counts.rejected,
        failed: counts.failed,
        budgetReached,
        inputTokens: counts.inputTokens,
        outputTokens: counts.outputTokens,
        estimatedCostUsd: Math.round(counts.estimatedCostUsd * 1_000_000) / 1_000_000
      })
    }
  }
  return { ran: true, counts, budgetReached }
}

/**
 * One sweep: takes the lease, then classifies the skills still to classify,
 * the oldest first, in at most SKILL_SWEEP_BATCHES batches while the day's
 * calls allow. Never throws: what fails is logged (never a skill name) and
 * the skills stay to classify
 */
export function sweepSkillClassification(): Promise<SkillSweepResult> {
  if (!skillClassificationEnabled()) return Promise.resolve({ ran: false, reason: 'off' })
  if (sweeping) return Promise.resolve({ ran: false, reason: 'running' })
  stopping = false
  const sweep = runSweep()
    .catch((error): SkillSweepResult => {
      logger.error('Skill classification: the sweep failed', { errorName: error instanceof Error ? error.name : 'unknown' })
      return { ran: false, reason: 'failed' }
    })
    .finally(() => {
      sweeping = undefined
    })
  sweeping = sweep
  return sweep
}

// ── The job ─────────────────────────────────────────────────

let started = false
let kickTimer: ReturnType<typeof setTimeout> | undefined

/**
 * A sweep in `delayMs`, unless one is already to come: the saves of the
 * meantime share it. Only while the job is started
 */
const kick = (delayMs = skillClassificationTimings.kickDelayMs) => {
  if (!started || kickTimer !== undefined) return
  kickTimer = setTimeout(() => {
    kickTimer = undefined
    void run(true)
  }, delayMs)
  kickTimer.unref()
}

/** A sweep from a timer: nothing it does can throw out of it */
const run = async (kicked: boolean) => {
  try {
    const result = await sweepSkillClassification()
    if (result.ran || !kicked) return
    // A save's sweep that could not run now runs once it can: the interval's may be far
    if (result.reason === 'leased') kick((result.retryAfterSeconds ?? 0) * 1000 + 1_000)
    else if (result.reason === 'running') kick()
  } catch (error) {
    logger.error('Skill classification: the sweep failed', { errorName: error instanceof Error ? error.name : 'unknown' })
  }
}

/**
 * Starts the job: a sweep every `intervalMs` (0 turns the job off), one
 * shortly after it starts (what was left to classify) and one about
 * skillClassificationTimings.kickDelayMs after an experience save resolved a
 * skill still to classify. Off without ANTHROPIC_API_KEY or with a daily
 * limit of 0. Its timers are unref'ed, so they never keep the process alive.
 * Returns the function that stops it (call it on shutdown): it waits a
 * moment for a sweep under way, and never throws
 */
export const startSkillClassification = (intervalMs: number = env.SKILL_CLASSIFICATION_INTERVAL_MS): (() => Promise<void>) => {
  if (intervalMs <= 0 || !skillClassificationEnabled() || started) return async () => {}
  started = true
  // Called by Skill.findOrCreate, in the save: it only sets a timer
  const removeListener = onPendingSkillResolved(() => kick())
  const timer = setInterval(() => void run(false), intervalMs)
  timer.unref()
  kick()

  return async () => {
    if (!started) return
    started = false
    stopping = true
    clearInterval(timer)
    removeListener()
    clearTimeout(kickTimer)
    kickTimer = undefined
    const underWay = sweeping
    if (underWay) {
      let wait: ReturnType<typeof setTimeout> | undefined
      await Promise.race([underWay, new Promise((resolve) => (wait = setTimeout(resolve, skillClassificationTimings.stopWaitMs)))])
      clearTimeout(wait)
    }
  }
}
