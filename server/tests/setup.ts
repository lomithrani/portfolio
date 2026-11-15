// Preloaded before every test file (bunfig.toml [test] preload). Bun has
// already loaded server/.env, so this undoes what must not reach the tests.

// Never export test telemetry to a real collector (e.g. Grafana Cloud)
for (const name of Object.keys(process.env)) {
  if (name.startsWith('OTEL_')) delete process.env[name];
}

// Never call the real Claude API (billed to that key) from a test: résumé
// import tests set a fake key and answer for api.anthropic.com themselves
delete process.env.ANTHROPIC_API_KEY;

// Never file a real GitHub issue from a test: the step suggestion tests set
// a fake token and answer for api.github.com themselves
delete process.env.GITHUB_ISSUES_TOKEN;
delete process.env.GITHUB_ISSUES_REPO;

// TEST_MONGO_URL, when set, is the database the tests use instead of MONGO_URL
if (process.env.TEST_MONGO_URL) process.env.MONGO_URL = process.env.TEST_MONGO_URL;
