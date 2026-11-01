# Portfolio

Personal portfolio: a SvelteKit web app backed by an Elysia API and MongoDB, in one Bun workspace,
deployed on [Railway](https://railway.com).

```
client/   SvelteKit web app (portfolio-client)
server/   Elysia API (portfolio-api)
common/   Shared code used by both (portfolio-common): ExperienceType, domain-name rules, ...
docs/     Deployment runbook
```

## Stack

| Area             | Technology                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime, tooling | [Bun](https://bun.com) 1.4.4 (runtime, package manager with workspaces, test runner), TypeScript 6.0                                 |
| Web app          | [SvelteKit](https://svelte.dev/docs/kit) 3.1 with `@sveltejs/adapter-bun`, Svelte 5.57 (runes), Vite 8, Skeleton 5, Tailwind CSS 4.3 |
| API              | [Elysia](https://elysiajs.com) 1.4 (CORS, JWT, OpenAPI, OpenTelemetry plugins), Mongoose 9.11, `jose` for Google ID tokens           |
| Type-safe calls  | [Eden Treaty](https://elysiajs.com/eden/overview): the web app imports the API's `Portfolio` type, so API changes break the build    |
| Database         | [MongoDB](https://www.mongodb.com) 8 (the driver supports MongoDB 4.4 to 9.0)                                                        |
| Auth             | Google Sign-In; the API verifies the ID token and sets a 7-day JWT in an `httpOnly` cookie                                           |
| Observability    | OpenTelemetry (traces, metrics, logs) over OTLP, off unless an endpoint is configured                                                |
| Tests            | `bun test` (API), Vitest 5 (web unit), Playwright 1.64 (end to end)                                                                  |
| Quality          | ESLint 10 (flat config), Prettier 3, svelte-check, `tsc`                                                                             |
| Hosting, CI      | Railway (Railpack builder, two services), GitHub Actions                                                                             |

## Prerequisites

- **Bun 1.4.4**, the version pinned in `package.json` (`packageManager`). Railway and CI use the
  same version.

  ```bash
  # macOS, Linux
  curl -fsSL https://bun.com/install | bash -s "bun-v1.4.4"
  ```

  ```powershell
  # Windows (PowerShell)
  iex "& {$(irm https://bun.com/install.ps1)} -Version 1.4.4"
  ```

- **Docker** (Docker Desktop on Windows and macOS) with Compose, for the local MongoDB. Any MongoDB
  4.4+ works too: point `MONGO_URL` at it and skip the `db:*` scripts.

Use Bun for everything (`bun`, `bunx`), not npm or npx.

## Quickstart

```bash
bun install
cp server/.env.example server/.env
cp client/.env.example client/.env
bun run db:up      # MongoDB 8 in Docker on 127.0.0.1:27017, waits until healthy
bun run db:seed    # owner user + the 'louis.gentil' domain (safe to re-run)
bun run dev        # API on http://localhost:3000 and web app on http://localhost:5173
```

Open http://localhost:5173: it redirects to `/louis.gentil/experiences`. Stop with `Ctrl+C`, and
`bun run db:down` stops MongoDB (the data stays in a Docker volume).

The `.env.example` files document every variable (required ones are set to working local values,
optional ones are commented out). If port 27017 is taken, start MongoDB on another port with
`MONGO_PORT=27018 bun run db:up` and use `mongodb://127.0.0.1:27018/portfolio` as `MONGO_URL`.

## Scripts

Run from the repository root.

| Script                 | What it does                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `bun run dev`          | API (watch mode) and web dev server in parallel, with prefixed output                        |
| `bun run dev:server`   | API only (`server/`, watch mode with the Bun inspector)                                      |
| `bun run dev:client`   | Web dev server only (`client/`, Vite on port 5173)                                           |
| `bun run db:up`        | Start the local MongoDB (`compose.yaml`) and wait until it is healthy                        |
| `bun run db:down`      | Stop it (keeps the data; `docker compose down -v` deletes it)                                |
| `bun run db:seed`      | Seed the database at `MONGO_URL` with the owner user and the `louis.gentil` domain           |
| `bun run typecheck`    | `tsc` on the API and `svelte-check` on the web app                                           |
| `bun run lint`         | Prettier check and ESLint on the web app                                                     |
| `bun run test`         | API tests (need MongoDB; set `TEST_MONGO_URL`, see [Testing](#testing)) and web unit tests   |
| `bun run build:client` | Production build of the web app (`client/build`)                                             |
| `bun run start:server` | Start the API in production mode                                                             |
| `bun run start:client` | Start the built web app (port 4000 unless `PORT` is set)                                     |

Each workspace has more scripts (`format`, `check:watch`, `preview`, ...): see
`client/package.json`, `server/package.json`, [client/README.md](client/README.md) and
[server/readme.md](server/readme.md).

## Testing

```bash
TEST_MONGO_URL=mongodb://127.0.0.1:27017/portfolio-test bun run test   # API + web unit tests
TEST_MONGO_URL=mongodb://127.0.0.1:27017/portfolio-test bun run --cwd server test   # API only
bun run --cwd client test:unit      # web unit tests only (Vitest, single run)
```

The API tests read `server/.env`, so without `TEST_MONGO_URL` they use its `MONGO_URL`, the
development database: the integration and Eden suites seed it and create, then delete, their own
documents there. `TEST_MONGO_URL` points them at a separate database instead (set it in the
shell as above, or uncomment it in `server/.env`). The Eden suite also starts the API on `PORT`
(3000 by default), so stop `bun run dev` first, or run the tests on another port
(`PORT=3100 TEST_MONGO_URL=... bun run test`).

End-to-end tests build the web app, serve it on port 4173 with adapter-bun and drive it with
Playwright. They need the API running against a seeded database, with `http://localhost:4173` in
the API's `ALLOWED_DOMAINS` (the example `.env` has it):

```bash
bun run db:up && bun run db:seed
bun run start:server                # in another terminal
cd client && bunx playwright install chromium && cd ..   # once
bun run --cwd client test:e2e
```

CI (`.github/workflows/main.yml`) runs on pushes and pull requests to `develop` and `main`, in
three jobs: lint, type-check and build; API and web unit tests against MongoDB 8; Playwright end
to end.

## Deployment

Railway deploys the `develop` branch as two services, the API and the web app, both built with
Railpack from the repository root. Settings, environment variables, custom domains (required for
the login cookie) and verification steps: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.
