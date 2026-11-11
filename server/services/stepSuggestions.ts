import { parseStepSuggestion } from 'portfolio-common'
import type { StepSuggestionInput } from 'portfolio-common'
import { env } from '../env'
import type { ServerEnv } from '../env'
import { FieldValidationError, ForbiddenError, ResourceNotFoundError, ServiceUnavailableError, TooManyRequestsError } from '../errors'
import { Domain } from '../models/database'
import { logger } from './logger'
import { rateLimitKey, refundRateLimit, takeRateLimit } from './rateLimit'
import type { RateLimit } from './rateLimit'

// Step suggestions: a portfolio owner who misses a step in their hiring
// journey describes it in their step editor, and the API files it as a
// feature request in the project's GitHub repository (GITHUB_ISSUES_REPO),
// with the operator's GITHUB_ISSUES_TOKEN: owners need no GitHub account.
// The feature is off without the token. Everything an owner writes is
// untrusted and ends up on GitHub, where Markdown notifies people (@name),
// links issues (#12) and loads images: their text only ever goes inside
// fenced code blocks, and the issue names nobody (no name, no address, no
// portfolio). Issues are free but each one notifies the maintainers, so they
// are capped per owner and for the whole site.

/** Suggestions an owner can send per UTC day */
export const STEP_SUGGESTIONS_PER_OWNER: RateLimit = { limit: 3, windowMs: 24 * 60 * 60_000 }
/** Suggestions the whole site files per UTC day */
export const STEP_SUGGESTIONS_PER_DAY: RateLimit = { limit: 20, windowMs: 24 * 60 * 60_000 }

/** Counter key of an owner's suggestions of the day (an HMAC of the user id) */
export const stepSuggestionOwnerKey = (userId: string) => rateLimitKey('step-suggestion:owner', userId)

/** Counter key of the site-wide daily limit; a property so each test can count on a key of its own */
export const stepSuggestionCounters = { globalKey: 'step-suggestion:global' }

/** How long GitHub has to answer; a property so tests can shorten it */
export const stepSuggestionTimeouts = { githubMs: 10_000 }

const GITHUB_API = 'https://api.github.com'
const ISSUE_LABELS = ['enhancement']

const DISABLED = 'Step suggestions are not enabled on this server'
const UNAVAILABLE = 'Your suggestion could not be sent right now, try again later'

/** One-line state of the feature, for the startup log (never the token) */
export const describeStepSuggestions = (settings: Pick<ServerEnv, 'GITHUB_ISSUES_TOKEN' | 'GITHUB_ISSUES_REPO'>) =>
  settings.GITHUB_ISSUES_TOKEN
    ? `on (issues in ${settings.GITHUB_ISSUES_REPO}, ${STEP_SUGGESTIONS_PER_OWNER.limit} per owner and ${STEP_SUGGESTIONS_PER_DAY.limit} for the site per day)`
    : 'off (no GITHUB_ISSUES_TOKEN)'

export const stepSuggestionsEnabled = () => Boolean(env.GITHUB_ISSUES_TOKEN)

// ── The issue ───────────────────────────────────────────────

// C0 and C1 controls but tab and line feed, the Unicode line separators, and
// the characters that reorder or hide text (bidi controls, zero-width, BOM)
const UNSAFE_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g

const cleanText = (text: string) => text.replace(/\r\n?/g, '\n').replace(UNSAFE_CHARACTERS, '')

/**
 * Text as a fenced code block: GitHub renders nothing inside one (no mention,
 * no link, no image, no HTML). The fence is longer than any run of backticks
 * in the text, so the text cannot close it
 */
const fenced = (text: string) => {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(Math.max(3, longestRun + 1))
  return `${fence}text\n${text}\n${fence}`
}

/**
 * The name in the issue's title, where a code block is not possible: a
 * mention or an issue number must not read as one there (`@ name`, `# 12`),
 * and nothing is left to style or tag it
 */
const titleText = (name: string) => name.replace(/[`<>]/g, "'").replace(/([@#])(?=\S)/g, '$1 ')

export interface StepSuggestionIssue {
  title: string
  body: string
  labels: string[]
}

/** The GitHub issue of a suggestion (already through parseStepSuggestion) */
export function stepSuggestionIssue(suggestion: StepSuggestionInput): StepSuggestionIssue {
  const name = cleanText(suggestion.name).replace(/\s+/g, ' ').trim()
  const sections = [
    'A portfolio owner suggested this step from the hiring journey editor (“Suggest a step”). The text below is theirs, shown as plain text.',
    `### Step\n\n${fenced(name)}`,
    `### What a recruiter would do on it\n\n${fenced(cleanText(suggestion.description))}`
  ]
  if (suggestion.reason) sections.push(`### Why it would help\n\n${fenced(cleanText(suggestion.reason))}`)
  sections.push('Adding a step type: `docs/WORKFLOW_STEPS.md`.')
  return { title: `Step suggestion: ${titleText(name)}`, body: sections.join('\n\n'), labels: ISSUE_LABELS }
}

// ── Sending ─────────────────────────────────────────────────

/** GitHub said no: its status and the start of its message, for the operator's log (never the token) */
const githubRefusal = async (response: Response, token: string) => {
  let message: string | undefined
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
      message = body.message.replaceAll(token, '[token]').slice(0, 200)
    }
  } catch {
    // Not JSON: the status is enough
  }
  return { status: response.status, ...(message ? { githubMessage: message } : {}) }
}

/**
 * Files a suggestion as an issue. 404 while the feature is off, 403 for an
 * account without a portfolio, 422 naming the field that breaks a rule, 429
 * over a daily limit, 503 when GitHub did not take it (the suggestion is then
 * given back to both limits, unless GitHub may have filed it: no answer in
 * time)
 */
export async function suggestStep(userId: string, input: { name?: unknown; description?: unknown; reason?: unknown }) {
  const { GITHUB_ISSUES_TOKEN: token, GITHUB_ISSUES_REPO: repository } = env
  if (!token) throw new ResourceNotFoundError(DISABLED)

  // The step editor is the owner's: an account without a portfolio has none
  if (!(await Domain.exists({ admin: userId }))) {
    throw new ForbiddenError('Only the owner of a portfolio can suggest a step')
  }

  const parsed = parseStepSuggestion(input)
  if (!parsed.ok) throw new FieldValidationError(parsed.field, parsed.message)

  const own = await takeRateLimit(stepSuggestionOwnerKey(userId), STEP_SUGGESTIONS_PER_OWNER)
  if (own.retryAfterSeconds !== null) {
    throw new TooManyRequestsError(
      `You can send ${STEP_SUGGESTIONS_PER_OWNER.limit} suggestions a day: try again tomorrow`,
      own.retryAfterSeconds
    )
  }
  const site = await takeRateLimit(stepSuggestionCounters.globalKey, STEP_SUGGESTIONS_PER_DAY)
  if (site.retryAfterSeconds !== null) {
    await refundRateLimit(own.counterId)
    throw new TooManyRequestsError('Too many suggestions were sent today: try again tomorrow', site.retryAfterSeconds)
  }
  const giveBack = () => Promise.all([refundRateLimit(own.counterId), refundRateLimit(site.counterId)])

  let response: Response
  try {
    response = await fetch(`${GITHUB_API}/repos/${repository}/issues`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'portfolio-step-suggestions',
        'x-github-api-version': '2022-11-28'
      },
      body: JSON.stringify(stepSuggestionIssue(parsed.suggestion)),
      // A redirect would carry the token to wherever GitHub points
      redirect: 'error',
      signal: AbortSignal.timeout(stepSuggestionTimeouts.githubMs)
    })
  } catch (error) {
    // No answer: GitHub may have filed the issue, so it still counts
    logger.warn('Step suggestion: no answer from GitHub', {
      userId,
      reason: error instanceof Error ? error.name : 'unknown'
    })
    throw new ServiceUnavailableError(UNAVAILABLE)
  }

  if (response.status !== 201) {
    await giveBack()
    // 401/403/404 are the operator's to fix (token expired, without access to the repository's issues)
    const operator = [401, 403, 404, 410, 422].includes(response.status)
    logger[operator ? 'error' : 'warn']('Step suggestion: GitHub did not create the issue', {
      userId,
      repository,
      ...(await githubRefusal(response, token))
    })
    throw new ServiceUnavailableError(UNAVAILABLE)
  }

  let issueNumber: number | undefined
  try {
    const created: unknown = await response.json()
    if (created && typeof created === 'object' && 'number' in created && typeof created.number === 'number') {
      issueNumber = created.number
    }
  } catch {
    // Created all the same
  }
  // Who suggested what stays here: the issue itself names nobody
  logger.info('Step suggestion filed', { userId, repository, ...(issueNumber ? { issueNumber } : {}) })
  return { created: true as const }
}
