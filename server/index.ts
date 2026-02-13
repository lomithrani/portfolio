import mongoose from 'mongoose';
import { Elysia } from 'elysia'
import { experiences, googleAuth, domain, workflows } from './plugins';
import { validateEnvironment } from './services/validation';
import { errors } from './errors';
import { swagger } from '@elysiajs/swagger';

validateEnvironment();

await mongoose.connect(Bun.env.MONGO_URL ?? '');

export const app = new Elysia()
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
  .listen({
    hostname: Bun.env.HOSTNAME || "::",
    port: Bun.env.PORT || 3000,
    tls: Bun.env.TLS_PASSPHRASE ? {
      cert: Bun.file('./cert.pem'),
      key: Bun.file('./key.pem'),
      passphrase: Bun.env.TLS_PASSPHRASE
    } : undefined
  })

console.log(`Running at http://${app.server!.hostname}:${app.server!.port} CORS allowed: ${JSON.stringify(Bun.env.ALLOWED_DOMAINS)}`)

export type Portfolio = typeof app;