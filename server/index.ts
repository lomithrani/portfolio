import mongoose from 'mongoose';
import { Elysia } from 'elysia'
import { experiences, googleAuth, domain } from 'plugins';
import { validateEnvironment } from './services/validation';
import swagger from '@elysiajs/swagger';
import { errors } from 'errors';

validateEnvironment();

await mongoose.connect(Bun.env.MONGO_URL ?? '');

const app = new Elysia()
  .use(swagger())
  .error(errors)
  .onError(({ code, error }) => {
    console.error(error)
    return error.message;
  })
  .use(domain)
  .use(googleAuth)
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