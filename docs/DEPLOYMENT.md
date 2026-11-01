# Deploying to Railway

The portfolio runs on [Railway](https://railway.com) as **two services built from this one
repository**: the Elysia API (`server/`) and the SvelteKit web app (`client/`). Both deploy every
push to the **`develop`** branch.

> **To verify against the live project.** This runbook assumes both services are in Railway
> project `personal-api`, environment `production`. That has not been confirmed: the web service
> may still be in an older project (named `production`, with a web service called `portfolio`).
> After `railway login`, `railway list` shows the projects; `railway link` each candidate, then
> run `railway status` and `railway environment config` to see its services and their settings,
> and correct the names in this runbook.

This runbook lists every setting the two services need. They live in the Railway dashboard (or in
the optional Infrastructure as Code file described at the end), not in the repository: Railway's
Config as Code files (`railway.json` / `railway.toml`) are deprecated, so this repository
intentionally has none (see [Why there is no railway.json](#why-there-is-no-railwayjson)).

Sources: the [Railway docs](https://github.com/railwayapp/docs) and the
[Railpack docs](https://github.com/railwayapp/railpack) as of 2026-11-01.

## Before merging to `develop`

`develop` deploys on every push, and this change deletes `nixpacks.toml`, which a service still on
the legacy Nixpacks builder needs to install Bun. Before merging, check on **both** services:

1. The builder is **Railpack** (see
   [Switching a service from legacy Nixpacks to Railpack](#switching-a-service-from-legacy-nixpacks-to-railpack)).
2. **Railway Config File** is empty and **Root Directory** is `/`.
3. The Build and Start Commands match [the table below](#the-two-services-at-a-glance).
4. The service variables pass the API's startup validation (see
   [Environment variables](#environment-variables) and _Before deploying this version_ in
   [server/readme.md](../server/readme.md)), and the web service has `PUBLIC_PORTFOLIO_API_URL`.

Set the web healthcheck path to `/healthz` together with the merge (the code before this change
has no `/healthz`; the API's `/health` already exists), then run [Verify a deploy](#verify-a-deploy)
on the first deployment.

## The two services at a glance

| Setting            | API service                                           | Web service                                           |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| Source             | `lomithrani/portfolio`, branch `develop`              | `lomithrani/portfolio`, branch `develop`              |
| Root Directory     | `/`                                                   | `/`                                                   |
| Builder            | Railpack                                              | Railpack                                              |
| Build Command      | _(empty)_                                             | `bun run build:client`                                |
| Start Command      | `bun run start:server`                                | `bun run start:client`                                |
| Healthcheck Path   | `/health`                                             | `/healthz`                                            |
| Watch Paths        | `/server/**` `/common/**` `/package.json` `/bun.lock` | `/client/**` `/common/**` `/package.json` `/bun.lock` |
| Railway Config File | _(empty)_                                            | _(empty)_                                             |
| Wait for CI        | on, once CI is green (see [Wait for CI](#wait-for-ci)) | same                                                 |
| Public domain      | custom domain, e.g. `api.example.com`                 | custom domain, e.g. `example.com`                     |

**Root Directory must stay `/` for both services.** This is a Bun workspace: `bun.lock`, the
shared `common/` package (`portfolio-common`, a `workspace:` dependency of both apps) and the
`packageManager` pin all live at the repository root. A service rooted at `/server` or `/client`
has no lockfile and cannot resolve `portfolio-common`. The per-service build and start commands
come from the root `package.json`:

```jsonc
"build:client": "cd client && bun run build",                           // vite build with @sveltejs/adapter-bun -> client/build
"start:server": "cd server && bun run start",                           // bun run index.ts
"start:client": "cd client && PORT=${PORT:-4000} bun --bun build/index.js"
```

Do not rename these three scripts: the services' commands depend on them. Do not add a root
`build` or `start` script either: Railpack runs a root `build` script automatically, and would
then build the web app inside the API service too.

The API needs no build step (Bun runs the TypeScript directly). Railway injects `PORT` into both
services, and both listen on it.

## Builder: Railpack

Railway builds services with **Railpack** (the default) or a Dockerfile. Nixpacks is the legacy
builder: its documentation has been removed, and Railpack does not read `nixpacks.toml`. The
repository's old `nixpacks.toml` (which only installed Bun from nixpkgs) has been deleted: the
upgraded stack needs Bun 1.4 or newer (`@sveltejs/adapter-bun` refuses to start on older Bun),
and the Bun version now comes from `packageManager`.

What Railpack does with this repository:

1. Detects Bun from `"packageManager": "bun@1.4.4"` in the root `package.json` and installs
   exactly **Bun 1.4.4** (the version order is `RAILPACK_BUN_VERSION` > `packageManager` >
   `engines.bun` > `.bun-version`; do not set `RAILPACK_BUN_VERSION`, so `package.json` stays the
   single source of the version for Railway, CI and local development).
2. Installs every workspace with `bun install --frozen-lockfile`. A `bun.lock` that is out of
   sync with a `package.json` fails the build, the same way it fails CI.
3. Runs the service's Build Command (web only), then starts the Start Command.
4. Sets `NODE_ENV=production` (and `CI=true`) at build and run time. Development dependencies
   are still installed, which the web build needs.

### Switching a service from legacy Nixpacks to Railpack

Check the builder of both services **before this change reaches `develop`** (see
[Before merging to `develop`](#before-merging-to-develop)), because a service still on Nixpacks
loses the `nixpacks.toml` that installed Bun.

1. Look at the service's latest build logs: a Railpack build starts with its build plan, whose
   **Packages** table names each tool with its version and source (after this change:
   `bun │ 1.4.4 │ package.json > packageManager`). Or run `railway environment config` and check
   `build.builder` for each service.
2. To switch: in the service's **Settings**, under **Build**, set the builder to **Railpack**.
   From the CLI:

   ```bash
   railway environment edit --service-config <service> build.builder RAILPACK
   ```

3. In the same Settings page, make sure **Railway Config File** is empty and **Root Directory**
   is `/`, and set the Build and Start Commands from the table above.
4. Deploy (Command Palette, `Deploy Latest Commit`), then run the checks in
   [Verify a deploy](#verify-a-deploy).

## Health checks

Railway only switches traffic to a new deployment once its healthcheck path answers a `2xx` on
`PORT` (requests come from the host `healthcheck.railway.app`; the default timeout is 300 s,
adjustable in the settings or with `RAILWAY_HEALTHCHECK_TIMEOUT_SEC`). It checks at deploy time
only, not continuously.

- **API: `/health`** answers `200 OK` when MongoDB is connected and `503` otherwise, so a
  deployment that cannot reach MongoDB never receives traffic.
- **Web: `/healthz`** answers `200 ok` without calling the API, so an API outage does not block a
  web deployment. (`/` cannot be used: it is a `302` redirect to `/louis.gentil/experiences`.)

## Graceful shutdown

When a new deployment goes live, Railway sends `SIGTERM` to the old one and, **by default,
`SIGKILL`s it 0 seconds later**. Set this service variable on **both** services:

```
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30
```

With it, the API closes the HTTP server, disconnects MongoDB and flushes telemetry before
exiting, and the web server (adapter-bun) waits for in-flight requests; adapter-bun force-closes
connections still open after `SHUTDOWN_TIMEOUT` seconds (default 30). `SIGTERM` reaches the apps
through the nested `bun run` scripts.

## Environment variables

Set these as service variables (Railway passes them at build and run time; mark secrets as
**sealed**). The `.env.example` files in `server/` and `client/` list the same variables for
local development.

### API service

| Variable                       | Required | Value on Railway                                                                                   |
| ------------------------------ | -------- | -------------------------------------------------------------------------------------------------- |
| `MONGO_URL`                    | yes      | Connection string. With Railway's MongoDB service: `${{MongoDB.MONGO_URL}}` (use your Mongo service's name) |
| `JWT_SECRET`                   | yes      | Long random value (32+ characters, shorter ones log a warning in production); sealed               |
| `ALLOWED_DOMAINS`              | yes      | JSON array of the web origins, exactly as the browser sends them: `["https://example.com"]`         |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | recommended | `30` (see [Graceful shutdown](#graceful-shutdown))                                         |
| `GOOGLE_CLIENT_ID`             | no       | Only if you use your own OAuth client; must equal the web's `PUBLIC_GOOGLE_CLIENT_ID`              |
| `AUTH_COOKIE_SAMESITE`         | no       | Leave unset (`strict`); see [Custom domains](#custom-domains-are-required-for-login)               |
| `API_DOCS`                     | no       | `true` to serve the OpenAPI docs (`/swagger`) in production; off by default there                  |
| `OTEL_EXPORTER_OTLP_ENDPOINT`  | no       | OTLP endpoint (e.g. Grafana Cloud); telemetry is fully off while it is unset                       |
| `OTEL_EXPORTER_OTLP_HEADERS`   | no       | e.g. `Authorization=Basic <base64 of instanceId:token>`; sealed                                    |
| `OTEL_SERVICE_NAME`            | no       | Defaults to `portfolio-server`                                                                     |

Railway provides `PORT`; Railpack sets `NODE_ENV=production` (the auth cookie is then `Secure`
and the API docs are off). Leave `HOST` unset: the default `::` listens on IPv6 and IPv4, which
Railway's private network needs in environments that resolve internal names to IPv6 only.
`ALLOWED_DOMAINS` is validated at startup. Invalid JSON, or anything but an array of strings,
stops the deployment with a message listing the problem. Entries that are not origins (no scheme
as in `example.com`, a path, `*`) are only ignored, with an `[WARN] ALLOWED_DOMAINS: ignoring ...`
line in the deploy logs: the deployment still goes live and passes its healthcheck, but the
browser's calls from that origin fail CORS. Check the deploy logs after changing the variable.

### Web service

| Variable                      | Required | Value on Railway                                                                                     |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `PUBLIC_PORTFOLIO_API_URL`    | yes      | Public URL of the API, e.g. `https://api.example.com` (or `https://${{<api service>.RAILWAY_PUBLIC_DOMAIN}}`) |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | recommended | `30`                                                                                     |
| `PUBLIC_GOOGLE_CLIENT_ID`     | no       | Only with your own OAuth client; must equal the API's `GOOGLE_CLIENT_ID`                             |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no       | Same as the API; telemetry is fully off while it is unset                                            |
| `OTEL_EXPORTER_OTLP_HEADERS`  | no       | Same as the API; sealed                                                                              |
| `OTEL_SERVICE_NAME`           | no       | Defaults to `portfolio-client`                                                                       |

`PUBLIC_PORTFOLIO_API_URL` is read when the server starts, not at build time, so changing it only
needs a restart. It defaults to `http://localhost:3000`, which is wrong on Railway: always set it.
The browser calls this URL directly, so it must be the API's **public** URL, not its
`*.railway.internal` name.

Railway provides `PORT` (adapter-bun listens on `HOST`, default `0.0.0.0`). `ORIGIN` is not
needed and not read: `@sveltejs/adapter-bun` derives the public origin from the `Host` header and
assumes `https`, which matches Railway's TLS-terminating proxy.

Google Sign-In: add the web origin (e.g. `https://example.com`) to the **Authorized JavaScript
origins** of the OAuth client in the Google Cloud console, or the sign-in button fails on the
deployed site.

## Custom domains are required for login

The API sets the session in an `httpOnly` cookie with `SameSite=Strict`. The browser only sends
it when the page and the API are on the **same site** (same registrable domain), for example:

- web on `example.com` (or `www.example.com`), API on `api.example.com`: works;
- web on `portfolio-web.up.railway.app`, API on `portfolio-api.up.railway.app`: **login silently
  fails** (the cookie is set but never sent back). `up.railway.app` is on the
  [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat), so every
  `*.up.railway.app` host is a separate site.

So give both services a custom domain under the same registrable domain (service **Settings**,
**Public Networking**, **+ Custom Domain**, then add both the `CNAME` and the `TXT` record Railway
shows; the domain does not verify without the `TXT` record). Then set `ALLOWED_DOMAINS` (API) and
`PUBLIC_PORTFOLIO_API_URL` (web) to those domains.

`AUTH_COOKIE_SAMESITE=none` (which also makes the cookie `Secure`) would let the cookie cross
sites, but it then becomes a third-party cookie, which Safari blocks and other browsers restrict
or partition. Treat it as a stopgap, not a fix.

## Deploy branch and Wait for CI

### Branch

Both services deploy from **`develop`** (service **Settings**, **Source**, branch). `main` is an
old branch, far behind `develop`; CI still runs on it, but nothing deploys from it.

### Wait for CI

With **Wait for CI** on (a toggle in the service **Settings**), a new deployment waits in
`WAITING` until every GitHub Actions workflow run on the commit has finished, and is skipped if
one fails. The CI workflow (`.github/workflows/main.yml`) qualifies: it runs on `push` to
`develop`.

Enable it on both services **once CI is green on `develop`**: while any job fails, every deploy
would be skipped. A cancelled run also blocks the deployment of its commit, unless another
workflow on the same commit succeeded. CI therefore only cancels superseded runs of pull
requests: each push run has a concurrency group of its own, so pushes to `develop` neither wait
for each other nor get cancelled while pending (GitHub cancels a pending run when a newer one
joins its group, even with `cancel-in-progress: false`). Runs not finished after two hours skip
the deploy.

## MongoDB

- The server uses Mongoose 9.11 with the MongoDB Node.js driver 7.7, which supports MongoDB
  server **4.4 to 9.0**.
- Local development (`compose.yaml`) and CI use the `mongo:9` image. Not `mongo:8`: that tag is
  MongoDB 8.3, which refuses to start on Linux kernel 6.19+ (SERVER-121912) — the kernel of
  GitHub's `ubuntu-latest` (Ubuntu 26.04) runners and of current desktop distributions. Check the
  production version and keep those on the same major when possible:

  ```bash
  mongosh "<production MONGO_URL>" --quiet --eval 'db.version()'
  ```

- With Railway's MongoDB template, the server version is the template's image tag. Changing it
  (a major upgrade) is a manual operation: back up first.
- If the API and MongoDB are in the same Railway project, reference the variable
  (`${{MongoDB.MONGO_URL}}`) instead of copying the connection string, so it keeps working if the
  credentials change.
- Seed a fresh database once with the owner's user and the `louis.gentil` domain (the target of
  `/`); the script is idempotent and never prints the connection string's password:

  ```bash
  MONGO_URL="<production MONGO_URL>" bun run db:seed
  ```

## Verify a deploy

1. **Build logs** (deployment, **Build Logs**, or `railway logs --build --service <service>`):
   Railpack's plan lists `bun │ 1.4.4 │ package.json > packageManager`, the install step runs
   `bun install --frozen-lockfile`, and the web build prints `Using @sveltejs/adapter-bun`.
2. **Deploy logs** (`railway logs --service <service>`): the API logs `Running at http://[::]:<PORT>`;
   the web logs `Listening on http://localhost:<PORT>/` (Bun prints `localhost` for the
   `0.0.0.0` wildcard). The deployment turns **Active** only after its healthcheck passed.
3. **Endpoints**:

   ```bash
   curl -i https://api.example.com/health      # 200 OK
   curl -i https://example.com/healthz         # 200 ok
   curl -sI https://example.com/ | grep -i '^location'    # /louis.gentil/experiences
   curl -si -H 'Origin: https://example.com' https://api.example.com/domain/louis.gentil \
     | grep -i '^access-control-allow-origin'  # https://example.com
   ```

4. **In the browser**: open the site, sign in with Google, reload the page and check you are still
   signed in (the `auth` cookie is stored for the API domain).
5. **Rollback** if needed: the previous deployment's menu has **Rollback**.

## Why there is no railway.json

Config as Code (`railway.json` / `railway.toml`) is deprecated: new services cannot opt into it,
and existing files **stop being read on 2026-12-01**. Adding one now would create a configuration
that silently stops applying in a month. The settings therefore live in the dashboard (this
runbook), optionally managed with Infrastructure as Code below. If a service has a custom
**Railway Config File** path set, clear that field in the service **Settings**, or run
`railway config migrate --apply` followed by `railway config migrate cutover` (reversible with
`railway config migrate undo`; `railway config migrate status` lists the services that still read
Config as Code). `--apply` alone only writes `.railway/railway.ts`: the services keep reading
their config file until the cutover.

## Optional: Infrastructure as Code (`.railway/railway.ts`)

Railway's replacement for Config as Code is a TypeScript file, `.railway/railway.ts`, that
describes the project and is applied with the Railway CLI (`railway config plan` /
`railway config apply`) or the `railwayapp/config` GitHub Action. Railway does **not** read
`.railway/` during deploys: nothing changes until you apply.

The repository does not ship this file, because the real service names (and every other resource
in the environment) must come from Railway first. In a single-repository project the file
describes the **whole** environment, and a resource missing from it (for example the MongoDB
service) is planned as a **deletion**.

1. Install and link the CLI:

   ```bash
   bun add -g --trust @railway/cli   # or: brew install railway / scoop install railway
   railway login
   railway link                      # the project that hosts both services (see the top)
   ```

2. Add the SDK that `.railway/railway.ts` imports (`railway/iac`), at the repository root.
   `railway config plan` and `apply` evaluate the file, so the package must be installed first.
   This changes `package.json` and `bun.lock`; commit both:

   ```bash
   bun add -d railway
   ```

3. Import the live configuration **before** editing anything. This writes `.railway/railway.ts`
   with the real service names and every resource, and keeps existing variable values on Railway
   as `preserve()`:

   ```bash
   railway config pull
   railway config plan               # a clean import shows no changes
   ```

4. Edit the pulled file so each service matches [the table above](#the-two-services-at-a-glance).
   For reference, the relevant parts look like this (type-checked against `railway` 3.16.0; keep
   the names and the other resources from the pulled file):

   ```ts
   import { defineRailway, github, preserve, project, service } from 'railway/iac';

   const repo = 'lomithrani/portfolio';
   const branch = 'develop';
   // Deploy a service only when its own code, the shared package or the workspace manifests change
   const watchPatterns = (dir: string) => [`/${dir}/**`, '/common/**', '/package.json', '/bun.lock'];

   export default defineRailway(() => {
   	const api = service('<api service name>', {
   		// checkSuites = "Wait for CI": enable only once CI is green on develop
   		source: github(repo, { branch, checkSuites: true }),
   		build: { builder: 'RAILPACK', watchPatterns: watchPatterns('server') },
   		start: 'bun run start:server',
   		healthcheck: '/health',
   		env: {
   			MONGO_URL: preserve(),
   			JWT_SECRET: preserve(),
   			ALLOWED_DOMAINS: preserve(),
   			RAILWAY_DEPLOYMENT_DRAINING_SECONDS: '30'
   		}
   	});

   	const web = service('<web service name>', {
   		source: github(repo, { branch, checkSuites: true }),
   		build: {
   			builder: 'RAILPACK',
   			buildCommand: 'bun run build:client',
   			watchPatterns: watchPatterns('client')
   		},
   		start: 'bun run start:client',
   		healthcheck: '/healthz',
   		env: {
   			PUBLIC_PORTFOLIO_API_URL: preserve(),
   			RAILWAY_DEPLOYMENT_DRAINING_SECONDS: '30'
   		}
   	});

   	// List EVERY resource the pulled file declares (e.g. the MongoDB service): in a
   	// single-repo file, a resource left out is planned as a deletion.
   	return project('<project name>', { resources: [api, web] });
   });
   ```

5. Review and apply:

   ```bash
   railway config plan               # must list only the changes you intend; destructive ones are marked
   railway config apply
   ```

To apply from CI instead, the `railwayapp/config@v1` action plans on pull requests that touch
`.railway/**` and applies the reviewed plan on merge, with a project token stored as the
`RAILWAY_TOKEN` repository secret (see the Railway docs, _Infrastructure as Code_, _Apply from
GitHub Actions_).
