// Filing an issue in the project's GitHub repository (GITHUB_ISSUES_REPO)
// with the operator's GITHUB_ISSUES_TOKEN: what step suggestions
// (services/stepSuggestions.ts) and feedback (services/feedback.ts) share.
// What people write is untrusted and public once filed, where Markdown
// notifies people (@name), links issues (#12) and loads images: their text
// only goes in an issue's body inside fenced code blocks (fenced), and its
// title through issueTitleText. The token never reaches a log line or a
// response, and a redirect is never followed (it would carry the token to
// wherever it points). Logging is the callers': each names its own feature.

const GITHUB_API = 'https://api.github.com'

/** How long GitHub has to answer by default; callers pass a property of theirs so tests can shorten it */
export const GITHUB_TIMEOUT_MS = 10_000

/**
 * Text as a fenced code block: GitHub renders nothing inside one (no mention,
 * no link, no image, no HTML). The fence is longer than any run of backticks
 * in the text, so the text cannot close it
 */
export const fenced = (text: string) => {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(Math.max(3, longestRun + 1))
  return `${fence}text\n${text}\n${fence}`
}

/**
 * Text in an issue's title, where a code block is not possible: a mention, an
 * issue number or a link must not read as one there (`@ name`, `# 12`,
 * `GH- 12`, `https: //…`), and no backtick or tag is left
 */
export const issueTitleText = (text: string) =>
  text
    .replace(/[`<>]/g, "'")
    .replace(/([@#])(?=\S)/g, '$1 ')
    .replace(/\b(gh-)(?=\d)/gi, '$1 ')
    .replace(/:\/\//g, ': //')

export interface GithubIssue {
  title: string
  body: string
  labels: string[]
  /** The repository's issue type (e.g. "Bug"); GitHub answers 422 when the repository has no such type */
  type?: string
}

export interface GithubIssueOptions {
  token: string
  /** `owner/name` */
  repository: string
  /** Names the feature to GitHub, e.g. 'portfolio-feedback' */
  userAgent: string
  timeoutMs?: number
}

export type GithubIssueResult =
  /** Filed; `number` and `htmlUrl` as GitHub sent them, when it did */
  | { outcome: 'created'; number?: number; htmlUrl?: string }
  /** No answer in time, or the connection failed: GitHub may have filed it. `reason` is the error's name */
  | { outcome: 'noAnswer'; reason: string }
  /**
   * GitHub answered something else than the created issue (or a redirect).
   * `operator`: the operator's to fix (the token: expired, without access to
   * the repository's issues; or the repository: renamed, issues disabled)
   */
  | {
      outcome: 'refused'
      status: number
      operator: boolean
      githubMessage?: string
      /** The fields a 422 names (GitHub's `errors[].field`), when it names some */
      invalidFields?: string[]
    }

// Statuses that are the operator's to fix, not GitHub's (a redirect: a renamed or transferred repository)
const OPERATOR_STATUSES = [301, 302, 307, 308, 401, 403, 404, 410, 422]

/**
 * GitHub said no: the start of its message, for the operator's log (never the
 * token), and the fields a 422 names (e.g. `type`), names only
 */
const githubRefusalOf = async (response: Response, token: string) => {
  let githubMessage: string | undefined
  let invalidFields: string[] | undefined
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object') {
      if ('message' in body && typeof body.message === 'string') {
        githubMessage = body.message.replaceAll(token, '[token]').slice(0, 200)
      }
      if ('errors' in body && Array.isArray(body.errors)) {
        const fields = body.errors
          .map((error: unknown) => (error && typeof error === 'object' && 'field' in error ? error.field : undefined))
          .filter((field): field is string => typeof field === 'string' && /^[a-z_]{1,40}$/.test(field))
          .slice(0, 10)
        if (fields.length > 0) invalidFields = fields
      }
    }
  } catch {
    // Not JSON: the status is enough
  }
  return { ...(githubMessage ? { githubMessage } : {}), ...(invalidFields ? { invalidFields } : {}) }
}

/** Files an issue; never throws for what GitHub does (the result says), and never follows a redirect */
export async function createGithubIssue(issue: GithubIssue, options: GithubIssueOptions): Promise<GithubIssueResult> {
  const { token, repository } = options
  let response: Response
  try {
    response = await fetch(`${GITHUB_API}/repos/${repository}/issues`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': options.userAgent,
        'x-github-api-version': '2022-11-28'
      },
      body: JSON.stringify(issue),
      // Never followed: a redirect would carry the token to wherever it
      // points. GitHub sends one for a renamed or transferred repository
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? GITHUB_TIMEOUT_MS)
    })
  } catch (error) {
    return { outcome: 'noAnswer', reason: error instanceof Error ? error.name : 'unknown' }
  }

  if (response.status !== 201) {
    return {
      outcome: 'refused',
      status: response.status,
      operator: OPERATOR_STATUSES.includes(response.status),
      ...(await githubRefusalOf(response, token))
    }
  }

  let number: number | undefined
  let htmlUrl: string | undefined
  try {
    const created: unknown = await response.json()
    if (created && typeof created === 'object') {
      if ('number' in created && typeof created.number === 'number') number = created.number
      if ('html_url' in created && typeof created.html_url === 'string') htmlUrl = created.html_url
    }
  } catch {
    // Created all the same
  }
  return { outcome: 'created', ...(number !== undefined ? { number } : {}), ...(htmlUrl !== undefined ? { htmlUrl } : {}) }
}
