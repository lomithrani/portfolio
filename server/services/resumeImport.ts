import Anthropic from '@anthropic-ai/sdk'
import { env } from '../env'
import type { ServerEnv } from '../env'
import {
  PayloadTooLargeError,
  ResumeImportDisabledError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnprocessableContentError
} from '../errors'
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
// span: the SDK client below logs at warn and above only (its debug lines
// carry request bodies), and traces in metadata_only mode whatever the
// ANTHROPIC_OPEN_TELEMETRY_* variables say.

export const RESUME_IMPORT_MODEL = 'claude-haiku-5-5'
/** Largest PDF accepted, decoded */
export const MAX_RESUME_PDF_BYTES = 4 * 1024 * 1024
/**
 * Longest prompt imported (PDF and instructions), counted for free before the
 * import: about 10 pages, each page costing its text and its image
 */
export const MAX_RESUME_INPUT_TOKENS = 60_000
/** Room for adaptive thinking and the JSON of a long résumé */
export const RESUME_IMPORT_MAX_OUTPUT_TOKENS = 16_000

/**
 * Time limits of the two calls; a property so tests can shorten them. The
 * paid call is streamed, so no response-wide timeout cuts a long answer
 * short: its deadline (connection, prompt and the whole answer) leaves
 * 16,000 output tokens about 90 tokens a second
 */
export const resumeImportTimeouts = { countMs: 20_000, extractMs: 180_000 }

export const RESUME_IMPORT_MONTHLY_WINDOW_MS = 30 * 24 * 60 * 60_000
export const RESUME_IMPORT_DAILY_WINDOW_MS = 24 * 60 * 60_000

/** Counter key of a user's imports (an HMAC of the user id, like the booking limits) */
export const resumeImportUserKey = (userId: string) => rateLimitKey('resume-import:user', userId)

/** Counter key of a user's attempts of the day, never given back */
export const resumeImportAttemptsKey = (userId: string) => rateLimitKey('resume-import:attempts', userId)

/** Counter key of the site-wide daily limit; a property so each test can count on a key of its own */
export const resumeImportCounters = { globalKey: 'resume-import:global' }

// Claude Haiku 5.5 prices in USD per million tokens: one rate card for prompts
// up to 100K tokens, another above (never reached under MAX_RESUME_INPUT_TOKENS)
const PRICING = {
  longPromptTokens: 100_000,
  standard: { input: 0.1, output: 0.5 },
  longPrompt: { input: 0.5, output: 2.5 }
}

const UNAVAILABLE = 'Résumé import is temporarily unavailable, try again later'
const INTERRUPTED =
  'The import did not finish. It still counts toward your imports (the résumé may already have been read): try again later, or with a shorter résumé'

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

/** e.g. "2026-11-20 00:00 UTC" (windows end at midnight UTC) */
const utcText = (date: Date) => `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

// ── The file ────────────────────────────────────────────────

// A data URL's header, e.g. what FileReader.readAsDataURL() puts before the base64
const DATA_URL_HEADER = /^data:[^,]{0,200};base64,/i
// Standard alphabet, padded (what btoa(), Buffer and readAsDataURL() produce)
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * The PDF of a request, as base64 without a data URL header. Throws 422 for
 * invalid base64 or a file that is not a PDF, 413 above MAX_RESUME_PDF_BYTES.
 * Only its first bytes are decoded: the base64 is what Claude receives.
 */
export function readResumePdf(file: string): string {
  const header = DATA_URL_HEADER.exec(file.slice(0, 256))
  const base64 = header ? file.slice(header[0].length) : file
  if (base64.length % 4 !== 0 || !BASE64.test(base64)) {
    throw new UnprocessableContentError('The file is not valid base64')
  }
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  if ((base64.length / 4) * 3 - padding > MAX_RESUME_PDF_BYTES) {
    throw new PayloadTooLargeError('The file is too large: résumé import takes PDFs of up to 4 MB')
  }
  if (Buffer.from(base64.slice(0, 8), 'base64').toString('latin1').slice(0, 5) !== '%PDF-') {
    throw new UnprocessableContentError('Only PDF files can be imported')
  }
  return base64
}

// ── Claude ──────────────────────────────────────────────────

// The SDK's log lines, as one-line records of the app's logger. Only the
// message: the SDK passes request details as extra arguments
const sdkLogger = {
  error: (message: string) => logger.error(`Anthropic SDK: ${message}`),
  warn: (message: string) => logger.warn(`Anthropic SDK: ${message}`),
  info: (message: string) => logger.info(`Anthropic SDK: ${message}`),
  debug: (message: string) => logger.debug(`Anthropic SDK: ${message}`)
}

// Built for each import (a few per day): it then follows env (tests change the
// key) and the tracer provider registered at the time. No retries unless a
// call asks for them: a paid call sent twice is billed twice
const createClient = (apiKey: string) =>
  new Anthropic({
    apiKey,
    // Explicit, so neither ANTHROPIC_AUTH_TOKEN nor ANTHROPIC_BASE_URL can redirect the call
    authToken: null,
    baseURL: 'https://api.anthropic.com',
    maxRetries: 0,
    // Looked up on each request rather than when the client is built, so tests can stub it
    fetch: (input, init) => globalThis.fetch(input, init),
    // Debug lines (ANTHROPIC_LOG=debug) would print the request, PDF included
    logLevel: 'warn',
    logger: sdkLogger,
    // Given in code, so ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE=content cannot put the PDF in spans
    openTelemetry: { traces: { contentMode: 'metadata_only' } }
  })

/** The request, without max_tokens: the same content is counted, then sent */
const extractionRequest = (pdf: string, fileName: string | undefined) => {
  // Part of the untrusted document, like its content
  const title = fileName === undefined ? undefined : cleanLine(fileName)
  return {
    model: RESUME_IMPORT_MODEL,
    system: RESUME_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user' as const,
        // Document first: Claude reads PDFs best placed before the request
        content: [
          {
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdf },
            ...(title && { title })
          },
          { type: 'text' as const, text: RESUME_EXTRACTION_REQUEST }
        ]
      }
    ],
    // Thinking stays adaptive (the default of this model), at low effort. No
    // temperature/top_p/top_k and no prefill: Claude Haiku 5.5 refuses them
    output_config: {
      effort: 'low' as const,
      format: { type: 'json_schema' as const, schema: RESUME_EXTRACTION_SCHEMA }
    }
  }
}

/**
 * Estimated cost of a Claude Haiku 5.5 response, in USD (6 decimals). The
 * import uses no prompt caching: cache tokens only count toward the size of
 * the prompt that picks the rate card
 */
export const estimateCostUsd = (usage: Pick<Anthropic.Usage, 'input_tokens' | 'output_tokens' | 'cache_creation_input_tokens' | 'cache_read_input_tokens'>) => {
  const prompt = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
  const card = prompt > PRICING.longPromptTokens ? PRICING.longPrompt : PRICING.standard
  const usd = (usage.input_tokens * card.input + usage.output_tokens * card.output) / 1_000_000
  return Math.round(usd * 1_000_000) / 1_000_000
}

/**
 * Whether Anthropic answered the request with an error status, before running
 * the model: such a request is not billed. Every other failure of the paid
 * call (a timeout, a lost connection, the deadline, an error event in the
 * stream after its 200) may come after the model ran
 */
const refusedBeforeRunning = (error: unknown) => error instanceof Anthropic.APIError && error.status !== undefined

/**
 * What a failed Claude call becomes, always a 503 (a 500 for what is not an
 * API error: a bug):
 * - outages and rate limits (Anthropic's or the workspace's), at warn;
 * - a request Claude refuses (bad key, spend limit, model access, a request
 *   or schema the API rejects, while counting too), at error with the API's
 *   message: the operator must act;
 * - the paid call cut off after it was sent, at warn: that import counts.
 */
const claudeFailure = (step: 'count' | 'extract', error: unknown, apiKey: string, deadlineReached = false): unknown => {
  if (!(error instanceof Anthropic.APIError)) return error
  const details = {
    step,
    // The SDK's classes keep the name "Error"
    errorName: error.constructor.name,
    status: error.status,
    type: error.type ?? undefined,
    requestId: error.requestID ?? undefined,
    // The API's own explanation (e.g. an invalid key, a spend limit), short; it
    // never quotes the request, and the key is masked should it ever appear
    message: error.message.replaceAll(apiKey, '***').slice(0, 300)
  }
  if (error.status === undefined) {
    // No answer, or the stream broke off: the connection failed or timed out,
    // the deadline passed, or an error event came after the 200
    if (step === 'count') {
      logger.warn('Résumé import: the Claude API is unavailable', details)
      return new ServiceUnavailableError(UNAVAILABLE)
    }
    logger.warn('Résumé import: the Claude call did not finish, the import counts', { ...details, deadlineReached })
    return new ServiceUnavailableError(INTERRUPTED)
  }
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
    logger.warn('Résumé import: the Claude API is unavailable', details)
    return new ServiceUnavailableError(UNAVAILABLE)
  }
  logger.error('Résumé import: the Claude API refused the request', details)
  return new ServiceUnavailableError(UNAVAILABLE)
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
const refund = async (taken: RateLimitTaken[]) => {
  try {
    await Promise.all(taken.map((counter) => refundRateLimit(counter.counterId)))
  } catch (error) {
    logger.error('Résumé import: could not give back a counted import', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

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

    const client = createClient(settings.apiKey)
    const request = extractionRequest(pdf, fileName)

    // Free (not billed), and stops a long PDF before the paid call; retried
    // once on what can succeed later (connection errors, 408/409/429/5xx)
    const { input_tokens: inputTokens } = await client.messages
      .countTokens(request, { timeout: resumeImportTimeouts.countMs, maxRetries: 1 })
      .catch((error: unknown) => {
        throw claudeFailure('count', error, settings.apiKey)
      })
    if (inputTokens > MAX_RESUME_INPUT_TOKENS) {
      throw new UnprocessableContentError('This PDF is too long for an import (more than ~10 pages)')
    }

    const message = await extract(client, request, settings.apiKey, () => {
      counted = true
    })
    counted = true

    const result = readExtraction(message)
    return { ...result, quota: quotaOf(settings, { user, site, attempts }) }
  } catch (error) {
    if (!counted) await refund(taken)
    throw error
  }
}

/**
 * The paid call, streamed and sent once (no retries), within
 * resumeImportTimeouts.extractMs. `onCounted` runs when it fails after the
 * model may have run: the import then counts
 */
const extract = async (
  client: Anthropic,
  request: ReturnType<typeof extractionRequest>,
  apiKey: string,
  onCounted: () => void
) => {
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), resumeImportTimeouts.extractMs)
  try {
    return await client.messages
      .stream(
        { ...request, max_tokens: RESUME_IMPORT_MAX_OUTPUT_TOKENS },
        { maxRetries: 0, timeout: resumeImportTimeouts.extractMs, signal: deadline.signal }
      )
      .finalMessage()
  } catch (error) {
    if (!refusedBeforeRunning(error)) onCounted()
    throw claudeFailure('extract', error, apiKey, deadline.signal.aborted)
  } finally {
    clearTimeout(timer)
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

  // Blocks by type: the answer starts with thinking blocks
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
  let output: unknown
  try {
    output = JSON.parse(text)
  } catch {
    // Structured outputs make this unlikely; the drafts are then empty, with a warning
    output = undefined
  }
  const extraction = normalizeExtraction(output)
  logCall(extraction.experiences.length)
  return extraction
}
