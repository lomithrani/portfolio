# portfolio-client

SvelteKit 3 frontend of the portfolio (Svelte 5 runes, Skeleton 5, Tailwind CSS 4), served in
production by [`@sveltejs/adapter-bun`](https://svelte.dev/docs/kit/adapter-bun). It talks to
the Elysia API (`../server`) through a type-safe Eden Treaty client (`src/services/portfolio.ts`).

Always use Bun (`bun`, `bunx`), never npm/npx. Install dependencies once from the repository
root with `bun install`.

## Configuration

Environment variables are declared in `src/env.ts` and read when the server starts (no rebuild
needed to change them). Copy `.env.example` to `.env` for local development.

| Variable                      | Default                             | Purpose                                                                                   |
| ----------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `PUBLIC_PORTFOLIO_API_URL`    | `http://localhost:3000`             | Base URL of the API, used by SSR and by the browser                                       |
| `PUBLIC_GOOGLE_CLIENT_ID`     | `DEFAULT_GOOGLE_CLIENT_ID` (common) | Google Sign-In client ID (must match the API audience)                                    |
| `PORT` / `HOST` / `ORIGIN`    | `3000` / `0.0.0.0` / request origin | adapter-bun runtime options                                                               |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset (telemetry off)               | Enables OpenTelemetry export (`OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME` optional) |

## Commands

```bash
bun run dev          # dev server on http://localhost:5173 (needs the API, see ../server)
bun run build        # production build into build/
bun --bun build/index.js   # run the production build (root: bun run start:client, port 4000)
bun run preview      # vite preview of the build
bun run check        # svelte-check (types)
bun run lint         # prettier --check + eslint
bun run format       # prettier --write
bun run test:unit    # vitest (single run)
bun run test:e2e     # Playwright: builds, starts the adapter server on :4173 and runs tests/
```

The e2e suite expects the API at `PUBLIC_PORTFOLIO_API_URL` with the CI seed
(`cd ../server && bun run tests/seedDb.ts`: the `louis.gentil` domain with no experiences).

`GET /healthz` answers `200 ok` without calling the API (web service health check).
