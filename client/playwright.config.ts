import { defineConfig } from '@playwright/test';

const port = 4173;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
	testDir: 'tests',
	testMatch: /(.+\.)?(test|spec)\.[jt]s/,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	use: { baseURL },
	webServer: {
		// Exercise the production adapter-bun server (what Railway runs), not `vite preview`.
		// Needs the API at PUBLIC_PORTFOLIO_API_URL with the CI seed (server/tests/seedDb.ts).
		command: 'bun run build && bun --bun build/index.js',
		url: `${baseURL}/healthz`,
		env: {
			PORT: String(port),
			PUBLIC_PORTFOLIO_API_URL: process.env.PUBLIC_PORTFOLIO_API_URL ?? 'http://localhost:3000'
		},
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
