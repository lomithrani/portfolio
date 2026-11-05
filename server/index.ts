// Must stay the first import: validates the environment before any other
// module reads its configuration
import { env } from './env';
import mongoose from 'mongoose';
import { app } from './app';
import { describeTelemetry, shutdownTelemetry } from './instrumentation';
import { logger } from './services/logger';
import { formatListenUrl, listenWithFallback } from './services/listen';
import { startMemoryDiagnostics } from './services/memoryDiagnostics';
import { createShutdown } from './services/shutdown';
import { describeResumeImport } from './services/resumeImport';

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
  allowedDomains: env.ALLOWED_DOMAINS.join(', '),
  telemetry: describeTelemetry(env),
  resumeImport: describeResumeImport(env)
});

// 'memory' log line at startup, then every MEMORY_LOG_INTERVAL_MS
const stopMemoryDiagnostics = startMemoryDiagnostics(env.MEMORY_LOG_INTERVAL_MS);

// See services/shutdown.ts. A second signal of the same kind exits immediately.
const shutdown = createShutdown({
  steps: [
    { name: 'memory diagnostics', run: stopMemoryDiagnostics },
    { name: 'HTTP server', run: () => app.stop() },
    { name: 'MongoDB', run: () => mongoose.disconnect() },
    // A hung OTLP endpoint must not eat the whole shutdown window
    { name: 'telemetry', run: shutdownTelemetry, timeoutMs: 3_000 }
  ]
});

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
