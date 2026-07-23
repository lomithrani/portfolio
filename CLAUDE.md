# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tooling

**Always use Bun** — not Node, npm, or npx. Use `bun`, `bunx`, `bun add`, `bun run`, etc.

## Project Overview

A portfolio web application with a Bun workspace monorepo structure:
- **client/** — SvelteKit 2 frontend (Svelte 5 with runes, Skeleton UI v4, Tailwind CSS 4)
- **server/** — Elysia backend API (Bun runtime, MongoDB via Mongoose)
- **common/** — Shared types (e.g. `ExperienceType` enum) used by both client and server

## Common Commands

### Development
```bash
cd client && bun run dev          # Start SvelteKit dev server (port 5173)
cd server && bun run dev          # Start Elysia server with watch mode (port 3000)
```

### Build & Run
```bash
bun run build:client              # Build SvelteKit for production
bun run start:server              # Start server in production mode
bun run start:client              # Start built client (port 4000)
```

### Testing
```bash
cd client && bun run test:unit    # Vitest unit tests
cd client && bun run test:e2e     # Playwright E2E tests (needs server + seeded DB)
cd server && bun test             # Server unit tests (needs MongoDB)
```

### Linting & Type-checking
```bash
cd client && bun run check        # svelte-check (type checking)
cd client && bun run lint         # Prettier + ESLint
cd client && bun run format       # Auto-format with Prettier
```

## Architecture

### API Communication (Type-Safe)
The client uses **Eden Treaty** (`@elysiajs/eden`) for type-safe API calls. The Elysia server's type (`Portfolio`) is imported directly by the client, so API changes are caught at compile time. See `client/src/services/portfolio.ts`.

### Routing
SvelteKit dynamic routes under `[domain]/` — the root (`/`) redirects to `/louis.gentil/experiences`. Each portfolio is loaded by domain name via `+layout.server.ts` calling the API.

### Authentication Flow
Google OAuth 2.0 → server verifies token → upserts user in MongoDB → issues JWT (7-day, httpOnly cookie). Client tracks auth state via `svelte-persisted-store`. Protected server routes use the `userLogged` Elysia plugin middleware.

### Server Plugin Structure
Elysia routes are organized as plugins in `server/plugins/` — `auth.ts`, `domain.ts`, `experiences.ts`, `workflows.ts`. Custom error classes live in `server/errors.ts`.

### Database Models
Mongoose schemas in `server/models/database/`. Key entities: Domain, User, Experience, Company, Project, Skill, Workflow (with steps/instances). Elysia request validation schemas use TypeBox in `server/models/elysia/`.

### Client Path Aliases
Defined in `svelte.config.js`: `$components` → `src/lib/components`, `$services` → `src/services`, `$images` → `src/lib/images`.

## Code Style

- **Tabs** for indentation, **single quotes**, **no trailing commas**, 100 char print width
- Svelte files use `prettier-plugin-svelte`
- Svelte 5 runes syntax (`$state`, `$derived`, `$effect`, etc.)
- Skeleton UI v4 components via `@skeletonlabs/skeleton-svelte`

## Environment Variables

**Client:** `PUBLIC_PORTFOLIO_API_URL` (API base URL, default `http://localhost:3000`)

**Server (all required):** `MONGO_URL`, `ALLOWED_DOMAINS` (JSON array of allowed CORS origins), `JWT_SECRET`

## Deployment

Railway.app with nixpacks. CI runs on push/PR to `develop` and `main` branches. The `develop` branch is the main development branch.

## Claude Code Setup (new device)

Everything portable is committed to the repo:
- **CLAUDE.md** (this file) — project instructions
- **.mcp.json** — project MCP servers (railway, github, context7, svelte, chrome-devtools), auto-enabled via `.claude/settings.json`
- **.claude/settings.json** — shared permissions allowlist; local overrides go in `.claude/settings.local.json` (gitignored)
- **.claude/launch.json** — dev server configs for the browser preview (client:5173, server:3000)
- **server/.env.example**, **client/.env.example** — templates for required env vars

Manual steps on a new device:
1. Install Bun and run `bun install` at the repo root.
2. Copy the `.env.example` files to `.env` and fill in real values (never commit them).
3. Export `GITHUB_PERSONAL_ACCESS_TOKEN` in your shell profile — the github MCP server in `.mcp.json` expands it from the environment.
4. claude.ai connectors (Gmail, Calendar, Railway, etc.) are tied to the Anthropic account, not the repo — re-authorize them in claude.ai connector settings or via `/mcp` in an interactive session if needed.
5. Install Graphify (see below) — the skill files in `.claude/skills/graphify/` are committed, but the CLI must be installed per device.

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
