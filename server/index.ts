import mongoose from 'mongoose';
import { validateEnvironment } from './services/validation';
import { app } from './app';
import { logger } from './services/logger';

export { app };
export type { Portfolio } from './app';

validateEnvironment();

await mongoose.connect(Bun.env.MONGO_URL ?? '');

app.listen({
  hostname: "::",
  port: Bun.env.PORT || 3000,
  tls: Bun.env.TLS_PASSPHRASE ? {
    cert: Bun.file('./cert.pem'),
    key: Bun.file('./key.pem'),
    passphrase: Bun.env.TLS_PASSPHRASE
  } : undefined
})

logger.info(`Running at http://${app.server!.hostname}:${app.server!.port}`, {
  allowedDomains: Bun.env.ALLOWED_DOMAINS ?? ''
})
