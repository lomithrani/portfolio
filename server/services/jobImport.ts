import type Anthropic from '@anthropic-ai/sdk'
import { RECRUITER_PLANS, RESUME_IMPORT_TIMEOUTS } from 'portfolio-common'
import type { RecruiterPlan } from 'portfolio-common'
import { env } from '../env'
import type { ServerEnv } from '../env'
import {
  JobImportDisabledError,
  PlanLimitReachedError,
  TooManyRequestsError,
  UnprocessableContentError
} from '../errors'
import { User } from '../models/database'
import {
  MAX_PDF_BYTES,
  MAX_PDF_INPUT_TOKENS,
  PDF_IMPORT_MODEL,
  countInputTokens,
  createClaudeClient,
  estimateCostUsd,
  giveBack,
  outputJson,
  pdfExtractionRequest,
  plural,
  readPdfBase64,
  streamPaidCall,
  utcText
} from './claudePdfExtraction'
import type { PdfImportLabels } from './claudePdfExtraction'
import {
  JOB_EXTRACTION_REQUEST,
  JOB_EXTRACTION_SCHEMA,
  JOB_EXTRACTION_SYSTEM_PROMPT,
  cleanLine,
  draftFieldCount,
  normalizeJobExtraction
} from './jobExtraction'
import type { JobExtraction, JobPostingDraft } from './jobExtraction'
import { logger } from './logger'
import { peekRateLimit, rateLimitKey, refundRateLimit, takeRateLimit } from './rateLimit'
import type { RateLimit, RateLimitUsage } from './rateLimit'
import { requireRecruiterSpace } from './recruiters'
import type { RecruiterSpace } from './recruiters'

// Job description import: a recruiter uploads a job description as a PDF,
// Claude Haiku extracts a job posting, and the API answers with a draft the
// client fills its editor with (saved through POST /jobs; nothing is stored
// here). The same safety rules as the résumé import (services/resumeImport.ts,
// with which it shares services/claudePdfExtraction.ts): calls are billed to
// the operator's ANTHROPIC_API_KEY, so each recruiter gets the imports of
// their plan (portfolio-common RECRUITER_PLANS: 3 on the free plan, for the
// lifetime of the account; User.recruiter.jobImportsUsed), the whole site
// JOB_IMPORT_DAILY_LIMIT per UTC day, on top of the 4 MB and ~10-page caps.
// Once the paid request is sent the import counts, whatever happens next (a
// draft, a refusal, a timeout, a lost connection): Anthropic may have run, and
// billed, the model. Only an import that never got that far, or that Anthropic
// refused with an error status (not billed), is given back. Attempts are
// capped too (JOB_IMPORT_ATTEMPTS_PER_DAY per recruiter per UTC day) and never
// given back, so no failure can be retried in a loop.

export const JOB_IMPORT_MODEL = PDF_IMPORT_MODEL
/** Largest PDF accepted, decoded */
export const MAX_JOB_PDF_BYTES = MAX_PDF_BYTES
/** Longest prompt imported (PDF and instructions), counted for free before the import: about 10 pages */
export const MAX_JOB_INPUT_TOKENS = MAX_PDF_INPUT_TOKENS
/** Room for adaptive thinking and the JSON of a long job description (a 20,000-character description) */
export const JOB_IMPORT_MAX_OUTPUT_TOKENS = 16_000

/**
 * Time limits of the two steps, the résumé import's (RESUME_IMPORT_TIMEOUTS
 * of portfolio-common: the browser waits RESUME_IMPORT_CLIENT_TIMEOUT_MS for
 * both); a property so tests can shorten them. Each is one deadline: an
 * import answers within countMs + extractMs
 */
export const jobImportTimeouts: { countMs: number; extractMs: number } = {
  countMs: RESUME_IMPORT_TIMEOUTS.countMs,
  extractMs: RESUME_IMPORT_TIMEOUTS.extractMs
}

export const JOB_IMPORT_DAILY_WINDOW_MS = 24 * 60 * 60_000

/** Counter key of a recruiter's attempts of the day (an HMAC of the user id), never given back */
export const jobImportAttemptsKey = (userId: string) => rateLimitKey('job-import:attempts', userId)

/** Counter key of the site-wide daily limit; a property so each test can count on a key of its own */
export const jobImportCounters = { globalKey: 'job-import:global' }

const LABELS: PdfImportLabels = {
  name: 'Job description import',
  unavailable: 'Job description import is temporarily unavailable, try again later',
  interrupted:
    'The import did not finish. It still counts toward your imports (the job description may already have been read): try again later, or with a shorter document'
}

const DISABLED = 'Job description import is not enabled on this server'

interface JobImportSettings {
  apiKey: string
  perDay: RateLimit
  attempts: RateLimit
}

/** The feature's settings, read on each call (tests change env); null while it is off */
const currentSettings = (): JobImportSettings | null => {
  const { ANTHROPIC_API_KEY, JOB_IMPORT_DAILY_LIMIT, JOB_IMPORT_ATTEMPTS_PER_DAY } = env
  if (!ANTHROPIC_API_KEY || JOB_IMPORT_DAILY_LIMIT === 0 || JOB_IMPORT_ATTEMPTS_PER_DAY === 0) return null
  return {
    apiKey: ANTHROPIC_API_KEY,
    perDay: { limit: JOB_IMPORT_DAILY_LIMIT, windowMs: JOB_IMPORT_DAILY_WINDOW_MS },
    attempts: { limit: JOB_IMPORT_ATTEMPTS_PER_DAY, windowMs: JOB_IMPORT_DAILY_WINDOW_MS }
  }
}

/** One-line state of the feature, for the startup log (never the key) */
export const describeJobImport = (
  settings: Pick<ServerEnv, 'ANTHROPIC_API_KEY' | 'JOB_IMPORT_DAILY_LIMIT' | 'JOB_IMPORT_ATTEMPTS_PER_DAY'>
) => {
  if (!settings.ANTHROPIC_API_KEY) return 'off (no ANTHROPIC_API_KEY)'
  if (settings.JOB_IMPORT_DAILY_LIMIT === 0) return 'off (JOB_IMPORT_DAILY_LIMIT=0)'
  if (settings.JOB_IMPORT_ATTEMPTS_PER_DAY === 0) return 'off (JOB_IMPORT_ATTEMPTS_PER_DAY=0)'
  return `on (${RECRUITER_PLANS.free.jobImports} per recruiter on the free plan, ${settings.JOB_IMPORT_DAILY_LIMIT} per day, ${settings.JOB_IMPORT_ATTEMPTS_PER_DAY} attempts per recruiter per day)`
}

// ── Quotas ──────────────────────────────────────────────────

export interface JobImportQuota {
  /** The recruiter's plan */
  plan: RecruiterPlan
  /** Imports the plan includes, for the lifetime of the account */
  limit: number
  /** Imports counted so far */
  used: number
  /**
   * Imports the recruiter can start now: what is left of their plan, capped
   * by what is left today of the site's allowance and of their attempts
   */
  remaining: number
  /**
   * When `remaining` next goes up; null when nothing is used up, or when the
   * plan is what holds it (it never resets: only a paid plan lifts it). A
   * Date, not an ISO string: it is sent as one, and Eden Treaty turns any
   * ISO-looking string back into a Date, so its type says what the client gets
   */
  resetsAt: Date | null
}

export interface JobImportStatus extends JobImportQuota {
  /** False without ANTHROPIC_API_KEY or with a limit set to 0 */
  enabled: boolean
}

interface PlanUsage {
  plan: RecruiterPlan
  limit: number
  used: number
}

/** The plan of a recruiter space and its imports used */
const planUsage = (space: RecruiterSpace, used = space.jobImportsUsed): PlanUsage => ({
  plan: space.plan,
  limit: RECRUITER_PLANS[space.plan].jobImports,
  used
})

const quotaOf = (
  settings: JobImportSettings,
  plan: PlanUsage,
  usage: { site: RateLimitUsage; attempts: RateLimitUsage }
): JobImportQuota => {
  const planLeft = Math.max(0, plan.limit - plan.used)
  const daily = [
    { usage: usage.site, limit: settings.perDay.limit },
    { usage: usage.attempts, limit: settings.attempts.limit }
  ].map((counter) => ({ ...counter, remaining: Math.max(0, counter.limit - counter.usage.count) }))
  const remaining = Math.min(planLeft, ...daily.map((counter) => counter.remaining))
  // `remaining` goes up once every counter tied at it has started a new
  // window. The plan never does by itself, and a tied daily counter with
  // nothing used is already at its full allowance: neither does `remaining`
  const tied = daily.filter((counter) => counter.remaining === remaining)
  const resetsAt =
    planLeft > remaining && tied.every((counter) => counter.usage.count > 0)
      ? Math.max(...tied.map((counter) => counter.usage.resetsAt.getTime()))
      : null
  return { ...plan, remaining, resetsAt: resetsAt === null ? null : new Date(resetsAt) }
}

/**
 * GET /jobs/import: whether the feature is on and what is left of this
 * recruiter's imports. Throws 403 without a recruiter space
 */
export async function getJobImportStatus(userId: string): Promise<JobImportStatus> {
  const space = await requireRecruiterSpace(userId)
  const plan = planUsage(space)
  const settings = currentSettings()
  if (!settings) return { enabled: false, ...plan, remaining: 0, resetsAt: null }
  const [site, attempts] = await Promise.all([
    peekRateLimit(jobImportCounters.globalKey, settings.perDay),
    peekRateLimit(jobImportAttemptsKey(userId), settings.attempts)
  ])
  return { enabled: true, ...quotaOf(settings, plan, { site, attempts }) }
}

/**
 * Counts one import against the recruiter's plan, atomically: the counter
 * only goes up while it is under `limit`. Its new value; null when the plan
 * has no import left
 */
const takePlanImport = async (userId: string, limit: number) => {
  const user = await User.findOneAndUpdate(
    { _id: userId, 'recruiter.jobImportsUsed': { $lt: limit } },
    { $inc: { 'recruiter.jobImportsUsed': 1 } },
    { returnDocument: 'after', projection: { recruiter: 1 } }
  ).lean()
  return user?.recruiter?.jobImportsUsed ?? null
}

/** Gives back an import counted by takePlanImport (never below 0) */
const refundPlanImport = (userId: string) =>
  User.updateOne({ _id: userId, 'recruiter.jobImportsUsed': { $gt: 0 } }, { $inc: { 'recruiter.jobImportsUsed': -1 } })

// ── Import ──────────────────────────────────────────────────

export interface JobImportResult {
  /** The posting found in the file, for the job editor; nothing is saved */
  draft: JobPostingDraft
  /** What the recruiter should know about the draft (left-out values, fields not found...) */
  warnings: string[]
  quota: JobImportQuota
}

/**
 * The PDF of a request, as base64 without a data URL header. Throws 422 for
 * invalid base64 or a file that is not a PDF, 413 above MAX_JOB_PDF_BYTES
 */
export const readJobPdf = (file: string) =>
  readPdfBase64(file, 'The file is too large: job description import takes PDFs of up to 4 MB')

/**
 * POST /jobs/import: checks that the feature is on, that the caller has a
 * recruiter space (403) and the file; counts the import against the
 * recruiter's plan (402 when it has none left) and the site's daily limit,
 * and the attempt against the recruiter's attempts of the day; has Claude
 * extract the job posting and returns it normalised.
 */
export async function importJobDescription(userId: string, file: string, fileName?: string): Promise<JobImportResult> {
  const settings = currentSettings()
  if (!settings) throw new JobImportDisabledError(DISABLED)
  const space = await requireRecruiterSpace(userId)
  const pdf = readJobPdf(file)
  const { limit } = planUsage(space)

  // Gives back the import's counts unless it counts. The attempt is not
  // among them: it is never given back
  const refunds: (() => Promise<unknown>)[] = []
  // Set once the paid call may have run the model: the import then stays counted
  let counted = false
  try {
    const used = await takePlanImport(userId, limit)
    if (used === null) {
      throw new PlanLimitReachedError(
        `You have used the ${plural(limit, 'job description import', 'job description imports')} included in the ${space.plan} plan. Paid plans are coming soon.`
      )
    }
    refunds.push(() => refundPlanImport(userId))
    const site = await takeRateLimit(jobImportCounters.globalKey, settings.perDay)
    refunds.push(() => refundRateLimit(site.counterId))
    if (site.retryAfterSeconds !== null) {
      throw new TooManyRequestsError(
        `Job description import has reached its daily limit on this site. Try again after ${utcText(site.resetsAt)}`,
        site.retryAfterSeconds
      )
    }
    // Last, so a recruiter over a limit above is told about that limit
    const attempts = await takeRateLimit(jobImportAttemptsKey(userId), settings.attempts)
    if (attempts.retryAfterSeconds !== null) {
      throw new TooManyRequestsError(
        `You have used your ${plural(settings.attempts.limit, 'job description import attempt', 'job description import attempts')} for today. Try again after ${utcText(attempts.resetsAt)}`,
        attempts.retryAfterSeconds
      )
    }

    const client = createClaudeClient(settings.apiKey)
    const request = pdfExtractionRequest({
      system: JOB_EXTRACTION_SYSTEM_PROMPT,
      instruction: JOB_EXTRACTION_REQUEST,
      schema: JOB_EXTRACTION_SCHEMA,
      pdf,
      // Part of the untrusted document, like its content
      title: fileName === undefined ? undefined : cleanLine(fileName)
    })

    const inputTokens = await countInputTokens(client, request, {
      labels: LABELS,
      apiKey: settings.apiKey,
      deadlineMs: jobImportTimeouts.countMs
    })
    if (inputTokens > MAX_JOB_INPUT_TOKENS) {
      throw new UnprocessableContentError('This PDF is too long for an import (more than ~10 pages)')
    }

    const message = await streamPaidCall(client, request, {
      labels: LABELS,
      apiKey: settings.apiKey,
      maxTokens: JOB_IMPORT_MAX_OUTPUT_TOKENS,
      deadlineMs: jobImportTimeouts.extractMs,
      onCounted: () => {
        counted = true
      }
    })
    counted = true

    const result = readExtraction(message)
    return { ...result, quota: quotaOf(settings, planUsage(space, used), { site, attempts }) }
  } catch (error) {
    if (!counted) await giveBack(LABELS, refunds)
    throw error
  }
}

/** The draft of Claude's answer; throws 422 when it refused or ran out of tokens */
const readExtraction = (message: Anthropic.Message): JobExtraction => {
  // One line per paid call, and nothing about the document or its recruiter
  const logCall = (fields: number) =>
    logger.info('Job description import', {
      fields,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      estimatedCostUsd: estimateCostUsd(message.usage),
      stopReason: message.stop_reason ?? undefined
    })

  // Before reading the content: neither answer follows the schema
  if (message.stop_reason === 'refusal') {
    logCall(0)
    throw new UnprocessableContentError('This file could not be read as a job description')
  }
  if (message.stop_reason === 'max_tokens' || message.stop_reason === 'model_context_window_exceeded') {
    logCall(0)
    throw new UnprocessableContentError(
      'This job description has too much content to import at once. Try a shorter version'
    )
  }

  // Structured outputs make an answer that is not JSON unlikely; the draft is
  // then empty, with a warning
  const extraction = normalizeJobExtraction(outputJson(message))
  logCall(draftFieldCount(extraction.draft))
  return extraction
}
