import type Anthropic from '@anthropic-ai/sdk'
import { RESUME_IMPORT_TIMEOUTS } from 'portfolio-common'
import { env } from '../env'
import type { ServerEnv } from '../env'
import {
  ResumeImportDisabledError,
  TooManyRequestsError,
  UnprocessableContentError
} from '../errors'
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
import { logger } from './logger'
import { peekRateLimit, rateLimitKey, refundRateLimit, takeRateLimit } from './rateLimit'
import type { RateLimit, RateLimitTaken, RateLimitUsage } from './rateLimit'
import {
  RESUME_EXTRACTION_REQUEST,
  RESUME_EXTRACTION_SCHEMA,
  RESUME_EXTRACTION_SYSTEM_PROMPT,
  cleanLine,
  normalizeExtraction
} from './resumeExtraction'
import type { ExtractedExperience } from './resumeExtraction'

// Résumé import: a portfolio owner uploads a PDF résumé, Claude Haiku extracts
// its experiences, and the API answers with drafts the client shows for
// review (it saves the accepted ones through POST /experiences; nothing is
// stored here). Calls are billed to the operator's ANTHROPIC_API_KEY, so they
// are capped per user (RESUME_IMPORT_MONTHLY_LIMIT per 30 days) and for the
// whole site (RESUME_IMPORT_DAILY_LIMIT per UTC day), on top of the 4 MB and
// ~10-page caps. Once the paid request is sent the import counts, whatever
// happens next (drafts, a refusal, a timeout, a lost connection): Anthropic
// may have run, and billed, the model. Only an import that never got that far,
// or that Anthropic refused with an error status (not billed), is given back.
// Attempts are capped too (RESUME_IMPORT_ATTEMPTS_PER_DAY per user per UTC
// day) and never given back, so no failure can be retried in a loop.
//
// Neither the API key nor the PDF ever reaches a log line, a response or a
// span: see the client of services/claudePdfExtraction.ts, shared with the
// job description import.

export { estimateCostUsd }

export const RESUME_IMPORT_MODEL = PDF_IMPORT_MODEL
/** Largest PDF accepted, decoded */
export const MAX_RESUME_PDF_BYTES = MAX_PDF_BYTES
/**
 * Longest prompt imported (PDF and instructions), counted for free before the
 * import: about 10 pages, each page costing its text and its image
 */
export const MAX_RESUME_INPUT_TOKENS = MAX_PDF_INPUT_TOKENS
/** Room for adaptive thinking and the JSON of a long résumé */
export const RESUME_IMPORT_MAX_OUTPUT_TOKENS = 16_000

/**
 * Time limits of the two steps (RESUME_IMPORT_TIMEOUTS of portfolio-common,
 * which the browser outlasts); a property so tests can shorten them. Each is
 * one deadline: counting, its retry and any wait the API asks for included,
 * so an import answers within countMs + extractMs. The paid call is streamed,
 * so no response-wide timeout cuts a long answer short: its deadline
 * (connection, prompt and the whole answer) leaves 16,000 output tokens about
 * 90 tokens a second
 */
export const resumeImportTimeouts: { countMs: number; extractMs: number } = {
  countMs: RESUME_IMPORT_TIMEOUTS.countMs,
  extractMs: RESUME_IMPORT_TIMEOUTS.extractMs
}

export const RESUME_IMPORT_MONTHLY_WINDOW_MS = 30 * 24 * 60 * 60_000
export const RESUME_IMPORT_DAILY_WINDOW_MS = 24 * 60 * 60_000

/** Counter key of a user's imports (an HMAC of the user id, like the booking limits) */
export const resumeImportUserKey = (userId: string) => rateLimitKey('resume-import:user', userId)

/** Counter key of a user's attempts of the day, never given back */
export const resumeImportAttemptsKey = (userId: string) => rateLimitKey('resume-import:attempts', userId)

/** Counter key of the site-wide daily limit; a property so each test can count on a key of its own */
export const resumeImportCounters = { globalKey: 'resume-import:global' }

const LABELS: PdfImportLabels = {
  name: 'Résumé import',
  unavailable: 'Résumé import is temporarily unavailable, try again later',
  interrupted:
    'The import did not finish. It still counts toward your imports (the résumé may already have been read): try again later, or with a shorter résumé'
}

interface ResumeImportSettings {
  apiKey: string
  perUser: RateLimit
  perDay: RateLimit
  attempts: RateLimit
}

/** The feature's settings, read on each call (tests change env); null while it is off */
const currentSettings = (): ResumeImportSettings | null => {
  const { ANTHROPIC_API_KEY, RESUME_IMPORT_MONTHLY_LIMIT, RESUME_IMPORT_DAILY_LIMIT, RESUME_IMPORT_ATTEMPTS_PER_DAY } = env
  if (!ANTHROPIC_API_KEY || RESUME_IMPORT_MONTHLY_LIMIT === 0 || RESUME_IMPORT_DAILY_LIMIT === 0 || RESUME_IMPORT_ATTEMPTS_PER_DAY === 0) {
    return null
  }
  return {
    apiKey: ANTHROPIC_API_KEY,
    perUser: { limit: RESUME_IMPORT_MONTHLY_LIMIT, windowMs: RESUME_IMPORT_MONTHLY_WINDOW_MS },
    perDay: { limit: RESUME_IMPORT_DAILY_LIMIT, windowMs: RESUME_IMPORT_DAILY_WINDOW_MS },
    attempts: { limit: RESUME_IMPORT_ATTEMPTS_PER_DAY, windowMs: RESUME_IMPORT_DAILY_WINDOW_MS }
  }
}

/** One-line state of the feature, for the startup log (never the key) */
export const describeResumeImport = (
  settings: Pick<
    ServerEnv,
    'ANTHROPIC_API_KEY' | 'RESUME_IMPORT_MONTHLY_LIMIT' | 'RESUME_IMPORT_DAILY_LIMIT' | 'RESUME_IMPORT_ATTEMPTS_PER_DAY'
  >
) => {
  if (!settings.ANTHROPIC_API_KEY) return 'off (no ANTHROPIC_API_KEY)'
  if (settings.RESUME_IMPORT_MONTHLY_LIMIT === 0) return 'off (RESUME_IMPORT_MONTHLY_LIMIT=0)'
  if (settings.RESUME_IMPORT_DAILY_LIMIT === 0) return 'off (RESUME_IMPORT_DAILY_LIMIT=0)'
  if (settings.RESUME_IMPORT_ATTEMPTS_PER_DAY === 0) return 'off (RESUME_IMPORT_ATTEMPTS_PER_DAY=0)'
  return `on (${settings.RESUME_IMPORT_MONTHLY_LIMIT} per user per 30 days, ${settings.RESUME_IMPORT_DAILY_LIMIT} per day, ${settings.RESUME_IMPORT_ATTEMPTS_PER_DAY} attempts per user per day)`
}

export function assertResumeImportEnabled() {
  if (!currentSettings()) throw new ResumeImportDisabledError('Résumé import is not enabled on this server')
}

// ── Quotas ──────────────────────────────────────────────────

export interface ResumeImportQuota {
  /** Imports per user per 30-day window */
  limit: number
  /**
   * Imports this user can start now: their own allowance, capped by what is
   * left of the site's daily one and of their attempts of the day
   */
  remaining: number
  /** When `remaining` next goes up (ISO 8601); null when nothing is used up */
  resetsAt: string | null
}

export interface ResumeImportStatus extends ResumeImportQuota {
  /** False without ANTHROPIC_API_KEY or with a limit set to 0 */
  enabled: boolean
}

interface QuotaUsage {
  user: RateLimitUsage
  site: RateLimitUsage
  attempts: RateLimitUsage
}

const quotaOf = (settings: ResumeImportSettings, usage: QuotaUsage): ResumeImportQuota => {
  const counters = [
    { usage: usage.user, limit: settings.perUser.limit },
    { usage: usage.site, limit: settings.perDay.limit },
    { usage: usage.attempts, limit: settings.attempts.limit }
  ].map((counter) => ({ ...counter, remaining: Math.max(0, counter.limit - counter.usage.count) }))
  const remaining = Math.min(...counters.map((counter) => counter.remaining))
  // `remaining` goes up once every counter tied at it has started a new
  // window. A tied counter with nothing used is already at its full
  // allowance: it never goes up, and neither does `remaining`
  const tied = counters.filter((counter) => counter.remaining === remaining)
  const resetsAt = tied.every((counter) => counter.usage.count > 0)
    ? Math.max(...tied.map((counter) => counter.usage.resetsAt.getTime()))
    : null
  return {
    limit: settings.perUser.limit,
    remaining,
    resetsAt: resetsAt === null ? null : new Date(resetsAt).toISOString()
  }
}

/** GET /experiences/import: whether the feature is on and what is left of this user's allowance */
export async function getResumeImportStatus(userId: string): Promise<ResumeImportStatus> {
  const settings = currentSettings()
  if (!settings) return { enabled: false, limit: env.RESUME_IMPORT_MONTHLY_LIMIT, remaining: 0, resetsAt: null }
  const [user, site, attempts] = await Promise.all([
    peekRateLimit(resumeImportUserKey(userId), settings.perUser),
    peekRateLimit(resumeImportCounters.globalKey, settings.perDay),
    peekRateLimit(resumeImportAttemptsKey(userId), settings.attempts)
  ])
  return { enabled: true, ...quotaOf(settings, { user, site, attempts }) }
}

// ── The file ────────────────────────────────────────────────

/**
 * The PDF of a request, as base64 without a data URL header. Throws 422 for
 * invalid base64 or a file that is not a PDF, 413 above MAX_RESUME_PDF_BYTES.
 * Only its first bytes are decoded: the base64 is what Claude receives.
 */
export function readResumePdf(file: string): string {
  return readPdfBase64(file, 'The file is too large: résumé import takes PDFs of up to 4 MB')
}

// ── Import ──────────────────────────────────────────────────

export interface ResumeImportResult {
  /** Drafts, most recent first; nothing is saved */
  experiences: ExtractedExperience[]
  /** What the owner should know about the drafts (left-out dates, shortened texts...) */
  warnings: string[]
  quota: ResumeImportQuota
}

/** Gives back counted imports; a failure is logged, not thrown (the request's own error matters more) */
const refund = (taken: RateLimitTaken[]) =>
  giveBack(LABELS, taken.map((counter) => () => refundRateLimit(counter.counterId)))

/**
 * POST /experiences/import, once the caller is known to own a domain: checks
 * the file, counts the import against both limits and the attempt against the
 * user's attempts of the day, has Claude extract the experiences and returns
 * them normalised.
 */
export async function importResume(userId: string, file: string, fileName?: string): Promise<ResumeImportResult> {
  const settings = currentSettings()
  if (!settings) throw new ResumeImportDisabledError('Résumé import is not enabled on this server')
  const pdf = readResumePdf(file)

  // The import's counters, given back unless it counts. The attempt is not
  // among them: it is never given back
  const taken: RateLimitTaken[] = []
  // Set once the paid call may have run the model: the import then stays counted
  let counted = false
  try {
    const user = await takeRateLimit(resumeImportUserKey(userId), settings.perUser)
    taken.push(user)
    if (user.retryAfterSeconds !== null) {
      throw new TooManyRequestsError(
        `You have used your ${plural(settings.perUser.limit, 'résumé import', 'résumé imports')} for this period. You can import again from ${utcText(user.resetsAt)}`,
        user.retryAfterSeconds
      )
    }
    const site = await takeRateLimit(resumeImportCounters.globalKey, settings.perDay)
    taken.push(site)
    if (site.retryAfterSeconds !== null) {
      throw new TooManyRequestsError(
        `Résumé import has reached its daily limit on this site. Try again after ${utcText(site.resetsAt)}`,
        site.retryAfterSeconds
      )
    }
    // Last, so a user over a limit above is told about that limit
    const attempts = await takeRateLimit(resumeImportAttemptsKey(userId), settings.attempts)
    if (attempts.retryAfterSeconds !== null) {
      throw new TooManyRequestsError(
        `You have used your ${plural(settings.attempts.limit, 'résumé import attempt', 'résumé import attempts')} for today. Try again after ${utcText(attempts.resetsAt)}`,
        attempts.retryAfterSeconds
      )
    }

    const client = createClaudeClient(settings.apiKey)
    const request = pdfExtractionRequest({
      system: RESUME_EXTRACTION_SYSTEM_PROMPT,
      instruction: RESUME_EXTRACTION_REQUEST,
      schema: RESUME_EXTRACTION_SCHEMA,
      pdf,
      // Part of the untrusted document, like its content
      title: fileName === undefined ? undefined : cleanLine(fileName)
    })

    const inputTokens = await countInputTokens(client, request, {
      labels: LABELS,
      apiKey: settings.apiKey,
      deadlineMs: resumeImportTimeouts.countMs
    })
    if (inputTokens > MAX_RESUME_INPUT_TOKENS) {
      throw new UnprocessableContentError('This PDF is too long for an import (more than ~10 pages)')
    }

    const message = await streamPaidCall(client, request, {
      labels: LABELS,
      apiKey: settings.apiKey,
      maxTokens: RESUME_IMPORT_MAX_OUTPUT_TOKENS,
      deadlineMs: resumeImportTimeouts.extractMs,
      onCounted: () => {
        counted = true
      }
    })
    counted = true

    const result = readExtraction(message)
    return { ...result, quota: quotaOf(settings, { user, site, attempts }) }
  } catch (error) {
    if (!counted) await refund(taken)
    throw error
  }
}

/** The drafts of Claude's answer; throws 422 when it refused or ran out of tokens */
const readExtraction = (message: Anthropic.Message) => {
  // One line per paid call, and nothing about the résumé or its owner
  const logCall = (experiences: number) =>
    logger.info('Résumé import', {
      experiences,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      estimatedCostUsd: estimateCostUsd(message.usage),
      stopReason: message.stop_reason ?? undefined
    })

  // Before reading the content: neither answer follows the schema
  if (message.stop_reason === 'refusal') {
    logCall(0)
    throw new UnprocessableContentError('This file could not be read as a résumé')
  }
  if (message.stop_reason === 'max_tokens' || message.stop_reason === 'model_context_window_exceeded') {
    logCall(0)
    throw new UnprocessableContentError(
      'This résumé has too much content to import at once. Try a shorter version'
    )
  }

  // Structured outputs make an answer that is not JSON unlikely; the drafts
  // are then empty, with a warning
  const extraction = normalizeExtraction(outputJson(message))
  logCall(extraction.experiences.length)
  return extraction
}
