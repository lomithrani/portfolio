import mongoose from 'mongoose';
import { validateEnvironment } from './services/validation';
import { app } from './app';

export { app };
export type { Portfolio } from './app';

validateEnvironment();

await mongoose.connect(Bun.env.MONGO_URL ?? '');

app.listen({
  hostname: Bun.env.HOSTNAME || "::",
  port: Bun.env.PORT || 3000,
  tls: Bun.env.TLS_PASSPHRASE ? {
    cert: Bun.file('./cert.pem'),
    key: Bun.file('./key.pem'),
    passphrase: Bun.env.TLS_PASSPHRASE
  } : undefined
})

console.log(`Running at http://${app.server!.hostname}:${app.server!.port} CORS allowed: ${JSON.stringify(Bun.env.ALLOWED_DOMAINS)}`)
