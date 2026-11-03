import { Elysia } from 'elysia'
import mongoose from 'mongoose'
import { openapi } from '@elysiajs/openapi'
import { env } from './env'
import { experiences, resumeImport, googleAuth, domain, workflows, appointments, corsConf } from './plugins'
import { errors, PayloadTooLargeError, UnsupportedMediaTypeError } from './errors'
import { instrumentation, httpRequestCounter, httpRequestDuration } from './instrumentation'
import { logger } from './services/logger'
import { resolveError } from './services/errorHandler'

// Hard cap on request bodies, enforced by Bun itself (it answers 413, without
// CORS headers, before the app runs). Sized for the one large route: a 4 MB
// PDF posted to POST /experiences/import is ~5.4 MB of base64 JSON.
const MAX_REQUEST_BODY_SIZE = 6 * 1024 * 1024

// Cap of every other route, checked on Content-Length before the body is
// parsed (a 413 with CORS headers). The largest legit payload there is an
// experience with a ~22KB data-URL icon and markdown text. A body sent
// without Content-Length (chunked) is only bounded by the cap above.
const MAX_JSON_BODY_SIZE = 1024 * 1024
const LARGE_BODY_ROUTE = { method: 'POST', path: '/experiences/import' }

const hasOversizedBody = (request: Request) => {
  const contentLength = Number(request.headers.get('content-length'))
  if (!(contentLength > MAX_JSON_BODY_SIZE)) return false
  // Only parsed for the rare request over the cap
  return !(request.method === LARGE_BODY_ROUTE.method && new URL(request.url).pathname === LARGE_BODY_ROUTE.path)
}

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
    .use(instrumentation)
    .onRequest(({ request }) => {
      requestStarts.set(request, performance.now())
    })
    .onAfterResponse(({ request, route }) => {
      const start = requestStarts.get(request)
      // Matched route pattern only (e.g. /experiences/:id) — raw pathnames are
      // unbounded (scanner bots) and each unique value is a metric series kept
      // in memory forever
      const attrs = { method: request.method, route: route || 'unmatched' }
      httpRequestCounter.add(1, attrs)
      if (start !== undefined) httpRequestDuration.record(performance.now() - start, attrs)
    })
    .use(corsConf())
    // After CORS, so the 413 and 415 still carry the CORS headers. Thrown (not
    // returned) so they go through onError: logged and counted like any 4xx.
    // Both run before the body is read
    .onRequest(({ request }) => {
      if (hasOversizedBody(request)) throw new PayloadTooLargeError('Payload Too Large')
      if (hasNonJsonBody(request)) throw new UnsupportedMediaTypeError('Unsupported Media Type')
    })
    .use(apiDocs())
    .error(errors)
    .onError(({ code, error, set, request, route, path }) => {
      const { status, body, level, headers } = resolveError(code, error)
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
        const message = typeof body === 'string' ? body : 'Request validation failed'
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
    .use(domain)
    .use(experiences)
    .use(resumeImport)
    .use(workflows)
    .use(appointments)

// App instance used by index.ts and tests importing from root
export const app = createApp()

export type Portfolio = typeof app
