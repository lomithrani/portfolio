// Must stay the first import: validates the environment before any other
// module reads its configuration
import { env } from './env';
import mongoose from 'mongoose';
import { app } from './app';
import { shutdownTelemetry } from './instrumentation';
import { logger } from './services/logger';
import { formatListenUrl, listenWithFallback } from './services/listen';
import { runMigrations } from './services/migrations';

export { app };
export type { Portfolio } from './app';

// Safety net: a promise nobody awaited must show up in the logs (and in
// Grafana when telemetry is on), not only as a stray stderr line
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
});

mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
mongoose.connection.on('error', (error: Error) =>
  logger.error('MongoDB connection error', { error: error.message })
);

await mongoose.connect(env.MONGO_URL);
await runMigrations();

const host = listenWithFallback(app, {
  host: env.HOST,
  hostExplicit: env.hostExplicit,
  port: env.PORT,
  tls: env.TLS_PASSPHRASE ? {
    cert: Bun.file('./cert.pem'),
    key: Bun.file('./key.pem'),
    passphrase: env.TLS_PASSPHRASE
  } : undefined,
  onFallback: () => logger.warn(`IPv6 is unavailable on this host, listening on 0.0.0.0 instead of '${env.HOST}' (set HOST to choose)`)
});

logger.info(`Running at ${formatListenUrl(host, app.server!.port ?? env.PORT, !!env.TLS_PASSPHRASE)}`, {
  allowedDomains: env.ALLOWED_DOMAINS.join(', ')
});

// Graceful shutdown (Railway sends SIGTERM on redeploy, Ctrl+C sends SIGINT):
// stop accepting requests, let in-flight ones finish, close MongoDB, flush
// telemetry, then exit. A second signal of the same kind exits immediately.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

const shutdown = async (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  let exitCode = 0;
  const step = async (name: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      exitCode = 1;
      logger.error(`Shutdown: ${name} failed`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  await step('HTTP server', () => app.stop());
  await step('MongoDB', () => mongoose.disconnect());
  await step('telemetry', shutdownTelemetry);

  process.exit(exitCode);
};

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
