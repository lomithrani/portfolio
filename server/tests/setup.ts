// Preloaded before every test file (bunfig.toml [test] preload). Bun has
// already loaded server/.env, so this undoes what must not reach the tests.

// Never export test telemetry to a real collector (e.g. Grafana Cloud)
for (const name of Object.keys(process.env)) {
  if (name.startsWith('OTEL_')) delete process.env[name];
}

// TEST_MONGO_URL, when set, is the database the tests use instead of MONGO_URL
if (process.env.TEST_MONGO_URL) process.env.MONGO_URL = process.env.TEST_MONGO_URL;
