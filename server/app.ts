import { Elysia } from 'elysia'
import { experiences, googleAuth, domain, workflows } from './plugins';
import { errors } from './errors';
import { swagger } from '@elysiajs/swagger';

export const createApp = () =>
  new Elysia()
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
      console.error(error)

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
