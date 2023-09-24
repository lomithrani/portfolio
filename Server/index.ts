import mongoose from 'mongoose';
import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors';
import { experiences, googleAuth } from './plugins';
import { validateEnvironment } from './services/validation';
import type { Serve, TLSServeOptions } from 'bun'


validateEnvironment();

await mongoose.connect(Bun.env.MONGO_URL ?? '');

const app = new Elysia()
  .use(googleAuth)
  .use(experiences)
  .use(cors({
    credentials: true,
    origin: (request: Request): boolean => {
      const origin = request.headers.get('origin');
      if (!origin) {
        return false;
      }
      const allowedOrigins = JSON.parse(Bun.env.ALLOWED_DOMAINS || '[]') as string[];
      return allowedOrigins.includes(origin);
    },
  })).listen({
    hostname: "::",
    port: Bun.env.PORT || 3000,
    tls: Bun.env.TLS_PASSPHRASE ? {
      cert: Bun.file('./cert.pem'),
      key: Bun.file('./key.pem'),
      passphrase: Bun.env.TLS_PASSPHRASE
    } : undefined
  });

console.log(`Running at http://${app.server!.hostname}:${app.server!.port} CORS allowed: ${JSON.stringify(Bun.env.ALLOWED_DOMAINS)}`)

export type Portfolio = typeof app;
