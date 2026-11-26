import Anthropic from '@anthropic-ai/sdk'
import { PayloadTooLargeError, ServiceUnavailableError, UnprocessableContentError } from '../errors'
import { logger } from './logger'
import { m } from './claudePdfExtraction.messages'

// The machinery the PDF imports share (résumé: services/resumeImport.ts, job
// description: services/jobImport.ts): reading the uploaded PDF, the Claude
// client, the free token count, the paid call and what their failures
// become. Each import keeps its own prompt, schema, quotas and messages.
//
// Neither the API key nor the PDF ever reaches a log line, a response or a
// span: the SDK client below logs at warn and above only (its debug lines
// carry request bodies), and traces in metadata_only mode whatever the
// ANTHROPIC_OPEN_TELEMETRY_* variables say.

/**
 * Model of the PDF imports (résumé, job description): Claude Sonnet 5.5, for
 * drafts people keep with few corrections
 */
export const PDF_IMPORT_MODEL = 'claude-sonnet-5-5'
/**
 * Model of the short classifications that share this client (feedback,
 * services/feedback.ts; the skill catalogue, services/skillClassifier.ts):
 * many small calls with a tight deadline
 */
export const CLASSIFIER_MODEL = 'claude-haiku-5-5'

export type ClaudeModel = typeof PDF_IMPORT_MODEL | typeof CLASSIFIER_MODEL
/** Largest PDF accepted, decoded */
export const MAX_PDF_BYTES = 4 * 1024 * 1024
/**
 * Longest prompt imported (PDF and instructions), counted for free before the
 * import: about 10 pages, each page costing its text and its image
 */
export const MAX_PDF_INPUT_TOKENS = 60_000

interface RateCard {
  input: number
  output: number
}

// Prices in USD per million tokens. Claude Haiku 5.5 has one rate card for
// prompts up to 100K tokens and another above; Claude Sonnet 5.5 one for its
// whole context (the imports stay under MAX_PDF_INPUT_TOKENS anyway)
const PRICING: Record<ClaudeModel, { standard: RateCard; longPrompt?: { aboveTokens: number; card: RateCard } }> = {
  'claude-sonnet-5-5': { standard: { input: 2, output: 10 } },
  'claude-haiku-5-5': {
    standard: { input: 0.1, output: 0.5 },
    longPrompt: { aboveTokens: 100_000, card: { input: 0.5, output: 2.5 } }
  }
}

/**
 * How an import names itself in its log lines, and the 503s its callers get
 * (read when the error is made: they are in the language of the request)
 */
export interface PdfImportLabels {
  /** Prefix of its log lines, e.g. 'Résumé import' */
  name: string
  /** Claude cannot be reached, or refuses the request: nothing counts */
  unavailable: () => string
  /** The paid call was cut off after it was sent: the import counts */
  interrupted: () => string
}

/** e.g. "2026-11-20 00:00 UTC" (windows end at midnight UTC), in the language in use */
export const utcText = (date: Date) => m.utcDate(date.toISOString())

// ── The file ────────────────────────────────────────────────

// A data URL's header, e.g. what FileReader.readAsDataURL() puts before the base64
const DATA_URL_HEADER = /^data:[^,]{0,200};base64,/i
// Standard alphabet, padded (what btoa(), Buffer and readAsDataURL() produce)
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * The PDF of a request, as base64 without a data URL header. Throws 422 for
 * invalid base64 or a file that is not a PDF, 413 (with `tooLarge`) above
 * MAX_PDF_BYTES. Only its first bytes are decoded: the base64 is what Claude
 * receives.
 */
export function readPdfBase64(file: string, tooLarge: () => string): string {
  const header = DATA_URL_HEADER.exec(file.slice(0, 256))
  const base64 = header ? file.slice(header[0].length) : file
  if (base64.length % 4 !== 0 || !BASE64.test(base64)) {
    throw new UnprocessableContentError(() => m.notBase64)
  }
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  if ((base64.length / 4) * 3 - padding > MAX_PDF_BYTES) {
    throw new PayloadTooLargeError(tooLarge)
  }
  if (Buffer.from(base64.slice(0, 8), 'base64').toString('latin1').slice(0, 5) !== '%PDF-') {
    throw new UnprocessableContentError(() => m.onlyPdf)
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
export const createClaudeClient = (apiKey: string) =>
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

/**
 * The request of an import, without max_tokens: the same content is counted,
 * then sent. `title` (the file name) is part of the untrusted document, like
 * its content: the caller cleans it
 */
export const pdfExtractionRequest = (options: {
  system: string
  instruction: string
  schema: Record<string, unknown>
  pdf: string
  title: string | undefined
}) => ({
  model: PDF_IMPORT_MODEL,
  system: options.system,
  messages: [
    {
      role: 'user' as const,
      // Document first: Claude reads PDFs best placed before the request
      content: [
        {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: options.pdf },
          ...(options.title && { title: options.title })
        },
        { type: 'text' as const, text: options.instruction }
      ]
    }
  ],
  // Thinking stays adaptive (the default of this model), at low effort (the
  // starting point for extraction; Sonnet's default is high). No
  // temperature/top_p/top_k and no prefill: Claude Sonnet 5.5 refuses them
  output_config: {
    effort: 'low' as const,
    format: { type: 'json_schema' as const, schema: options.schema }
  }
})

export type PdfExtractionRequest = ReturnType<typeof pdfExtractionRequest>

/**
 * Estimated cost of a response of `model`, in USD (6 decimals). The calls use
 * no prompt caching: cache tokens only count toward the size of the prompt
 * that picks the rate card
 */
export const estimateCostUsd = (
  model: ClaudeModel,
  usage: Pick<Anthropic.Usage, 'input_tokens' | 'output_tokens' | 'cache_creation_input_tokens' | 'cache_read_input_tokens'>
) => {
  const prompt = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
  const { standard, longPrompt } = PRICING[model]
  const card = longPrompt && prompt > longPrompt.aboveTokens ? longPrompt.card : standard
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
const claudeFailure = (
  labels: PdfImportLabels,
  step: 'count' | 'extract',
  error: unknown,
  apiKey: string,
  deadlineReached = false
): unknown => {
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
      logger.warn(`${labels.name}: the Claude API is unavailable`, details)
      return new ServiceUnavailableError(labels.unavailable)
    }
    logger.warn(`${labels.name}: the Claude call did not finish, the import counts`, { ...details, deadlineReached })
    return new ServiceUnavailableError(labels.interrupted)
  }
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
    logger.warn(`${labels.name}: the Claude API is unavailable`, details)
    return new ServiceUnavailableError(labels.unavailable)
  }
  logger.error(`${labels.name}: the Claude API refused the request`, details)
  return new ServiceUnavailableError(labels.unavailable)
}

/**
 * Input tokens of the request. Free (not billed), and stops a long PDF before
 * the paid call; retried once on what can succeed later (connection errors,
 * 408/409/429/5xx). One deadline for the step (`deadlineMs`): the SDK would
 * otherwise wait as long as a 429's Retry-After asks before its retry
 */
export async function countInputTokens(
  client: Anthropic,
  request: PdfExtractionRequest,
  { labels, apiKey, deadlineMs }: { labels: PdfImportLabels; apiKey: string; deadlineMs: number }
): Promise<number> {
  const countDeadline = AbortSignal.timeout(deadlineMs)
  const { input_tokens: inputTokens } = await client.messages
    .countTokens(request, {
      timeout: Math.ceil(deadlineMs / 2),
      maxRetries: 1,
      signal: countDeadline
    })
    .catch((error: unknown) => {
      throw claudeFailure(labels, 'count', error, apiKey)
    })
  return inputTokens
}

/**
 * The paid call, streamed and sent once (no retries), within `deadlineMs`:
 * streamed, so no response-wide timeout cuts a long answer short. `onCounted`
 * runs when it fails after the model may have run: the import then counts
 */
export async function streamPaidCall(
  client: Anthropic,
  request: PdfExtractionRequest,
  {
    labels,
    apiKey,
    maxTokens,
    deadlineMs,
    onCounted
  }: { labels: PdfImportLabels; apiKey: string; maxTokens: number; deadlineMs: number; onCounted: () => void }
) {
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), deadlineMs)
  try {
    return await client.messages
      .stream({ ...request, max_tokens: maxTokens }, { maxRetries: 0, timeout: deadlineMs, signal: deadline.signal })
      .finalMessage()
  } catch (error) {
    if (!refusedBeforeRunning(error)) onCounted()
    throw claudeFailure(labels, 'extract', error, apiKey, deadline.signal.aborted)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The JSON of Claude's answer; undefined when its text is not JSON
 * (structured outputs make it unlikely: the import then finds nothing)
 */
export const outputJson = (message: Anthropic.Message): unknown => {
  // Blocks by type: the answer starts with thinking blocks
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Gives back what an import counted; a failure is logged, not thrown (the request's own error matters more) */
export const giveBack = async (labels: PdfImportLabels, refunds: (() => Promise<unknown>)[]) => {
  try {
    await Promise.all(refunds.map((refund) => refund()))
  } catch (error) {
    logger.error(`${labels.name}: could not give back a counted import`, {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
