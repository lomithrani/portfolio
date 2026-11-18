import { Elysia, StatusMap } from 'elysia'
import mongoose from 'mongoose'
import { ROBOTS_NOINDEX } from 'portfolio-common'
import { openapi } from '@elysiajs/openapi'
import { env } from './env'
import {
  account,
  experiences,
  resumeImport,
  googleAuth,
  domain,
  workflows,
  appointments,
  corsConf,
  jobs,
  jobImport,
  perfectJob,
  addresses,
  feedback
} from './plugins'
import { errors, MissingAuthCookieError, PayloadTooLargeError, UnsupportedMediaTypeError } from './errors'
import { instrumentation, httpRequestCounter, httpRequestDuration } from './instrumentation'
import { logger } from './services/logger'
import { resolveError } from './services/errorHandler'
import { sessionUserId } from './services/session'
import { locale } from './services/locale'

// Hard cap on request bodies, enforced by Bun itself (it answers 413, without
// CORS headers, before the app runs). Sized for the large routes: a 4 MB PDF
// posted to POST /experiences/import or POST /jobs/import is ~5.4 MB of
// base64 JSON.
const MAX_REQUEST_BODY_SIZE = 6 * 1024 * 1024

// Cap of every other route (a 413 with CORS headers). The largest legit
// payload there is an experience with a ~22KB data-URL icon and markdown
// text. Checked twice: on Content-Length before the body is read (the fast
// path), then on the bytes actually read, since a body can come without a
// usable Content-Length (chunked, as proxies and HTTP/2 clients may forward
// it, or with the header repeated)
const MAX_JSON_BODY_SIZE = 1024 * 1024
// The PDF imports (résumé, job description): POST only
const LARGE_BODY_PATHS = new Set(['/experiences/import', '/jobs/import'])

const isLargeBodyRoute = (request: Request) =>
  request.method === 'POST' && LARGE_BODY_PATHS.has(new URL(request.url).pathname)

const hasOversizedBody = (request: Request) => {
  const contentLength = Number(request.headers.get('content-length'))
  if (!(contentLength > MAX_JSON_BODY_SIZE)) return false
  // Only parsed for the rare request over the cap
  return !isLargeBodyRoute(request)
}

/** The body as text, read up to `maxBytes`: past that, reading stops with a 413 */
const readBodyText = async (body: ReadableStream<Uint8Array>, maxBytes: number) => {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new PayloadTooLargeError('Payload Too Large')
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/**
 * Parses JSON bodies in place of Elysia's parser, reading at most
 * MAX_JSON_BODY_SIZE bytes; other bodies are refused (415) or never read.
 * The PDF imports keep Elysia's parser, under Bun's cap. Invalid JSON is a
 * 400, as with Elysia's parser (it throws inside the parse step)
 */
const parseBoundedJson = async ({ request }: { request: Request }, contentType: string) => {
  if (!request.body || isLargeBodyRoute(request)) return undefined
  if (contentType.toLowerCase() !== 'application/json') return undefined
  return JSON.parse(await readBodyText(request.body, MAX_JSON_BODY_SIZE)) as unknown
}

// The PDF imports take a ~6 MB body and need a session: a request without
// a valid session JWT (what userLogged accepts) is refused before its body is
// read, parsed and copied into the request span. Any cookie named auth is not
// enough
const lacksValidSession = async (request: Request) => (await sessionUserId(request)) === undefined

// Bodies of requests that change data must be JSON (the only type the client
// sends). An HTML form on another site can only send urlencoded, multipart or
// text/plain bodies, which need no CORS preflight; refusing them before the
// body is parsed means a cross-site form never reaches a handler, whatever
// the cookie's SameSite (AUTH_COOKIE_SAMESITE=none sends it cross-site).
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const hasNonJsonBody = (request: Request) => {
  if (!STATE_CHANGING_METHODS.has(request.method)) return false
  const contentType = request.headers.get('content-type')
  // A body-less request (e.g. a DELETE) has no Content-Type
  if (contentType === null) return false
  return contentType.split(';')[0].trim().toLowerCase() !== 'application/json'
}

/** The status of a response as Elysia holds it: a number, or a status name ('Not Found') */
export const responseStatus = (status: number | string | undefined): number => {
  if (typeof status === 'number') return status
  if (status === undefined) return 200
  return (StatusMap as Record<string, number>)[status] ?? 0
}

// Request start times, keyed by request. Filled in onRequest, which (unlike
// derive) also runs for unmatched routes, so 404s get a real duration too.
const requestStarts = new WeakMap<Request, number>()

// OpenAPI docs (Scalar UI at /swagger, spec at /swagger/json): always on in
// development, opt-in in production with API_DOCS=true
const apiDocs = () =>
  openapi({
    enabled: env.apiDocsEnabled,
    path: '/swagger',
    documentation: {
      info: {
        title: 'Portfolio Documentation',
        version: '1.0.0'
      }
    }
  })

export const createApp = () =>
  new Elysia({ serve: { maxRequestBodySize: MAX_REQUEST_BODY_SIZE } })
    // Asks search engines not to list any answer of the API (GET /domain/:name
    // is a whole portfolio as public JSON). Sent on every answer, errors,
    // unmatched 404s and CORS preflights included: Elysia's default headers
    // start the context of every request. No robots.txt Disallow instead: a
    // crawler must fetch an answer to read this header. The web pages ask the
    // same of the portfolios (client/src/lib/robots.ts), with the same value
    .headers({ 'x-robots-tag': ROBOTS_NOINDEX })
    .use(instrumentation)
    // The request's language, for every text the API answers with (services/locale.ts)
    .use(locale)
    .onRequest(({ request }) => {
      requestStarts.set(request, performance.now())
    })
    .onAfterResponse(({ request, route, set }) => {
      const start = requestStarts.get(request)
      // Matched route pattern only (e.g. /experiences/:id) — raw pathnames are
      // unbounded (scanner bots) and each unique value is a metric series kept
      // in memory forever. The status tells a portfolio that was loaded from a
      // scan for /domain/wp-login.php (docs/grafana)
      const attrs = { method: request.method, route: route || 'unmatched', status: responseStatus(set.status) }
      httpRequestCounter.add(1, attrs)
      if (start !== undefined) httpRequestDuration.record(performance.now() - start, attrs)
    })
    .use(corsConf())
    // After CORS, so the 413, 415 and 401 still carry the CORS headers. Thrown
    // (not returned) so they go through onError: logged and counted like any
    // 4xx. All run before the body is read (the session check is async, in a
    // hook of its own: it verifies a JWT for the PDF imports only)
    .onRequest(({ request }) => {
      if (hasOversizedBody(request)) throw new PayloadTooLargeError('Payload Too Large')
      if (hasNonJsonBody(request)) throw new UnsupportedMediaTypeError('Unsupported Media Type')
    })
    .onRequest(async ({ request }) => {
      if (isLargeBodyRoute(request) && (await lacksValidSession(request))) {
        throw new MissingAuthCookieError('Unauthorized')
      }
    })
    .onParse({ as: 'global' }, parseBoundedJson)
    .use(apiDocs())
    .error(errors)
    .onError(({ code, error, set, request, route, path }) => {
      const { status, body, level, headers, logMessage } = resolveError(code, error)
      const attributes = {
        code: String(code),
        status,
        method: request.method,
        route: route || path
      }

      if (level === 'error') {
        // Log the real cause; the client only gets a generic message
        logger.error(error instanceof Error ? error.message : String(error), {
          ...attributes,
          errorName: error instanceof Error ? error.name : typeof error,
          stack: error instanceof Error ? error.stack : undefined
        })
      } else if (level === 'warn') {
        // In English whatever the request's language: the body's own English when it is a text
        const message = logMessage ?? (typeof body === 'string' ? body : 'Request validation failed')
        logger.warn(message, attributes)
      }

      set.status = status
      if (headers) Object.assign(set.headers, headers)
      return body
    })
    .get('/health', ({ set }) => {
      // 1 = connected. Railway's healthcheck and CI wait on this route.
      if (mongoose.connection.readyState === 1) return 'OK'
      set.status = 503
      return 'Service Unavailable'
    })
    .use(googleAuth)
    .use(account)
    .use(domain)
    .use(experiences)
    .use(resumeImport)
    .use(workflows)
    .use(perfectJob)
    .use(addresses)
    .use(feedback)
    .use(appointments)
    // Before jobs: its static /jobs/import routes, then the /jobs/:id ones
    .use(jobImport)
    .use(jobs)

// App instance used by index.ts and tests importing from root
export const app = createApp()

export type Portfolio = typeof app
