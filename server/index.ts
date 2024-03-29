import mongoose from 'mongoose';
import { Elysia } from 'elysia'
import { experiences, googleAuth, domain } from './plugins';
import { validateEnvironment } from './services/validation';
import swagger from '@elysiajs/swagger';
import { errors } from './errors';

validateEnvironment();

await mongoose.connect(Bun.env.MONGO_URL ?? '');

export const app = new Elysia()
  .use(swagger())
  .error(errors)
  .onError(({ code, error }) => {
    console.error(error)
    return error.message;
  })
  .get('/health', () => 'OK')
  .use(domain)
  .use(googleAuth) //everything after this needs to be logged in
  .use(experiences)
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