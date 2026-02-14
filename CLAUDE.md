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
