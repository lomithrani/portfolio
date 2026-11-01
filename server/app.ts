import { Elysia } from 'elysia'
import mongoose from 'mongoose'
import { openapi } from '@elysiajs/openapi'
import { env } from './env'
import { experiences, googleAuth, domain, workflows, corsConf } from './plugins'
import { errors } from './errors'
import { instrumentation, httpRequestCounter, httpRequestDuration } from './instrumentation'
import { logger } from './services/logger'
import { resolveError } from './services/errorHandler'

// Hard cap on request bodies (Bun answers 413 above it). The largest legit
// payload is an experience with a ~22KB data-URL icon and markdown text.
const MAX_REQUEST_BODY_SIZE = 1024 * 1024

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
    .use(apiDocs())
    .error(errors)
    .onError(({ code, error, set, request, route, path }) => {
      const { status, body, level } = resolveError(code, error)
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
      } else {
        const message = typeof body === 'string' ? body : 'Request validation failed'
        logger[level](message, attributes)
      }

      set.status = status
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
    .use(workflows)

// App instance used by index.ts and tests importing from root
export const app = createApp()

export type Portfolio = typeof app
