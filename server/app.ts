import { Elysia } from 'elysia'
import { experiences, googleAuth, domain, workflows } from './plugins';
import { errors } from './errors';
import { swagger } from '@elysiajs/swagger';
import { instrumentation, httpRequestCounter, httpRequestDuration } from './instrumentation';
import { logger } from './services/logger';

export const createApp = () =>
  new Elysia()
    .use(instrumentation)
    .derive(() => ({ requestStart: performance.now() }))
    .onAfterResponse(({ request, requestStart }) => {
      const method = request.method
      const route = new URL(request.url).pathname
      const duration = performance.now() - requestStart
      const attrs = { method, route }
      httpRequestCounter.add(1, attrs)
      httpRequestDuration.record(duration, attrs)
    })
    .use(swagger({
      path: '/swagger',
      documentation: {
        info: {
          title: 'Portfolio Documentation',
          version: '1.0.0'
        }
      }
    }))
    .error(errors)
    .onError(({ code, error }) => {
      logger.error('message' in error ? error.message : String(error), { code })

      return 'message' in error ? error.message : String(error);
    })
    .get('/health', () => 'OK')
    .use(googleAuth)
    .use(domain)
    .use(experiences)
    .use(workflows)

export type Portfolio = typeof app;

// App instance used by index.ts and tests importing from root
export const app = createApp();
