# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tooling

**Always use Bun** — not Node, npm, or npx. Use `bun`, `bunx`, `bun add`, `bun run`, etc.

## Project Overview

A portfolio web application with a Bun workspace monorepo structure:
- **client/** — SvelteKit 3 frontend (Svelte 5 with runes, Skeleton 5, Tailwind CSS 4, `@sveltejs/adapter-bun`)
- **server/** — Elysia backend API (Bun runtime, MongoDB via Mongoose)
- **common/** — Shared code used by both client and server (`ExperienceType`, domain-name validation, `DEFAULT_GOOGLE_CLIENT_ID`)

Bun 1.4.4 is pinned in the root `package.json` (`packageManager`); the text lockfile `bun.lock` uses the isolated linker (each workspace has its own `node_modules`).

## Common Commands

All from the repo root (`bun run --cwd <workspace> <script>` runs a workspace script from there).

### Development
```bash
bun install                       # Install all workspaces (CI and Railway use --frozen-lockfile)
bun run db:up                     # Local MongoDB 7 (as in production) via Docker (compose.yaml), waits until healthy
bun run db:seed                   # Seed owner user + 'louis.gentil' domain (idempotent)
bun run dev                       # API (port 3000, watch) + SvelteKit dev server (port 5173) in parallel
bun run dev:server                # API only
bun run dev:client                # Web only
bun run db:down                   # Stop MongoDB (data kept in a Docker volume)
```

### Build & Run
```bash
bun run build:client              # Build SvelteKit for production (client/build)
bun run start:server              # Start the API without watch mode (production behaviour needs NODE_ENV=production)
bun run start:client              # Start built client (port 4000)
```
`build:client`, `start:server` and `start:client` are the Railway build/start commands: do not rename them, and do not add a root `build`/`start` script. `start:server` sets no `NODE_ENV`: production behaviour (Secure cookie, no `/swagger`) needs `NODE_ENV=production`, which Railpack sets on Railway. Do not add it to the script (the local e2e flow and CI run it over plain http).

### Testing
```bash
TEST_MONGO_URL=mongodb://127.0.0.1:27017/portfolio-test bun run test   # Server tests (need MongoDB) + client unit tests
TEST_MONGO_URL=mongodb://127.0.0.1:27017/portfolio-test bun run --cwd server test   # Server tests only (bun test tests/)
bun run --cwd client test:unit    # Vitest unit tests (single run)
bun run --cwd client test:e2e     # Playwright E2E tests (needs the API running + seeded DB)
```
Server tests load `server/.env`; without `TEST_MONGO_URL` they write to its `MONGO_URL` (the dev database). The Eden suite starts the API on `PORT` (default 3000): stop `bun run dev` first or set another `PORT`.
Server tests must pass in any order (CI runs them with `--randomize`; replay a failure with `--seed=N`): each test creates its own data, named with a unique suffix, and removes it, never relying on an earlier test or on seeded data.

### Linting & Type-checking
```bash
bun run typecheck                 # tsc on the server + svelte-check on the client
bun run lint                      # Prettier check + ESLint (client)
bun run --cwd client format       # Auto-format the client with Prettier
```

## Architecture

### API Communication (Type-Safe)
The client uses **Eden Treaty** (`@elysiajs/eden`) for type-safe API calls. The Elysia server's type (`Portfolio`) is imported directly by the client, so API changes are caught at compile time. See `client/src/services/portfolio.ts`.

### Routing
SvelteKit dynamic routes under `[domain]/` — the root (`/`) redirects to `/louis.gentil/experiences`. Each portfolio is loaded by domain name via `+layout.server.ts` calling the API.

### Authentication Flow
Google OAuth 2.0 → server verifies token → upserts user in MongoDB → issues JWT (7-day, httpOnly cookie). Client tracks auth state via `svelte-persisted-store`. Protected server routes use the `userLogged` Elysia plugin middleware.

### Server Plugin Structure
Elysia routes are organized as plugins in `server/plugins/` — `auth.ts`, `domain.ts`, `experiences.ts`, `workflows.ts`, `appointments.ts` (Google Calendar: admin schedules + public booking; Google calls live in `server/services/googleCalendar.ts`, slots in `server/services/slotComputation.ts`). Custom error classes live in `server/errors.ts`.

### Database Models
Mongoose schemas in `server/models/database/`. Key entities: Domain, User, Experience, Company, Project, Skill, Workflow (with steps/instances), AppointmentSchedule. The User's Google Calendar OAuth tokens (`googleCalendar.refreshToken` / `accessToken`) are `select: false`: only `services/googleCalendar.ts` loads them (`.select('+googleCalendar.refreshToken')`), and `tests/appointments.test.ts` fails if any API response contains one. Elysia request validation schemas use TypeBox in `server/models/elysia/`.

### Client Path Aliases
Node [subpath imports](https://svelte.dev/docs/kit/$lib) in the `imports` field of `client/package.json`, resolved natively by Vite, Vitest and TypeScript: `#lib/*` → `src/lib/*`, `#components/*` → `src/lib/components/*`, `#images/*` → `src/lib/images/*`, `#services` → `src/services/index.ts`, `#services/*` → `src/services/*`. Subpath imports do no extension or `index` lookup, so write the full file name: `#components/Header.svelte`, `#services/authentication.ts`, `#services/stores/index.ts` (`.ts` works because SvelteKit's generated tsconfig sets `allowImportingTsExtensions`). Do not reintroduce the SvelteKit `alias` option or the removed `$lib`: `alias` is deprecated in SvelteKit 3.

## Code Style

- **Tabs** for indentation, **single quotes**, **no trailing commas**, 100 char print width (client, enforced by Prettier); server files use 2-space indentation — keep each file's existing style
- Svelte files use `prettier-plugin-svelte`
- Svelte 5 runes syntax (`$state`, `$derived`, `$effect`, etc.)
- Skeleton 5 components via `@skeletonlabs/skeleton-svelte`

## Environment Variables

Templates with every variable: `server/.env.example`, `client/.env.example` (copy to `.env`; Bun and Vite load them).

**Server** (validated once at startup by `server/env.ts`):
- Required: `MONGO_URL`, `JWT_SECRET`, `ALLOWED_DOMAINS` (JSON array of allowed CORS origins)
- Optional: `PORT` (3000), `HOST` (`::`, falls back to `0.0.0.0` without IPv6), `GOOGLE_CLIENT_ID` (default `DEFAULT_GOOGLE_CLIENT_ID` from portfolio-common), `GOOGLE_CLIENT_SECRET` (secret of that OAuth client; Google Calendar appointments are off without it), `AUTH_COOKIE_SAMESITE` (`strict`|`lax`|`none`, default `strict`), `API_DOCS` (`true` exposes OpenAPI docs in production), `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS` / `OTEL_SERVICE_NAME` (telemetry off without the endpoint), `OTEL_SDK_DISABLED` (`true` = telemetry off) and `OTEL_TRACES_EXPORTER` / `OTEL_METRICS_EXPORTER` / `OTEL_LOGS_EXPORTER` (`none` switches one signal off; see "Diagnosing memory growth" in `docs/DEPLOYMENT.md`), `MEMORY_LOG_INTERVAL_MS` (periodic `memory` log line, default 600000, `0` = off), `TLS_PASSPHRASE`, `NODE_ENV`

**Client** (declared in `client/src/env.ts`, read at server start, not at build time):
- `PUBLIC_PORTFOLIO_API_URL` (default `http://localhost:3000`), `PUBLIC_GOOGLE_CLIENT_ID` (default `DEFAULT_GOOGLE_CLIENT_ID`; must match the server's `GOOGLE_CLIENT_ID`)
- adapter-bun runtime: `PORT`, `HOST`; optional `OTEL_*` like the server

Health checks: API `GET /health` (200 when MongoDB is connected, 503 otherwise), web `GET /healthz` (200 without calling the API).

## Deployment

Railway deploys the `develop` branch as two services from the repo root, both built with **Railpack** (it reads Bun 1.4.4 from `packageManager` and runs `bun install --frozen-lockfile`): API (start `bun run start:server`, healthcheck `/health`) and web (build `bun run build:client`, start `bun run start:client`, healthcheck `/healthz`). Settings live in the Railway dashboard; there is intentionally no `railway.json` (Config as Code is deprecated and stops being read on 2026-12-01) and no `nixpacks.toml`. Full runbook: `docs/DEPLOYMENT.md`.

Live layout (verified 2026-11-01): Railway project `personal-api`, environment `production`: web service `portfolio` (`develop.portfolio.gentil.tech`), API service `portfolio api develop` (`develop.api.portfolio.gentil.tech`), `MongoDB` (`mongo:7` with a volume), plus a legacy never-deployed `portfolio api` service on `main`. Both app services use the Railpack builder and Root Directory `/` (see the runbook for the full settings).

CI (`.github/workflows/main.yml`) runs on push/PR to `develop` and `main`: quality (lint, svelte-check, server tsc, client build), tests (server + client unit against MongoDB 7, like production, and 9) and Playwright e2e. The `develop` branch is the main development branch.

## Claude Code Setup (new device)

Everything portable is committed to the repo:
- **CLAUDE.md** (this file) — project instructions
- **.mcp.json** — project MCP servers (railway, github, context7, svelte, chrome-devtools), auto-enabled via `.claude/settings.json`
- **.claude/settings.json** — shared permissions allowlist; local overrides go in `.claude/settings.local.json` (gitignored)
- **.claude/launch.json** — dev server configs for the browser preview (client:5173, server:3000)
- **server/.env.example**, **client/.env.example** — templates for every env var (required ones preset for local dev)
- **compose.yaml** — local MongoDB (`bun run db:up`)

Manual steps on a new device:
1. Install Bun **1.4.4** (the `packageManager` version, see README) and Docker, then run `bun install` at the repo root.
2. Copy the `.env.example` files to `.env` (the defaults work locally; never commit `.env`), then `bun run db:up` and `bun run db:seed`.
3. Export `GITHUB_PERSONAL_ACCESS_TOKEN` in your shell profile — the github MCP server in `.mcp.json` (GitHub's hosted server at `api.githubcopilot.com/mcp/`) sends it as a Bearer token.
4. Install the Railway CLI (`bun add -g --trust @railway/cli`, or `scoop install railway` on Windows, `brew install railway` on macOS) and run `railway login` — the railway MCP server in `.mcp.json` is `railway mcp`, which proxies to Railway's hosted MCP with the CLI's credentials.
5. The other MCP servers (context7, svelte, chrome-devtools) run through `bunx` with pinned major versions; nothing to install.
6. claude.ai connectors (Gmail, Calendar, Railway, etc.) are tied to the Anthropic account, not the repo — re-authorize them in claude.ai connector settings or via `/mcp` in an interactive session if needed.
7. Install Graphify (see below) — the skill files in `.claude/skills/graphify/` are committed, but the CLI must be installed per device.

## Graphify (knowledge graph)

[Graphify](https://github.com/Graphify-Labs/graphify) builds a queryable knowledge graph of the repo (code via local tree-sitter AST parsing, docs via a semantic pass) exposed as a `/graphify` skill in Claude Code.

**Install on a new device** (the CLI is machine-level, the skill is committed):

```bash
winget install astral-sh.uv        # Windows; Mac: brew install uv
uv tool install graphifyy          # NOTE: package is 'graphifyy' (double y) — other graphify* packages on PyPI are typosquats
graphify install --project         # registers the skill into .claude/skills/graphify/ (committed to this repo)
```

**Usage:** type `/graphify .` in Claude Code to (re)build the graph, then prefer `graphify query "<question>"`, `graphify path A B` and `graphify explain "<concept>"` over grepping when exploring the codebase.

**Outputs** land in `graphify-out/` (graph.html, graph.json, GRAPH_REPORT.md) — gitignored, regenerate locally with `/graphify .`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
