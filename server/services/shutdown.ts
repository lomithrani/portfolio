import { logger } from './logger';

// Graceful shutdown (Railway sends SIGTERM on redeploy, Ctrl+C sends SIGINT):
// run the steps in order (stop timers, stop accepting requests and let
// in-flight ones finish, close MongoDB, flush telemetry), then exit. A failed
// step is logged and makes the exit code 1; a stuck one hits the timeout.

export const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface ShutdownStep {
  name: string;
  run: () => unknown;
}

export interface ShutdownOptions {
  steps: ShutdownStep[];
  timeoutMs?: number;
  exit?: (code: number) => void;
}

/** Returns the shutdown handler; only its first call does anything */
export const createShutdown = ({
  steps,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
  exit = (code) => process.exit(code)
}: ShutdownOptions) => {
  let shuttingDown = false;

  return async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, exiting');
      exit(1);
    }, timeoutMs);
    forceExit.unref();

    let exitCode = 0;
    for (const { name, run } of steps) {
      try {
        await run();
      } catch (error) {
        exitCode = 1;
        logger.error(`Shutdown: ${name} failed`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    clearTimeout(forceExit);
    exit(exitCode);
  };
};
