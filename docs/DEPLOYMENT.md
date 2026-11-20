# Deploying to Railway

The portfolio runs on [Railway](https://railway.com) as **two services built from this one
repository**: the Elysia API (`server/`) and the SvelteKit web app (`client/`), deployed twice:

- **Staging**: every push to **`develop`** (each merged pull request) deploys
  `develop.portfolio.gentil.tech` and `develop.api.portfolio.gentil.tech`.
- **Production**: every push to **`main`** deploys `portfolio.gentil.tech` and
  `api.portfolio.gentil.tech`. `main` only receives `develop`, through a release pull request (see
  [Releases](#releases)).

### Live layout (verified 2026-11-15 with the Railway connector)

Project **`personal-api`**, Railway environment **`production`** (region `us-west2`), which holds
both stages:

| Railway service          | Stage      | Role                         | Branch    | Domains                                                                   |
| ------------------------ | ---------- | ---------------------------- | --------- | ------------------------------------------------------------------------- |
| `portfolio web`          | production | Web (SvelteKit)              | `main`    | `portfolio.gentil.tech`                                                   |
| `portfolio api`          | production | API (Elysia)                 | `main`    | `api.portfolio.gentil.tech`, `server-production-1015.up.railway.app`      |
| `portfolio`              | staging    | Web (SvelteKit)              | `develop` | `develop.portfolio.gentil.tech`, `portfolio-production-7dbf.up.railway.app` |
| `portfolio api develop`  | staging    | API (Elysia)                 | `develop` | `develop.api.portfolio.gentil.tech`, `portfolio-develop-production.up.railway.app` |
| `MongoDB`                | both       | Database (`mongo:7`, volume `mongo data`) | — | private network only                                                  |

The two stages share the `MongoDB` service but not a database: production's `MONGO_URL` points at
the database that holds the real data, staging's at a database of its own (`portfolio-develop`),
so code on `develop` never touches production data. Each stage has its own `JWT_SECRET` (a staging
session is not valid in production) and its own `ALLOWED_DOMAINS` and `PUBLIC_PORTFOLIO_API_URL`.
Both web origins must be **Authorized JavaScript origins** of the Google OAuth client.

All four app services use Root Directory `/`. Until this change they built with the legacy
**Nixpacks** builder and had no healthcheck. The web and API custom domains share the registrable
domain `gentil.tech`, so the `SameSite=Strict` auth cookie works (see
[Custom domains are required for login](#custom-domains-are-required-for-login)). Production
MongoDB is **7.0**, which CI also tests against.

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
| Source             | `lomithrani/portfolio`, branch `main` (production) or `develop` (staging) | same                         |
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
  web deployment. (`/`, the landing page, would work but renders a whole page for each check.)

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
| `GOOGLE_CLIENT_SECRET`         | for appointments | Client secret of that same OAuth client; sealed. Enables Google Calendar appointments (see [Google Calendar appointments](#google-calendar-appointments)) |
| `AUTH_COOKIE_SAMESITE`         | no       | Leave unset (`strict`); see [Custom domains](#custom-domains-are-required-for-login)               |
| `CLIENT_IP_HEADER`             | no       | Leave unset: on Railway it defaults to `X-Real-IP`. Set it only behind another proxy (see [Booking protection](#booking-protection)) |
| `ANTHROPIC_API_KEY`            | for résumé import | Claude API key of a dedicated workspace with a spend limit; sealed. Enables résumé and job description imports (see [Résumé import](#résumé-import)) and sorts feedback (see [Feedback](#feedback)) |
| `GITHUB_ISSUES_TOKEN`          | for step suggestions and feedback | Fine-grained GitHub token with Issues write on one repository; sealed. Enables step suggestions and feedback (see [Step suggestions](#step-suggestions), [Feedback](#feedback)) |
| `COMMUTE_TIMES`                | for the commute criterion | `true` turns travel times on (see [Travel times](#travel-times)); addresses then go to the Géoplateforme |
| `COMMUTE_TRANSIT`              | for public transport | `here` or `transitous`: the service asked for public transport times (see [Travel times](#travel-times)) |
| `HERE_API_KEY`                 | with `COMMUTE_TRANSIT=here` | API key of an app of your HERE platform account; sealed. Billed per journey asked beyond the free monthly allowance |
| `COMMUTE_CONTACT`              | with `COMMUTE_TRANSIT=transitous` | An email address or a web page, sent as the User-Agent of the requests to Transitous |
| `COMMUTE_DAILY_LIMIT`          | no       | Requests to the travel time services per UTC day for the whole site; leave unset (`500`); `0` turns travel times off; matching's warm-ups use half of it at most |
| `MATCHING`                     | no       | `true` on staging only, for now: turns matching (Path 2) on (see [Matching](#matching)); leave unset in production until its legal texts ship |
| `MATCHING_REVIEWERS`           | no       | The emails of the accounts that review each job put into matching before it reaches a candidate, separated by commas (never logged); without one, no job is ever proposed (see [Matching](#matching)) |
| `GITHUB_ISSUES_REPO`           | no       | Repository the suggestions and feedback are filed in, `owner/name`; leave unset (`lomithrani/portfolio`) |
| `RESUME_IMPORT_MONTHLY_LIMIT`  | no       | Imports per user per 30 days; leave unset (`3`); `0` turns résumé import off                        |
| `RESUME_IMPORT_DAILY_LIMIT`    | no       | Imports per UTC day for the whole site; leave unset (`30`); `0` turns résumé import off             |
| `RESUME_IMPORT_ATTEMPTS_PER_DAY` | no     | Import attempts per user per UTC day, failed ones included; leave unset (`10`); `0` turns résumé import off |
| `JOB_IMPORT_DAILY_LIMIT`       | no       | Job description imports per UTC day for the whole site; leave unset (`30`); `0` turns job import off |
| `JOB_IMPORT_ATTEMPTS_PER_DAY`  | no       | Job import attempts per recruiter per UTC day, failed ones included; leave unset (`10`); `0` turns job import off |
| `API_DOCS`                     | no       | `true` to serve the OpenAPI docs (`/swagger`) in production; off by default there                  |
| `OTEL_EXPORTER_OTLP_ENDPOINT`  | no       | OTLP endpoint (e.g. Grafana Cloud); telemetry is fully off while it is unset                       |
| `OTEL_EXPORTER_OTLP_HEADERS`   | no       | e.g. `Authorization=Basic <base64 of instanceId:token>`; sealed                                    |
| `OTEL_SERVICE_NAME`            | no       | Defaults to `portfolio-server`                                                                     |
| `OTEL_SDK_DISABLED`            | no       | `true` turns telemetry fully off, like an unset endpoint (see [Diagnosing memory growth](#diagnosing-memory-growth)) |
| `OTEL_TRACES_EXPORTER`, `OTEL_METRICS_EXPORTER`, `OTEL_LOGS_EXPORTER` | no | `none` switches off that one signal; leave unset (`otlp`) normally            |
| `MEMORY_LOG_INTERVAL_MS`       | no       | Period of the `memory` log line; leave unset (`600000`, 10 minutes); `0` turns it off               |

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
| `LEGAL_PUBLISHER_NAME`        | yes (legal) | Publisher and data controller named by the legal notice and the privacy policy                    |
| `LEGAL_CONTACT_EMAIL`         | yes (legal) | Contact address for users, authorities, privacy requests and reports of illegal content           |
| `LEGAL_PUBLISHER_ADDRESS`     | no       | Postal address, one line                                                                             |
| `LEGAL_PUBLISHER_PHONE`       | no       | Phone number                                                                                         |
| `LEGAL_PUBLISHER_SIREN`       | no       | SIREN/SIRET: when set, the publisher is shown as a professional                                      |
| `LEGAL_PUBLISHER_VAT`         | no       | Intra-community VAT number                                                                           |
| `LEGAL_PUBLICATION_DIRECTOR`  | no       | Defaults to `LEGAL_PUBLISHER_NAME`                                                                   |
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

The landing page's share tags (`canonical`, `og:url`, the `hreflang` links of its English and
French versions, `og:image` = `/og-image.png`, or `/og-image-fr.png` in French) are built from
that same derived origin, and so are the preview tags of a portfolio's experiences page and page
for recruiters (`og:url`, `og:image` = `/og-portfolio.png` and `/og-hire.png`, `-fr.png` in
French): after the first deploy, check they read `https://<your domain>/...`
(`curl -s https://example.com/ | grep -o '<meta property="og:url"[^>]*>'`, and
[Search engines](#search-engines) for the portfolio's).

### Legal pages

The legal notice (`/legal`), privacy policy (`/legal/privacy`), terms (`/legal/terms`) and cookies
page (`/legal/cookies`), in English and in French (`?lang=fr`), take the publisher's identity from
the `LEGAL_*` variables above: nothing personal is in the repository. Set them as **service
variables of the web service** (they are read on the server only, at startup, and never sent to the
API); a restart applies a change. Until `LEGAL_PUBLISHER_NAME` and `LEGAL_CONTACT_EMAIL` are both
set (and the email looks like one), the pages say **"Publisher details are not configured yet."**
in place of the publisher and contact, and the web deploy logs one warning at startup
(`LEGAL_PUBLISHER_NAME is not set: the legal notice and the privacy policy show ...`). Without a
SIREN the publisher is presented as an individual acting on a non-professional basis.

Before going live, confirm what the texts state about the operations: log and trace retention ("up
to 30 days", `LOG_RETENTION` in `client/src/lib/components/legal/legalDocuments.ts`), what
Cloudflare keeps of the page requests ("up to 31 days", `CLOUDFLARE_LOG_RETENTION` there: the
retention of its traffic and security analytics on the Free, Pro and Business plans, 90 days on
Enterprise; check the zone's plan and Cloudflare's data processing addendum), database backups, and the processors' transfer basis (Railway, Cloudflare, Anthropic, Google, GitHub, the
monitoring provider: each on the [Data Privacy Framework
list](https://www.dataprivacyframework.gov/list), or with standard contractual clauses in its data
processing terms; for Cloudflare, that the account is covered by its customer data processing
addendum). When the Terms of use or the Privacy policy change materially, bump `LEGAL_VERSION` in
`common/models/legal.ts`: accounts are asked to accept the new version, and a claim needs it, as
does the recruiter space: opening one, and every recruiter route, which answers 422 on `consent`
until the recruiter accepts the new version (the recruiter pages then show the terms to accept).
Recruiter spaces opened before recruiters accepted the terms (before the `recruiter` consent source)
are asked the same way. Reseed the e2e database after a bump (`bun run --cwd server seed:e2e`
records the version in force for the e2e recruiter), locally and in the cloud environment.

**Tell the accounts before a bump reaches production.** Both documents promise it (`#changes` of
the Terms and of the Privacy policy: "tell you on the site or by email before the change
applies"), and nothing on the site does it: the checkbox only shows once the release is deployed,
and from then on every recruiter route answers 422 on `consent` until the new version is accepted.
So, before deploying a release that bumps `LEGAL_VERSION` to production, email every account a
short notice, in English and French: what changes, when it applies, that they will be asked to
accept the new version (recruiters before they use their space again), and that they can delete
their account instead. The notice of `2026-11-18` also tells recruiters what the Terms now ask of
them (`#recruiters`): once a job description is opened, its pay and conditions can no longer be
changed (a new version of them is a new job description: Duplicate), and the top of its pay range
is at most 1.5 times its bottom. Read the addresses at that moment from production's database, for example
`mongosh "$MONGO_URL" --quiet --eval 'db.users.find({}, { email: 1, _id: 0 }).forEach((u) => print(u.email))'`,
send the notice with the addresses in Bcc, and keep no copy of the list. List this step in the
release pull request's deployment notes. If no notice can be sent before the deploy, change
`#changes` first (both documents, both languages) so it no longer promises one.

**Cloudflare.** The privacy policy names Cloudflare, Inc. as the content delivery network and
proxy in front of the **web pages only** (`#recipients`, `#data-technical`, `#transfers` and its
log retention in `#retention`): on 2026-11-18, `curl -sI https://portfolio.gentil.tech/` answered
`server: cloudflare` with a `cf-ray`, while `https://api.portfolio.gentil.tech/health` and both
staging hosts answered `server: railway-hikari` (Railway directly). The cookies page names it too
(`#summary`: it "sets no cookie and adds no script on this site"). The texts say that Cloudflare
receives the requests and the pages sent back, not that it changes them, stores anything in the
browser or adds a script: no Cloudflare cookie, no Web Analytics beacon (which "no analytics" in
the privacy policy and the cookies page rules out), and **two zone settings that Cloudflare turns
on by default must stay off**. Both were on when checked on 2026-11-18: turn them off before
deploying the release that names Cloudflare in the privacy policy.

- **Email Address Obfuscation** (Security, **Settings**, "Email Address Obfuscation" off, or a
  configuration rule that turns it off for the hostname). On, it replaced every email address of
  `/legal`, `/legal/privacy` and `/legal/terms` (the publisher's contact, the host's) with a
  `/cdn-cgi/l/email-protection` link and added its script `email-decode.min.js` to those pages:
  without JavaScript, and for anything reading the HTML, the legal notice's contact address read
  "[email protected]".
- **Network Error Logging** (Account home, **Network**, "Network Error Logging Monitoring" off,
  or the zone setting `nel`). On, every answer carries `NEL` and `Report-To` headers: the
  browser keeps a reporting policy for 7 days and sends Cloudflare a report when a connection to
  the site fails, which neither the privacy policy nor the cookies page lists.

Run the checks after changing a Cloudflare setting, and after each production deploy (also in
[Verify a deploy](#verify-a-deploy)):

```bash
for url in https://portfolio.gentil.tech/ https://api.portfolio.gentil.tech/health; do
  echo "$url"; curl -s -o /dev/null -D - "$url" | grep -iE '^(server|cf-ray|set-cookie|nel|report-to):'
done   # server (and cf-ray for the pages) only: no set-cookie, nel or report-to
for p in / /legal /legal/privacy /legal/terms /legal/cookies '/legal?lang=fr'; do
  printf '%s ' "$p"; curl -s "https://portfolio.gentil.tech$p" | grep -c 'cdn-cgi\|cloudflareinsights\|__cf_email__'
done   # 0 for each page: no address rewritten, no script added
```

The pages without an email address (the landing page, `/legal/cookies`) show nothing either way:
check the legal notice, the privacy policy and the terms. If one of these features has to stay on,
the texts change first, in both languages, with a `LEGAL_VERSION` bump: Email Address Obfuscation
in `#recipients` (Cloudflare rewrites the email addresses shown on the pages and adds a script that
decodes them), Network Error Logging in `#recipients` and on the cookies page (the reporting policy
the browser keeps, for 7 days).

Putting the API (or staging) behind Cloudflare changes the texts: say so in the privacy policy
(both languages; the API carries the session cookie and every form's data), bump `LEGAL_VERSION`,
and set `CLIENT_IP_HEADER=CF-Connecting-IP` on that API (see
[Booking protection](#booking-protection)). A Cloudflare cookie (`__cf_bm` of Bot Fight Mode, the
`cf_clearance` of a passed challenge) or Web Analytics goes in the cookies page and the privacy
policy first.

**Who pays.** The Terms say candidates never pay (article L5321-3 of the Labour Code forbids
asking job seekers for anything in return for placement services) and that the service is free
for recruiters for now, who are told before any paid feature applies to them. A paid feature can
only ever be for recruiters, and the Terms (and `LEGAL_VERSION`) change before it ships.

**Annual placement report.** The Terms name the activity placement (article L5321-1: the site
puts job offers and job seekers in touch, and is not a party to the employment contract). A
private organisation that runs placement sends the préfet a report **every year before 31 March**
on the year before (article R5323-8): its placement turnover and that turnover's share of its
total, and the number of job seekers received, placed and still registered on 31 December, by sex
and age. Ask the DDETS of the publisher's département (in Île-de-France, the unité départementale
of the DRIEETS) for the model of the statement, which an arrêté sets, and whether "not known" is
accepted for sex and age: the site collects neither, and must not start to (data minimisation,
and a sex or age field next to hiring invites discrimination, article L5321-2). Placement turnover
is 0 while the service is free, and placements are not tracked (the site never learns who was
hired). The counts, from the production database, in January (counts only, nothing about a
person):

```bash
mongosh "<production MONGO_URL>" --quiet --eval '
  const year = 2026;
  const from = new Date(Date.UTC(year, 0, 1)), to = new Date(Date.UTC(year + 1, 0, 1));
  const idAt = (date) => ObjectId.createFromTime(Math.floor(date.getTime() / 1000));
  printjson({
    year,
    portfoliosCreated: db.domains.countDocuments({ _id: { $gte: idAt(from), $lt: idAt(to) } }),
    portfoliosOn31December: db.domains.countDocuments({ _id: { $lt: idAt(to) } }),
    recruiterSpacesOpened: db.users.countDocuments({ "recruiter.enabledAt": { $gte: from, $lt: to } }),
    journeysStarted: db.workflowinstances.countDocuments({ createdAt: { $gte: from, $lt: to } })
  })'
```

A portfolio has no creation date of its own: its `_id` holds the second it was created. Job
seekers received are the portfolios created that year; those still registered on 31 December are
the portfolios created before it that still exist, so run it early in January (a portfolio goes
with its account). `recruiterSpacesOpened` and `journeysStarted` (a recruiter's first step on a
candidate's journey; gone with either account) describe the other side and the activity; keep the
answer with the report.

## Google Calendar appointments

The admin panel's **Appointments** tab connects the owner's Google Calendar (OAuth code flow in a
Google popup); visitors then book free slots on the `/hire` page, and the API creates the events
(with a Google Meet link and an invitation to the visitor and to the owner's account email: Google
never emails an event's organizer, so the owner only gets the invitation when the schedule books
into a calendar other than their sign-in account's primary one), and an email reminder Google sends
the owner a minute after the booking (4 weeks before a meeting further away), which tells them in
every case. The API exchanges the authorization
code with the OAuth client's secret, so the feature is **off until `GOOGLE_CLIENT_SECRET` is set**:
the API boots without it, the tab says Google Calendar is not configured, and `/hire` offers no
slots.

To enable it on Railway (services `portfolio api` and `portfolio api develop`):

1. In the Google Cloud console, project of the sign-in OAuth client (the `GOOGLE_CLIENT_ID` /
   `PUBLIC_GOOGLE_CLIENT_ID` client, `DEFAULT_GOOGLE_CLIENT_ID` from `common/` unless overridden):
   - **APIs & Services, Library**: enable the **Google Calendar API**.
   - **Google Auth Platform, Data access**: add the scope `https://www.googleapis.com/auth/calendar`.
   - **Audience**: set the publishing status to **In production**. While an external app is in
     _Testing_, Google expires its refresh tokens after 7 days and appointments stop working until
     the owner reconnects. An unverified app still works for the owner, behind a warning screen.
   - **Clients**, the web client: copy its **client secret**. No redirect URI is needed (the popup
     flow uses `postmessage`); the web origin must already be an **Authorized JavaScript origin**
     for sign-in.
2. On the API service, add `GOOGLE_CLIENT_SECRET` (sealed) and deploy. A value with quotes or
   spaces stops the deployment with `GOOGLE_CLIENT_SECRET must be the bare client secret ...`.
3. Sign in as the domain admin, open **Admin, Appointments, Connect Google Calendar**, accept the
   calendar permission, then create a schedule.

The OAuth tokens are stored on the owner's user document in MongoDB (`googleCalendar`), excluded
from every query unless the calendar service asks for them, and never returned by the API.
**Disconnect** deletes them and revokes the grant at Google (best effort), as does deleting the
account at `/account`. If Google answers that it "did not grant offline access" (no refresh
token because the app was authorized before), remove the app under
[Google account, Third-party connections](https://myaccount.google.com/connections) and connect
again.

When Google refuses the stored grant, the API clears it: `invalid_grant` from the token endpoint
(the owner removed the app, the refresh token expired, or it was issued to another OAuth client,
e.g. after changing `GOOGLE_CLIENT_ID`), `unauthorized_client`, or a 401 from the Calendar API. The
tokens are deleted and revoked at Google (Google only sends a refresh token with the first consent
of a grant, so reconnecting needs the old grant gone), `googleCalendar.revokedAt` records when, and
the request gets a 409 `Google Calendar access was revoked or has expired. Reconnect Google
Calendar`, logged at `warn` without a stack, next to one `Google refused the stored Google Calendar
grant: connection cleared` line with the reason. The Appointments tab then shows **Disconnected**
and **Reconnect Google Calendar**, and `/hire` says online booking is not available until the owner
reconnects. A wrong `GOOGLE_CLIENT_SECRET` (`invalid_client`) is not taken for a refused grant:
reconnecting would not fix it, so it stays a 500 logged at `error`, and the tokens are kept.

### Booking protection

Booking is public, and every booking makes Google email an invitation from the owner's calendar
to the address the visitor typed (and to the owner's account email, a guest of every booking). `POST /appointments/book` therefore:

- **Reserves the slot in MongoDB** (collection `appointmentbookings`, unique index on schedule and
  start) after re-checking Google FreeBusy and before creating the event, so two concurrent
  requests for one slot cannot both book it (the second gets `409`), nor can two overlapping
  bookings of the owner, whatever calendar their schedules use. The event gets the reservation's
  id, so Google can always be asked whether it exists: when Google refuses the event the slot is
  freed, but after a timeout or a network error the reservation stays until Google confirms there
  is no event. Cancelling from **Admin, Appointments** frees the slot at once. An event deleted or
  moved in Google Calendar directly frees it too: the next booking of the slot asks Google and
  drops the stale reservation. Reservations hold a keyed hash of the visitor's email, not the
  address, and MongoDB deletes them when the slot is over.
- **Rate limits requests** per visitor IP address (10 per hour, counting every request; IPv6 per
  /64) and per email address (5 per 24 hours, counting only requests for a free slot, so nobody
  can use up someone else's quota with invalid requests; case, `+tag` and Gmail dots ignored),
  and caps an email at 2 upcoming bookings per schedule (bookings whose event was deleted in
  Google Calendar no longer count). The availability lookups of `/hire` (free dates and free
  times, each one a Google FreeBusy call) share a limit of 300 per hour per IP address. Over a
  limit the API answers `429` (with `Retry-After`, which CORS lets the browser read, for the rate
  limits) and `/hire` shows its message. Counters live
  in MongoDB (`ratelimitcounters`, deleted when their window ends), so they hold across restarts
  and deploys. Change the values in `server/services/appointmentBookings.ts`.
- **Hashes** emails and IP addresses with an HMAC keyed from `JWT_SECRET`, so a database dump
  alone cannot be matched against a list of addresses. Changing `JWT_SECRET` (which also signs
  everyone out) resets the rate limit counters and the per-email caps.

The per-IP limit needs the visitor's address. Behind Railway's edge proxy the TCP peer is the
proxy, so the API reads the `X-Real-IP` header Railway sets instead: that is the default of
`CLIENT_IP_HEADER` whenever Railway's `RAILWAY_PROJECT_ID` variable is present, so nothing needs
setting on Railway. Put another proxy in front of Railway (e.g. Cloudflare's orange cloud on the
custom domain) and `X-Real-IP` becomes that proxy's address: set `CLIENT_IP_HEADER` to the header
holding the visitor's address there (`CF-Connecting-IP` for Cloudflare; today Cloudflare fronts
the web pages only, not the API, so the default holds: see [Legal pages](#legal-pages)). For a
list header such as `X-Forwarded-For`, the API takes the last entry, the one the closest proxy appended. Only name a
header that proxy overwrites: anything else, a client can set to any value. An invalid header
name stops the deployment with `CLIENT_IP_HEADER must be an HTTP header name`.

## Résumé import

Portfolio owners can upload a PDF résumé: the API (`POST /experiences/import`) has **Claude Haiku
5.5** (`claude-haiku-5-5`) extract its experiences and answers with drafts the admin reviews; only
the drafts the owner accepts are saved (through `POST /experiences`). Every import is billed to
the operator's Anthropic API key, so the feature is **off until `ANTHROPIC_API_KEY` is set**: the
API boots without it, `GET /experiences/import` answers `enabled: false` and `POST` answers 404.

To enable it on Railway (services `portfolio api` and `portfolio api develop`):

1. In the [Claude Console](https://platform.claude.com), **Settings, Workspaces**: create a
   workspace for this site (e.g. `portfolio`) and give it a **monthly spend limit** (e.g. $5).
   Spend limits cannot be set on the Default workspace, hence the dedicated one. Once the limit is
   reached, Claude refuses the workspace's requests until the next month: imports answer `503`
   ("Résumé import is temporarily unavailable"), are not counted against anyone's imports (each
   still uses one of the user's attempts of the day), and each one logs
   `Résumé import: the Claude API refused the request` at `error`.
2. In that workspace, **API keys**: create a key (it is scoped to the workspace, so its usage
   counts against that limit).
3. On the API service, add `ANTHROPIC_API_KEY` (sealed) and deploy. A value with quotes or spaces
   stops the deployment with `ANTHROPIC_API_KEY must be the bare API key ...`. The startup line
   `Running at ...` then says
   `"resumeImport":"on (3 per user per 30 days, 30 per day, 10 attempts per user per day)"`.

| Variable                      | Default | What it does                                                                             |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`           | unset   | The key billed for imports; the feature is off without it. Never logged, returned or traced |
| `RESUME_IMPORT_MONTHLY_LIMIT` | `3`     | Imports per user per 30-day window (windows are fixed, not rolling); `0` turns the feature off |
| `RESUME_IMPORT_DAILY_LIMIT`   | `30`    | Imports per UTC day across all users, a cap on the site's daily spend; `0` turns the feature off |
| `RESUME_IMPORT_ATTEMPTS_PER_DAY` | `10` | Attempts per user per UTC day, whatever their outcome and never given back, so no failure can be retried in a loop; `0` turns the feature off (there is no unlimited setting) |

**Cost.** A one- or two-page résumé costs about **$0.002 to $0.005** per import (Haiku 5.5: $0.10
per million input tokens and $0.50 per million output tokens for prompts up to 100K tokens; a PDF
page is roughly 2,000 to 5,000 tokens, text and page image together). The API caps each import at
a 4 MB PDF, about 10 pages (60,000 input tokens, counted for free before the paid call, a longer
PDF gets `422`) and 16,000 output tokens, and sends the paid request once (never retried), so one
import costs at most about $0.015 (60,000 × $0.10 + 16,000 × $0.50 per million). Every paid
request that may have been billed counts against both limits (see below), so at the defaults the
site spends at most 30 imports a day (about $0.42), each user at most 3 per 30 days, and the
workspace's spend limit is the hard stop. Each answered import logs one line,
`Résumé import {"experiences":…,"inputTokens":…,"outputTokens":…,"estimatedCostUsd":…,"stopReason":…}`,
with nothing about the résumé or its owner.

**What counts.** The limits are MongoDB counters (`ratelimitcounters`, like the booking limits);
over one, the API answers `429` with `Retry-After` and when it resets. The paid call is streamed,
with a 3-minute deadline for the whole answer (no shorter timeout cuts a long résumé short).
Counting the tokens first (free) has a 30-second deadline, its retry included, so the API answers
within 3.5 minutes; the browser waits 4.5 (`RESUME_IMPORT_TIMEOUTS` in portfolio-common), so an
answer that counted is not thrown away.

- **Counted:** everything once the paid request has been sent, since Anthropic may have run, and
  billed, the model: drafts or nothing found (`200`), a refusal or an answer cut short at 16,000
  tokens (`422`), and a call that did not finish: the deadline passed, the connection failed or
  dropped, or the stream reported an error after it started (`503` "The import did not finish. It
  still counts toward your imports...", logged at `warn` as
  `Résumé import: the Claude call did not finish, the import counts`, with `deadlineReached`).
- **Given back:** anything before the paid call (the free token count failing, a PDF over ~10
  pages), and a paid request Anthropic refused with an error status, which is not billed: overloaded
  (`529`), `5xx` or rate limited (`429`), logged at `warn`; or the key, the model, the request or
  the spend limit refused (`400`/`401`/`403`/`404`), logged at `error` with the API's message (key
  masked): fix the key or the limit. Both answer `503` ("temporarily unavailable"). A request the
  API rejects while counting tokens (`400`, e.g. a schema it does not accept) is also an operator
  problem: `503`, logged at `error` with the API's message.
- **Attempts:** each request that passes the file checks and both limits uses one of the user's
  `RESUME_IMPORT_ATTEMPTS_PER_DAY` (10) attempts of the UTC day, whatever happens next, and
  attempts are never given back (`429` past them). Outages or abuse cannot loop on what is given
  back: the paid calls Anthropic refused cost nothing, and each user makes at most 10 a day.
- Invalid files never reach Claude or the counters: not base64 or not a PDF (`422`), over 4 MB
  (`413`).

**Silent connections.** The API sends nothing while Claude reads (up to 3.5 minutes, the job
description import alike). Two timers could cut the connection meanwhile:

- Bun's `idleTimeout`, 30 s (Elysia's default; `app.ts` does not set it). Bun 1.4.4 does not apply
  it while it handles a request that has a body (`Content-Length` above 0, or chunked), which both
  imports have: only body-less requests (a GET, a POST with `Content-Length: 0`) are cut, and the
  timer starts again once the answer is sent. `server/tests/resumeImport.test.ts` ("over a real
  connection") pins it: an import answered after the idle timeout must reach the client. If a Bun
  upgrade breaks it, give the imports a timeout of their own (`server.timeout(request, seconds)`,
  above the two deadlines, 255 s at most), not a longer `idleTimeout` for every connection.
- Railway's edge: a request may last 15 minutes while data flows and is closed after 5 minutes with
  no data transferred ([Specs & Limits](https://docs.railway.com/networking/public-networking/specs-and-limits)),
  above the 3.5 minutes. A community report (July 2026, not confirmed by Railway) describes the
  edge closing requests that sent no response byte for 60 s, answered `499`: if imports longer than
  a minute fail in production, look for `499` with `totalDuration` about 60000 in the HTTP logs of
  the API service.

**Request size.** The API's body cap is 6 MB (Bun answers `413` above it, before the app runs): a
4 MB PDF is about 5.4 MB of base64 JSON, so the two PDF imports, `POST /experiences/import` and
`POST /jobs/import` (see "Job description import" below), take bodies up to that cap. Without a
valid session (the `auth` cookie's JWT is verified: signature, expiry, subject) they get `401`
before their body is read. Every other route keeps a 1 MB cap: checked on `Content-Length`
before the body is read, then on the bytes actually read, so a body without a usable
`Content-Length` (chunked, as a proxy or an HTTP/2 client may forward it, or with the header
repeated) stops at 1 MB too; both answer `413` with CORS headers.

**Traces.** Request and response bodies, cookies, the `Authorization` header and the URL's query
string (`url.query`, and what follows `?` in `url.full`) are dropped from each span as it ends,
before the batch processor queues it for export (and again in the exporter), so queued spans never
hold a PDF, nor what a person typed in a query string.

## Job description import

Recruiters can upload a job description as a PDF: the API (`POST /jobs/import`) has the same
model (**Claude Haiku 5.5**) extract a job posting draft, which the recruiter completes and saves
through `POST /jobs` (nothing is saved by the import). It uses the same `ANTHROPIC_API_KEY`, so it
is off while the key is unset (`GET /jobs/import` answers `enabled: false`, `POST` answers 404),
and follows the résumé import's rules above: the same file checks (4 MB, about 10 pages), the
same deadlines, a paid request sent once, and the same rules for what counts and what is given
back. The startup line `Running at ...` says `"jobImport":"on (...)"` or why it is off.

| Variable                      | Default | What it does                                                                             |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `JOB_IMPORT_DAILY_LIMIT`      | `30`    | Imports per UTC day across all recruiters, a cap on the site's daily spend; `0` turns the feature off |
| `JOB_IMPORT_ATTEMPTS_PER_DAY` | `10`    | Attempts per recruiter per UTC day, whatever their outcome and never given back; `0` turns the feature off |

**Plans.** Each recruiter's own allowance is set by their plan (`RECRUITER_PLANS` in
portfolio-common), not by a variable: every recruiter is on the free plan, which includes **3
imports for the lifetime of the account** (`users.recruiter.jobImportsUsed` counts them). Past them
the API answers `402` ("Paid plans are coming soon"), without calling Claude. At the defaults the
site spends at most 30 job imports a day (about $0.45), on top of the résumé imports.

## Step suggestions

In the admin tab "Hiring journey", a portfolio owner can suggest a step that does not exist yet
("Missing a step? Suggest a step"): the API (`POST /workflow/step-suggestions`) files it as an
issue labelled `enhancement` in the project's GitHub repository, with the operator's token, so
owners need no GitHub account. The feature is **off until `GITHUB_ISSUES_TOKEN` is set**
(`GET /workflow/step-suggestions` answers `enabled: false`, `POST` answers 404, and the editor
does not show the form). The startup line `Running at ...` says `"stepSuggestions":"on (...)"` or
why it is off.

To turn it on:

1. On GitHub, create a **fine-grained personal access token** (Settings → Developer settings →
   Fine-grained tokens): resource owner = the repository's owner, repository access = **only**
   the repository the issues go to, repository permissions = **Issues: Read and write** (GitHub
   adds Metadata: Read-only), nothing else. Give it an expiration and note the date: once it
   expires, suggestions answer 503 and the API logs `Step suggestion: GitHub did not create the
   issue` at error level with `"status":401`.
2. On the API service, add `GITHUB_ISSUES_TOKEN` (sealed) and deploy. A value with quotes or
   spaces stops the deployment with `GITHUB_ISSUES_TOKEN must be the bare GitHub token ...`.
3. Set `GITHUB_ISSUES_REPO` (`owner/name`) only to file the issues somewhere else than
   `lomithrani/portfolio`.

What an owner writes is untrusted and becomes public if the repository is: the form says so. In
the issue, their text is only ever inside fenced code blocks (no mention notifies anyone, no
link, image or HTML is rendered), nothing invisible is filed (control characters, zero-width,
bidi and "tag" characters, which could hide text from a reader of the issue), and the issue
names nobody (no name, address or portfolio): the API's log line `Step suggestion filed` holds
the user id and the issue number. Issues are capped at **3 per owner and 20 for the whole site
per UTC day** (429 with `Retry-After`; constants of `server/services/stepSuggestions.ts`). A
suggestion GitHub refused is given back to both limits; one GitHub did not answer in time is
not (the issue may exist). While GitHub refuses (an expired token), an owner's suggestions stop
being sent after 10 requests in a UTC day. If the repository is renamed or transferred, GitHub
answers with a redirect, which is not followed: update `GITHUB_ISSUES_REPO` (the log line shows
`"status":301` or `307`). The token is sent to `api.github.com` only, never follows a redirect,
and never appears in a response or a log line (`tests/stepSuggestions.test.ts` fails if it does).

## Feedback

Any signed-in person (a candidate, a recruiter, or an account with neither) can send feedback
from "Send feedback" in the account menu or in the footer of every page: the API
(`POST /feedback`) files it as an issue in the same repository as the step suggestions, with the
same `GITHUB_ISSUES_TOKEN`, so it is **off until the token is set** (`GET /feedback` answers
`enabled: false`, `POST` answers 404, and the entry points are not shown). Signed-out visitors
never see them. The startup line `Running at ...` says `"feedback":"on (...)"` (with whether Claude
sorts it) or why it is off.

Each issue gets the label `feedback` and one of the repository's **issue types**: `Bug`,
`Feature` or `Task`. They must be issue types of the repository (`lomithrani/portfolio` has
exactly these three): when GitHub refuses the type, the API files the issue again once without
one, with the label `bug`, `enhancement` or `task` instead (the log says `Feedback: GitHub refused
the issue type, filed again with a label instead`). Create the `feedback` label (and those three,
if the repository has no issue types) on the repository (Issues → Labels) before turning the
feature on. The token needs nothing more than for step suggestions: **Issues:
Read and write** on that one repository.

**Sorting (optional).** With `ANTHROPIC_API_KEY` set, the API first asks **Claude Haiku 5.5**
whether the text is a bug, a feature request or a task, and for a short neutral title and summary
in English (`GET /feedback` says `classifies: true`). That is one small call per feedback, a
fraction of a cent, on the key's workspace and its spend limit. Without the key, or when Claude
fails, refuses, answers something unusable or takes too long, the feedback is still filed, as a
`Task` titled with the first words of the message, and the issue says it was not sorted
automatically. The site has Claude sort at most **60 feedbacks a UTC day**, counted when the call
is made and never given back (even when GitHub then refuses the issue); past that, feedback is
filed without sorting (`Feedback: the classifications of the day are used up`).

What a person writes, and what Claude derived from it, is untrusted and public if the repository
is: the dialog says so and links to the privacy policy (`/legal/privacy#data-feedback`). The issue
follows the step suggestions' rules (text only inside fenced code blocks, nothing invisible filed,
a title that cannot mention or reference anyone) and names nobody: no name, email, account id or
portfolio address. It carries the page's route id (`/[domain]/experiences`, never the real path),
the site language, the browser's name and major version and the operating system (read by the API
from the User-Agent, never filed raw), the screen size and the light or dark theme. The user id,
the issue number and its kind are in the API's log only (`Feedback filed`); a refusal by GitHub is
logged as `Feedback: GitHub did not create the issue`, as for step suggestions.

Limits, per UTC day (429 with `Retry-After`; constants of `server/services/feedback.ts`): **5
feedbacks per account, 30 for the whole site, and 10 requests sent to GitHub per account**
(attempts, never given back: the second request of an issue filed again without its type takes
one too). As for step suggestions, a feedback GitHub refused is given back to
the first two limits, one GitHub did not answer in time is not (the issue may exist), redirects are
never followed, and the token never appears in a response or a log line. Claude gets 8 s and GitHub
12 s for both its requests, so the answer comes well before the 30 s Bun lets a connection stay
silent (Elysia's `idleTimeout`; Bun does not apply it while it handles a request with a body, as
this one has, see [Résumé import](#résumé-import), but the budget does not count on that).

## Matching

Matching on open jobs (Path 2, CLAUDE.md "Matching") is **off until `MATCHING=true`**: its routes
(`GET`/`PUT /discovery`, `GET /discovery/card`, `POST`/`DELETE /discovery/consent`,
`PUT /jobs/:id/matching`, `GET /matching/reviews` and `PUT /matching/reviews/:id` for now) are not
registered, so they answer 404 as routes that do not exist whatever the request (`/swagger` does
not list them), `POST /jobs` ignores its `matching`, nothing of it is read or written, and the
metrics `discoverable_candidates`, `matching_job_postings`, `matching_job_reviews` and
`active_matches` are 0. What a job's changes do to its matches (closed, deleted, edited) runs
whatever the flag: it only ends, drops or deletes. The flag is read when the API starts: a change
takes effect at its next deploy. The startup line `Running at ...` says `"matching":"on (1 job
reviewer)"` (how many reviewers, never who) or why it is off.

**Reviewers.** Every job a recruiter puts into matching is read by hand before it reaches any
candidate: it starts pending, and only a reviewer's approval proposes it (a rejection carries a
reason the recruiter reads). The reviewers are the accounts whose email is in
`MATCHING_REVIEWERS` (comma-separated, compared without case; never logged: a wrong entry stops the
API naming its place in the list, not its value). Without one, the API warns at startup
(`MATCHING=true without MATCHING_REVIEWERS`) and no job is ever proposed. A reviewer reads the jobs
waiting with `GET /matching/reviews` (the oldest first: the posting and the domain of its
recruiter's email, nothing of any candidate) and decides with `PUT /matching/reviews/:id`
`{ decision: 'approve' | 'reject', reason?, version }`, on the version read (an edit since: 409).
No screen does it yet: until the review screen ships, a reviewer calls the API signed in (the
`auth` cookie of their session). The `matching_job_reviews` metric counts the jobs waiting: nothing
else tells the reviewers (no email is sent). An approved job its recruiter edits (its description,
or another field no criterion reads: its terms are locked) waits for a review again.

- **Staging** (`portfolio api develop`): set `MATCHING=true` to try it as its parts land. No page
  calls its routes yet: they are for the screens that come next, and for the tests.
- **Production** (`portfolio api`): leave it unset. It is turned on only once its privacy policy
  and terms sections are published (with a `LEGAL_VERSION` bump) and the data protection impact
  assessment is signed: a candidate's consent must point to published texts. Public transport
  times then come from HERE or from nowhere, never from Transitous (see
  [Travel times](#travel-times), "Matching").

The first opt-in creates the `discoveryprofiles` collection (one document per account that turned
discovery on or off or set its anonymous card), the first decision the `matches` collection (one
per job and candidate, removed by MongoDB once its `expiresAt` is past: a decision no mutual
interest came of 6 months after it at most, a mutual interest 3 months after it ended,
`MATCH_RETENTION` of `common/models/matching.ts`, which the privacy policy will state), and a job
put into matching gets a `matching` field: no migration. Mongoose adds the new indexes at startup
(`status_1_matching.enabledAt_1_publishedAt_-1` and the partial one on the reviews waiting on
`jobpostings`, the unique one and the TTL on `matches`); the index it replaces,
`status_1_publishedAt_-1`, stays until it is dropped by hand, harmless meanwhile:
`db.jobpostings.dropIndex('status_1_publishedAt_-1')`. Turning `MATCHING` off again proposes
nobody to anyone, and keeps those documents as they are: candidates find their choice again when
it is turned back on (paused until they sign in, if that was over 180 days before), and account
deletion removes them whatever the flag.

## Travel times

The perfect job has a "Commute" criterion: the travel time an owner accepts a week, from an
address they give to the address of a job. Computing it needs outside services, so it is **off
until `COMMUTE_TIMES=true`**: `GET /perfect-job` then answers `commute: { enabled: false }`, the
admin tab does not let the criterion be switched on, and a commute already saved does not count
in a job's score.

The landing page presents the commute as one of the criteria a job is scored against
(`client/src/routes/(site)/page.messages.ts`: the first "Calls you can stop taking" card
(`spared.commute`), the "The job gets a score" step (`link.steps.score`), the journey demo's label
and caption (`link.demo`) and its recording `client/static/landing/demo-journey.*`, and the FAQ
answer about the commute address (`faq.recruiters.address`). Run the production API with
`COMMUTE_TIMES=true`, or take those mentions out.

| Service | Used for | Key | What it receives |
| --- | --- | --- | --- |
| Géoplateforme, IGN (`data.geopf.fr`) | Finding addresses (as they are typed, and when they are saved or scored); the way by car and on foot (the time by bike is estimated from the distance on foot, at 15 km/h) | none | The owner's address as typed, the address of a job posting, and pairs of points |
| HERE Public Transit API (`transit.router.hereapi.com`), only with `COMMUTE_TRANSIT=here` | Journeys by public transport | `HERE_API_KEY` | Pairs of points, and the key |
| Transitous (`api.transitous.org`), only with `COMMUTE_TRANSIT=transitous` | Journeys by public transport | none | Pairs of points, and `COMMUTE_CONTACT` as User-Agent |

None receives a name, an account or an IP address of the people concerned: the requests come
from the API, never from the browser.

- **Géoplateforme** is the French state's map service, open to any use, limited to 50 geocoding
  and 5 route requests a second for one IP. It covers France, like the job postings. It has no
  public transport.
- **Public transport** needs one of two services, chosen with `COMMUTE_TRANSIT`. Without one,
  owners can pick bike, car and on foot, and the tab says public transport is not available.
  - **HERE** (`COMMUTE_TRANSIT=here`) is a commercial service: the choice for a site that is
    not open source or may earn money. Create an account on the
    [HERE platform](https://platform.here.com/), an app in it, and an API key for that app:
    that key is `HERE_API_KEY` (seal it). Each journey asked is one transaction of the Public
    Transit API: 5,000 a month are free, then about €2.33 per 1,000 (prices of April 2026:
    check [HERE's pricing](https://www.here.com/get-started/pricing)). It answers from the
    timetables of the operators it [lists for France](https://docs.here.com/transit/docs/coverage-transit)
    (SNCF, the regional trains and the networks of about fifty urban areas): outside them it
    finds no journey, and the way on foot counts. Its
    [terms](https://legal.here.com/en-gb/terms/here-platform-terms) let a result be kept for
    30 days, which is how long a way is kept here. The key travels in the URL of each request,
    as HERE asks: the API never logs that URL and traces no outgoing request. A key HERE
    refuses shows in the logs as `Travel times: no answer` with `transit answered 401` (or
    `403`), never the key.
  - **Transitous** (`COMMUTE_TRANSIT=transitous`) is run by volunteers. Its
    [usage policy](https://transitous.org/api/) is for **open-source, non-commercial** projects
    with light use (it asks to be told above 720 route requests a day), a User-Agent that says
    who asks (`COMMUTE_CONTACT`), and a link to its sources where the times are used. Set it
    only if the site fits.

  The Hire page credits the service in use next to the commute, and the owner's tab names it
  where it says who the address goes to. The privacy policy names both.

What keeps the use light: an address is looked up once (the owner's on save, a posting's the
first time it is scored or checked in the job editor) and a way is asked for once, then kept
for 30 days (places: 90) in the `commutecaches` collection, under keys that do not show the
question. Every one of those requests counts against `COMMUTE_DAILY_LIMIT` (500 a day for the
whole site by default: with HERE, at most 500 journeys a day, so at most about 15,000 a month;
lower it to stay within the free allowance whatever happens, e.g. `160`); over it, and while a
service does not answer, the commute is left out of the scores (recruiters see "Could not be
computed right now: not counted") instead of blocking anyone. The API logs `Travel times: no
answer` at warn level with the kind of request and the reason, never the address.

**Matching.** Matching on open jobs (Path 2, see [Matching](#matching), off until `MATCHING=true`)
scores the jobs open to it against the candidates who opted in: many pairs in one read, where a
journey's job match step scores one, and a pair never asked can take some 20 seconds (a place
looked up, then its ways), in a request Bun cuts after 30 seconds without data. So its reads never
ask a service: they read only the travel times kept (`cachedCommuteContext` of
`server/services/commute.ts`, which also says whether what is missing can still be found), and
what a pair still needs is asked in the background (`warmCommute`; `warmOffice` looks a job's
office up when matching is turned on for it, so that each candidate then needs only the ways). A
warm-up reads the candidate's address when it runs, not when it was asked for, and asks nothing
once they withdrew their consent to matching, let it lapse or deleted their account. Warm-ups run
one at a time, with a pause of 400 ms after each that asked something (the Géoplateforme takes 5
route requests a second from one address, and a pair asks up to two at once). A pair already
waiting takes no second place; at most 100 wait, 20 of them for one account: beyond, a warm-up is
dropped (a later read asks for it again) and the API logs `Travel times: warm-up dropped` with the
reason (`queue full` or `account share`) and how many were dropped, one line a minute at most. A
warm-up that fails (the database did not answer) logs `Travel times: warm-up failed` with the
error's name only, and the next warm-up goes on.

Each request a warm-up sends counts against three caps: 100 a day for the account whose read
wanted it (`discovery-commute` counters, keyed by a hash of the account, so that one account
cannot use up matching's day), half of `COMMUTE_DAILY_LIMIT` for all warm-ups together
(`MATCHING_COMMUTE_SHARE`, the `discovery-commute-site` counter), and `COMMUTE_DAILY_LIMIT`
itself. The other half is kept for the job match steps of journeys: however busy matching is, a
page for recruiters keeps its travel times, and a candidate's commute deal-breaker keeps counting
there, until journeys alone reach the limit. Once matching's half is used, warm-ups wait for the
next UTC day, and matching shows the commutes it has not kept as unknown (a recruiter's feed holds
back a candidate whose deal-breaker commute is unknown). A pair costs up to three requests (car,
on foot, public transport), an office one or two the first time: size `COMMUTE_DAILY_LIMIT` for
twice the new pairs a day brings (each is then kept 30 days), and with HERE, for its monthly
allowance. The failure memo applies too: a service that did not answer is left alone for 10
minutes by warm-ups as by journeys.

Matching never asks Transitous, nor reads what it answered a journey: its usage policy is for
open-source, non-commercial projects, which a site that matches candidates with recruiters'
jobs may not stay. With `COMMUTE_TRANSIT=transitous`, matching computes the commute by the other
modes a candidate accepts, whose time is then the most the way can take: it is used only when the
commute matches with it. Otherwise (and for a candidate who accepts public transport alone)
matching cannot tell, and treats that commute as unknown, never as not counted, so a candidate
with a commute deal-breaker is held back from recruiters' feeds for those jobs instead of being
proposed for jobs anywhere. The API warns at startup when `MATCHING=true` is set with it. Before
matching is turned on in production, choose HERE (`COMMUTE_TRANSIT=here` with its key, priced
above) or no public transport (`COMMUTE_TRANSIT` unset).

**Address search.** The two forms that take an address (the commute of the perfect job, the
office of a job posting) search it as it is typed: `POST /addresses/search` answers with the
addresses the Géoplateforme knows, and `POST /addresses/office` tells a recruiter where their
posting's office is found (its street, only its town, or nowhere). Both are for signed-in
accounts and go through the API; they are POSTs so that what is typed travels in a body, which
neither the traces nor the host's request logs keep, never in a URL. A posting's postal code and
town narrow the search while it finds a good match there; otherwise it is asked again without
the postal code, then without the town (the geocoder refuses a town it does not know as a
commune, such as "La Défense"): one request to the map service, at most three. The searches are
not counted against `COMMUTE_DAILY_LIMIT` (typing an address takes a dozen): they have limits of
their own, 60 a minute and 500 a day per account, and 10,000 a day for the site
(`server/services/addressSearch.ts`), and what is typed is never logged or kept. An office
looked up is kept and counted like at scoring, at most 40 new lookups a day per account (a
street not found takes a second one, for its town). Both are off with travel times: nothing is
sent to the map service then, and the fields are plain text fields.

An owner's address is as private as the rest of their perfect job: only they read it. A
recruiter learns whether their job's commute matches, which says something about where the
owner is; the tab tells owners they can give a nearby place instead of their home.

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

`none` also removes the cookie's protection against cross-site request forgery (CSRF): the browser
then sends the session with requests that **any** website makes to the API, such as a hidden HTML
form. What still stops those is the API itself: it answers `415` to every `POST`, `PUT`, `PATCH`
or `DELETE` whose body is not JSON (a form cannot send JSON, and another site's script cannot
without a CORS preflight, which only the `ALLOWED_DOMAINS` origins pass). So with `none`, keep
`ALLOWED_DOMAINS` to your own web origins. `strict` (the default) and `lax` do not have this
exposure.

## Deploy branch and Wait for CI

### Branch

The production services deploy from **`main`**, the staging services from **`develop`** (service
**Settings**, **Source**, branch). CI runs on pushes and pull requests to both.

### Releases

Work goes to `develop`: every pull request targets it (`develop` is the repository's default
branch) and is squash-merged. A release brings `develop` into `main`:

1. Check staging (`develop.portfolio.gentil.tech`) has what you want to ship. When the release
   bumps `LEGAL_VERSION` (`git diff <latest tag> develop -- common/models/legal.ts`), email the
   accounts first, before running the workflow (the merge deploys production on its own): see
   "Tell the accounts before a bump reaches production" under [Legal pages](#legal-pages).
2. Run the `Release` workflow (after its one-time setup, below): **Actions**, **Release**, **Run
   workflow** (branch `develop`), and pick what the release brings since the last one
   ([semantic versioning](https://semver.org)):
   **patch** for fixes only (`v1.2.3` to `v1.2.4`), **minor** for new features (`v1.3.0`),
   **major** for a change that breaks what users or other services rely on (`v2.0.0`). Leave
   **Tag only** unticked.

That is the whole release. The workflow (`.github/workflows/release.yml`) opens the pull request
from `develop` into `main`, titled with the new version (`Release v1.2.4`) and listing what it
brings, and turns on auto-merge: once the required checks pass, GitHub merges it with a merge
commit, which deploys production. On that merge the workflow runs again and publishes a **GitHub
Release**: the tag `vX.Y.Z` on the merge commit, with notes generated from the pull requests merged
since the previous release (the **Releases** page lists what each production deploy brought). To
hold a release back, press **Disable auto-merge** on its pull request, or close it. A pull request
from `develop` into `main` that is already open becomes the release: it is retitled and its
description replaced, not doubled. What is merged is `develop` as it is when the checks pass: a
pull request merged into `develop` in the meantime is part of the release, after the checks ran
again.

A failing check does not end the release: its pull request stays open with auto-merge on, and is
merged as soon as the checks pass, after a re-run or the next merge into `develop`. Fix `develop`,
or close the pull request to give the release up. If the pull request is still open a few minutes
after all its checks passed (auto-merge has been reported not to fire on some repositories
protected by rulesets), merge it by hand with **Create a merge commit**: the release is published
on that merge all the same.

One-time setup, before the first run (without it the workflow stops with a message saying what is
missing, and merges nothing):

- **Settings**, **General**, **Pull Requests**: tick **Allow auto-merge**.
- A token of a maintainer, as the repository secret **`RELEASE_TOKEN`** (**Settings**, **Secrets
  and variables**, **Actions**): a fine-grained personal access token (your account's
  **Settings**, **Developer settings**, **Personal access tokens**, **Fine-grained tokens**,
  **Generate new token**), with **Repository access** set to **Only select repositories** and
  this repository, and under **Permissions** **Contents**, **Pull requests** and **Workflows** set
  to *Read and write* (Workflows: a release often carries changes to `.github/workflows`, which a
  token without it may not merge). The token merges as you, an admin whom the ruleset of `main`
  lets merge a pull request whose checks have not passed: the workflow only ever asks for
  auto-merge, which waits for them, and any workflow of the repository can read the secret, so
  keep the token to this use. The workflow's own token cannot do this: the CI of a pull request
  it opens waits for someone to approve it, and a merge made with it starts no workflow, so it
  would neither publish the release nor run the CI on `main` that the production deploy waits
  for. Give the token an expiry date and renew it then.

A release can still be made by hand: open a pull request with base **`main`** and compare
**`develop`**, titled `Release v1.2.0`, and when CI is green merge it with **Create a merge
commit** (never squash or rebase: `main` must contain `develop`'s commits, or the next release
conflicts). The release is published on the merge all the same.

The `Release guard` workflow (`.github/workflows/release-guard.yml`) fails any pull request into
`main` whose source branch is not `develop`, or whose title does not name the next version: one
step after the latest release, so after `v1.2.3` only `v1.2.4`, `v1.3.0` or `v2.0.0` (any version
for the first release; fix the title: the check runs again). A fix needed in production goes through
`develop` first, then a release. `main` never gets commits of its own, so `develop` does not need
`main` merged back after a release: GitHub shows `develop` as "behind" `main` by the release merge
commits, while their files are the same.

**Tag only** is not a release of `develop`: it merges nothing. It publishes `main`'s current
commit as the next version, for a release that was merged without its tag (a pull request merged
by hand whose title named no version, or a publication that failed). It refuses a commit that is
already released, since that would publish a release that brings nothing.

### Branch protection

Both branches are protected by repository rulesets, kept in `.github/rulesets/` (`develop.json`,
`main.json`). They are applied on GitHub, not read from the repository: after changing one, import
it again (**Settings**, **Rules**, **Rulesets**, **New ruleset**, **Import a ruleset**, and delete
the old one). Each ruleset:

- forbids deleting the branch and force-pushing to it;
- requires a pull request (no approval: the repository has one maintainer), merged by squash into
  `develop`, by merge commit into `main`;
- requires the CI jobs to pass (`Lint, type-check, build`, both `Server and client unit tests`,
  `Playwright end-to-end tests`), and on `main` also `Only develop merges into main`;
- on `develop` only, requires the pull request to be up to date with `develop`: after another
  merge, press **Update branch** and let CI run again, so what is merged is what was tested. Not
  on `main`: a release leaves a merge commit there that `develop` never gets, so a release PR is
  never up to date;
- lets a repository admin bypass it only when merging a pull request (an emergency merge with a
  failing check), never by pushing directly.

The repository's **General** settings must allow both merge commits and squash merging. When a CI
job is renamed, update the required checks in both files and import them again: a required check
that no longer runs blocks every merge.

### Wait for CI

With **Wait for CI** on (a toggle in the service **Settings**), a new deployment waits in
`WAITING` until every GitHub Actions workflow run on the commit has finished, and is skipped if
one fails. The CI workflow (`.github/workflows/main.yml`) qualifies: it runs on `push` to
`develop` and `main`.

Enable it on the services of a stage **once CI is green on its branch**: while any job fails, every deploy
would be skipped. A cancelled run also blocks the deployment of its commit, unless another
workflow on the same commit succeeded. CI therefore only cancels superseded runs of pull
requests: each push run has a concurrency group of its own, so pushes to a branch neither wait
for each other nor get cancelled while pending (GitHub cancels a pending run when a newer one
joins its group, even with `cancel-in-progress: false`). Runs not finished after two hours skip
the deploy.

## MongoDB

- The server uses Mongoose 9.11 with the MongoDB Node.js driver 7.7, which supports MongoDB
  server **4.4 to 9.0**.
- Production runs **MongoDB 7** (Railway service `MongoDB`, image `mongo:7`). Local development
  (`compose.yaml`) and CI use `mongo:7` too; CI additionally runs the test job against `mongo:9`
  to catch upgrade problems early. Avoid `mongo:8`: that tag is MongoDB 8.3, which refuses to start
  on Linux kernel 6.19+ (SERVER-121912) — the kernel of GitHub's `ubuntu-latest` runners and of
  current desktop distributions. Check the production version with:

  ```bash
  mongosh "<production MONGO_URL>" --quiet --eval 'db.version()'
  ```

- With Railway's MongoDB template, the server version is the template's image tag. Changing it
  (a major upgrade) is a manual operation: back up first.
- If the API and MongoDB are in the same Railway project, reference the variable
  (`${{MongoDB.MONGO_URL}}`) instead of copying the connection string, so it keeps working if the
  credentials change.
- Seed a fresh database once with the owner's user and the `louis.gentil` domain (the example the
  landing page links to); the script is idempotent and never prints the connection string's
  password:

  ```bash
  MONGO_URL="<production MONGO_URL>" bun run db:seed
  ```

### The job board's applications (one-off)

The public job board, applying to a job and the applicant lists are gone: no route reads or writes
the `jobapplications` collection any more, except deleting an account, which still removes the
account's own applications from it (as candidate, for its portfolio, to its job descriptions:
`LEGACY_JOB_APPLICATIONS_COLLECTION` of `server/services/accountDeletion.ts`) until it is gone.
Once the API without them runs on a stage, record how many applications it held, by source
(counts only: no candidate, posting or portfolio), then drop the collection, in that stage's
database (staging, then production):

```bash
mongosh "<MONGO_URL of the stage>" --quiet --eval '
  printjson(db.jobapplications.aggregate([{ $group: { _id: "$source", count: { $sum: 1 } } }]).toArray());
  db.jobapplications.drop()'
```

Write the counts in the release's pull request: they are the only record left of the board's
applications. Do it soon after the deploy: until then the collection holds personal data that the
privacy policy no longer describes. `drop()` answers `false` once it is gone. Once it is dropped on
both stages, a later release removes `LEGACY_JOB_APPLICATIONS_COLLECTION` from account deletion. Drop it from local and cloud-session databases too, and run
`bun run --cwd server seed:e2e` again there: its portfolio `e2e-applicant` became `e2e-shared`
(the old one is left unused).

The overview dashboard loses its job application panels with this release: import
`docs/grafana/overview.json` over the stack's **Portfolio · Overview** (Dashboards, New, Import,
same uid, overwrite).

### Locked job terms and capped pay ranges (one-off)

From the release that brings them, a job description's terms (the fields the perfect job scores,
`LOCKED_JOB_FIELDS` of `common/models/jobTerms.ts`) are locked once it has been opened
(`publishedAt` set, whatever its status since), and the top of a pay range is at most 1.5 times its
bottom (`JOB_LIMITS.pay.maxRangeRatio`). Nothing is migrated: the postings already opened become
locked as they are, and one saved wider than 1.5 times its bottom before the cap is scored as if its
top were that (its editor shows that top, which its next save stores; until then its page in the
recruiter space still shows the top it was saved with, and so does `/opportunities/:id` for a pick
made before the job step kept the version shared, see below: a version shared carries the capped
top). Such a posting cannot be saved
again with its wider top, nor opened from its status if it never was, until it is narrowed. Before
deploying that release on each stage (staging, then production), count them (counts only: no
posting, recruiter or pay):

```bash
mongosh "<MONGO_URL of the stage>" --quiet --eval '
  const wider = { $expr: { $gt: ["$pay.max", { $multiply: ["$pay.min", 1.5] }] } };
  printjson({
    opened: db.jobpostings.countDocuments({ publishedAt: { $ne: null } }),
    wider: db.jobpostings.countDocuments(wider),
    openedAndWider: db.jobpostings.countDocuments({ $and: [{ publishedAt: { $ne: null } }, wider] })
  })'
```

Write the counts in the release's pull request. When `wider` is not 0, tell the recruiters of those
postings, with the `LEGAL_VERSION` notice (see "Tell the accounts before a bump reaches
production") or on their own, that each must be narrowed (its editor) or, once opened, duplicated
into a new job description with the range they mean: an opened one is matched with a top of 1.5
times its bottom from the deploy.

### Versions of shared jobs (one-off)

From the release that brings them, the job step of a hiring journey keeps the version of the job
description the recruiter shared (`data.posting` of the step in `workflowinstances`:
`server/services/workflowSteps/job.ts`), and holds only with one. A pick stored before has none,
and nothing is migrated (the version shared then is not known): from the deploy, that job step is
to do again for its recruiter (pending, "Pick <job> again to share it and go on"), the steps after
it lock, booking included, until they pick the job again, and its owner reads the job description
as it is now on `/opportunities/:id` (which invitations already sent link) until then. Before
deploying that release on each stage (staging, then production), count those picks (counts only:
no recruiter, owner or job):

```bash
mongosh "<MONGO_URL of the stage>" --quiet --eval '
  const legacy = { $expr: { $gt: [{ $size: { $filter: {
    input: { $objectToArray: { $ifNull: ["$steps", {}] } },
    cond: { $and: [
      { $ne: [{ $type: "$$this.v.data.job" }, "missing"] },
      { $eq: [{ $type: "$$this.v.data.posting" }, "missing"] }
    ] }
  } } }, 0] } };
  printjson({
    journeys: db.workflowinstances.countDocuments(legacy),
    recruiters: db.workflowinstances.distinct("visitor", legacy).length
  })'
```

Write the counts in the release's pull request. When `recruiters` is not 0, tell those recruiters
before production gets the release (`distinct("visitor", legacy)` gives their account ids, whose
email is in `users`: never in the pull request) that they must pick their job again on each
candidate's page for recruiters where they had picked it, and that the meeting stays locked until
they do. Once production counts 0, a later release removes the fallback for those picks
(`legacyPick` of the job step, read by `server/services/jobAccess.ts`).

A rule of job descriptions made tighter in a later release (a new required field, a shorter
length, a narrower range) sends the versions kept that break it back to pending in the same way
(`storedJobSnapshot` of `server/services/jobPostings.ts` checks every version kept with today's
rules): count them before deploying it with a query of the same shape, its `cond` testing the rule
on `$$this.v.data.posting`, and tell their recruiters likewise.

### Reserved portfolio names

Every top-level route of the web app is a reserved portfolio name (`RESERVED_DOMAIN_NAMES` in
`common/models/domainName.ts`): a portfolio with that name would be hidden behind the route.
The landing page, legal pages and account page reserved `about`, `contact`, `cookies`, `help`,
`legal`, `privacy`, `report`, `signup`, `start` and `terms`; the private page of a job
description shared with a candidate (`/opportunities/:id`) reserved `opportunities`. Before
deploying a version that reserves new names, check on each stage (the staging database, then
production's) that no existing portfolio uses one (it would become unreachable, and could not be
found or claimed again):

```bash
mongosh "<MONGO_URL of the stage>" --quiet --eval '
  db.domains.find(
    { name: { $in: ["about", "contact", "cookies", "help", "legal", "opportunities", "privacy", "report", "signup", "start", "terms"] } },
    { name: 1, admin: 1 }
  ).toArray()'
```

The files of `client/static` answer at the site's root too (`/og-hire.png`, `/logo.svg`...), so
no name ending with a picture, icon or video extension can be claimed either (`.png`, `.jpg`,
`.svg`, `.webp`, `.ico`, `.webm`, `.mp4`...: `FILE_EXTENSION_PATTERN` of the same file). Before
deploying the version that refuses them, check once that no portfolio has one: its pages would
still load, but the site would take its name for an invalid one (a recruiter writing a job from
its page for recruiters would not be sent back there):

```bash
mongosh "<MONGO_URL of the stage>" --quiet --eval '
  db.domains.find({ name: /\.(png|jpe?g|gif|svg|webp|avif|ico|webm|mp4)$/ }, { name: 1, admin: 1 }).toArray()'
```

An empty array (`[]`) from each query means nothing to do. Otherwise, rename the domain
(`db.domains.updateOne` with a free name) and tell its owner before deploying that stage.

## Search engines

Portfolios are public to anyone with their address but are not listed by search engines
(CLAUDE.md, "Search engines"): every page of a portfolio, the 404 of a name nobody claimed,
`/account`, `/recruiter/jobs/*` and `/opportunities/*` (the private page of a job description
shared with a candidate) answer with `x-robots-tag: noindex, nofollow, noarchive`, and the API
sends the same header on every answer. The pages rendered on the server (a portfolio's pages,
`/account`) also carry a robots meta in their HTML; the 404 of a name nobody claimed has the
header alone; `/recruiter/jobs/*` and `/opportunities/*` are rendered in the browser, so their
meta is only written once their script ran (`curl` never sees it). The landing page, the legal
pages and `/recruiter` stay listed, with their canonical links (the one of `/recruiter`, rendered
in the browser too, is written by its script). The job board is gone: `/jobs` answers `410 Gone`,
which tells search engines to drop it, `/jobs/<id>` answers `308` to `/opportunities/<id>` (the
link of the meeting invitations sent before), and the API's `GET /jobs` and `GET /jobs/<id>`
answer 404.

**robots.txt refuses nothing, on purpose.** A crawler has to fetch a page to read its `noindex`:
a `Disallow` would hide the request, and a search engine can still list a refused address it
finds through a link, without its content. It would also stop LinkedIn, Slack and the like from
building the preview of a shared portfolio, and it could not name portfolios anyway (each is a
top-level path, `/<name>`). With Cloudflare in front of the web service and its managed
robots.txt on, Cloudflare puts its own block (`# BEGIN Cloudflare Managed Content` to
`# END Cloudflare Managed Content`: `User-agent: *` with its content signals, and a `Disallow: /`
for each AI training crawler it lists, such as GPTBot, ClaudeBot, CCBot or Google-Extended) above
the lines of `client/static/robots.txt`, which follow unchanged. Keep it so, and check that the
block adds no `Disallow: /` for `User-agent: *`.

**Cloudflare must not get in the way.** Bot Fight Mode, Block AI bots, AI Crawl Control and any
WAF rule must not challenge the crawlers of link previews (`LinkedInBot`, `Slackbot`,
`Twitterbot`, `facebookexternalhit`), and no Transform Rule or cache rule may strip
`X-Robots-Tag`.

**Checks**, from outside, after a deploy that touches pages or headers (`GET` requests: the
headers of a `HEAD` request may differ):

```bash
headers() { curl -s -o /dev/null -D - "$@"; }
headers https://example.com/louis.gentil/experiences | grep -i '^x-robots-tag'   # x-robots-tag: noindex, nofollow, noarchive
headers https://example.com/louis.gentil/hire | grep -i '^x-robots-tag'          # the same
headers https://example.com/a-name-nobody-claimed/experiences | grep -i '^x-robots-tag'   # the same, on the 404
headers https://api.example.com/health | grep -i '^x-robots-tag'                 # the same
curl -s https://example.com/louis.gentil/experiences | grep -o '<meta name="robots"[^>]*>'
headers https://example.com/ | grep -ci '^x-robots-tag'                          # 0: the landing page is listed
headers https://example.com/legal/privacy | grep -ci '^x-robots-tag'             # 0
curl -s -o /dev/null -w '%{http_code}\n' https://example.com/jobs               # 410: the job board is gone
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://example.com/jobs/65e2e00000000000000000aa   # 308 .../opportunities/65e2e00000000000000000aa
headers https://example.com/opportunities/65e2e00000000000000000aa | grep -i '^x-robots-tag'   # x-robots-tag: noindex, nofollow, noarchive
curl -s -o /dev/null -w '%{http_code}\n' https://api.example.com/jobs           # 404
curl -s https://example.com/robots.txt | grep -iE '^(user-agent|allow|disallow)'   # each group with its user agents
LINKEDIN='LinkedInBot/1.0 (compatible; Mozilla/5.0; +http://www.linkedin.com)'
curl -s -o /dev/null -w '%{http_code}\n' -A "$LINKEDIN" \
  https://example.com/louis.gentil/experiences                                   # 200, not a challenge (403 or 503)
curl -sL -A "$LINKEDIN" https://example.com/louis.gentil \
  | grep -o '<meta property="og:\(url\|image\|locale\)"[^>]*>'                   # the link people copy: og:url .../louis.gentil/experiences, og:image .../og-portfolio.png, og:locale en_GB
curl -sL -A "$LINKEDIN" 'https://example.com/louis.gentil?lang=fr' \
  | grep -o '<meta property="og:\(url\|image\|locale\)"[^>]*>'                   # og:url .../experiences?lang=fr, og:image .../og-portfolio-fr.png, og:locale fr_FR
curl -s -A "$LINKEDIN" https://example.com/louis.gentil/experiences \
  | grep -o '<meta property="og:[^>]*>\|<meta name="twitter:[^>]*>'             # og:title (the portfolio's title), og:description (its tagline), og:image .../og-portfolio.png, og:url, og:locale en_GB, twitter:card, twitter:image:alt
curl -s -A "$LINKEDIN" 'https://example.com/louis.gentil/hire?lang=fr' \
  | grep -o '<meta property="og:[^>]*>'                                          # og:title « Proposer un poste à … », og:description « Sur la page recruteurs de … : réserver un rendez-vous, en 2 minutes environ » (the journey's steps; « La page recruteurs de …. … ne prend pas de demandes de rendez-vous en ligne pour le moment » while the calendar offers no meeting type with hours), og:image .../og-hire-fr.png, og:url ...?lang=fr, og:locale fr_FR
curl -s https://example.com/louis.gentil/hire | grep -o 'Before you start\|About [0-9]* minutes\|does not take meeting requests online'   # the page rendered on the server, from the journey: "Before you start" where a meeting can be booked, else that none is taken online
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' -A "$LINKEDIN" \
  https://example.com/og-hire-fr.png                                             # 200 image/png
```

In the robots.txt output, every group that names `User-agent: *` has only `Allow: /` or an empty
`Disallow:`: a `Disallow: /` belongs only to the AI crawlers Cloudflare's block names (GPTBot,
ClaudeBot...). The page fetched as LinkedInBot must be the portfolio itself, with its preview tags,
not a challenge page that also answers 200.

LinkedIn's [Post Inspector](https://www.linkedin.com/post-inspector/) on a portfolio's addresses
then shows their previews: `/<name>` first (the link its owner copies, sent on to its
experiences), then `/<name>/experiences` and `/<name>/hire`, each in English and with `?lang=fr`,
with their title, description and picture. LinkedIn keeps a link's preview for about a
week: inspecting the address fetches it again, after a change of the pictures or of a
portfolio's title.

**After a release that changes the landing page's preview or demos** (its title, description,
`og-image.png`, `og-image-fr.png`, or the recordings `client/static/landing/demo-*.webm`, `.mp4`
and `.jpg`, which keep their addresses when they change), inspect `https://<your domain>/` and
`https://<your domain>/?lang=fr` in the Post Inspector, so links already shared show the new
title and picture. If Cloudflare keeps static files in its cache (it does by default for these
extensions), purge those addresses (**Caching**, **Configuration**, **Custom Purge**:
`/og-image.png`, `/og-image-fr.png`, `/landing/demo-journey.webm`, `.mp4`, `.jpg`, and
`demo-style.*` when they changed), then check what is served:
`curl -sI https://<your domain>/og-image.png | grep -i '^\(last-modified\|etag\|cf-cache-status\)'`.

**Pages listed before.** A `noindex` counts from the next time a search engine reads the page,
which can take weeks. Verify the domain in
[Google Search Console](https://search.google.com/search-console) (a domain property, with the
DNS `TXT` record it gives, added in Cloudflare: it covers every subdomain), find what is listed
(`site:portfolio.gentil.tech` in Google, then `site:api.portfolio.gentil.tech`,
`site:develop.portfolio.gentil.tech` and `site:develop.api.portfolio.gentil.tech`), and ask for
the removal of each portfolio (**Removals**, **New request**, **Remove all URLs with this
prefix**: `https://portfolio.gentil.tech/<name>/`). Do the same for the API's answers, which until
this header had none (`GET /domain/<name>` is a whole portfolio as JSON): the prefix
`https://api.portfolio.gentil.tech/domain/`, and `https://develop.api.portfolio.gentil.tech/domain/`
for staging, whose portfolios found under `https://develop.portfolio.gentil.tech/<name>/` go too.
The former job board goes the same way: the prefix `https://portfolio.gentil.tech/jobs` (and
`https://api.portfolio.gentil.tech/jobs`, with their staging twins). Google hides them for about six
months, long enough to read the `noindex` (or the `410` of the job board); **Pages** then lists
them under "Excluded by 'noindex' tag". Do the same in
[Bing Webmaster Tools](https://www.bing.com/webmasters) (**Content Removal**), whose index other
engines use too.

**Limits.** `noindex` is a request. Google and Bing follow it; a crawler that ignores robots
rules, or an AI answer engine, may not. That is why the landing FAQ and the privacy policy say
that search engines are asked not to list a portfolio, never that it cannot be found.

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
   curl -s -o /dev/null -w '%{http_code}\n' https://example.com/   # 200 (the landing page, no redirect)
   curl -s https://example.com/ | grep -o '<title>[^<]*</title>'    # <title>Your career, on your terms | Portfolio</title>
   curl -s https://example.com/legal | grep -c 'Publisher details are not configured yet'   # 0 once LEGAL_* are set
   curl -s https://api.example.com/domain/louis.gentil/availability   # {"name":"louis.gentil","available":false,"reason":"taken"}
   curl -si -H 'Origin: https://example.com' https://api.example.com/domain/louis.gentil \
     | grep -i '^access-control-allow-origin'  # https://example.com
   curl -s -o /dev/null -D - https://example.com/louis.gentil/experiences | grep -i '^x-robots-tag'   # x-robots-tag: noindex, nofollow, noarchive
   curl -s -o /dev/null -D - https://api.example.com/health | grep -i '^x-robots-tag'                 # the same
   curl -s -o /dev/null -w '%{http_code}\n' https://example.com/jobs   # 410: the job board is gone
   curl -s https://example.com/legal | grep -c 'cdn-cgi\|__cf_email__'   # 0: the proxy changed nothing
   ```

   The other checks of what search engines and link previews get: [Search engines](#search-engines);
   of what Cloudflare adds to the pages (Email Address Obfuscation, Network Error Logging): the
   loops under [Legal pages](#legal-pages).
4. **In the browser**: open the site, sign in with Google, reload the page and check you are still
   signed in (the `auth` cookie is stored for the API domain). With `GOOGLE_CLIENT_SECRET` set,
   **Admin, Appointments** shows the calendar as connected (or offers to connect it).
5. **Rollback** if needed: the previous deployment's menu has **Rollback**.

## Grafana dashboards

With `OTEL_EXPORTER_OTLP_ENDPOINT` set, both services send traces, metrics and logs to Grafana
Cloud. Three dashboards read them, in the **Portfolio** folder of the stack: an overview (what the
site holds, visits and activity, pages and portfolios loaded), one portfolio (chosen by its address
name) and the API's health. Their JSON, what each panel reads and their limits:
[docs/grafana](grafana/README.md).

The API feeds them with two metrics of its own, exported every 60 s:

| Metric (Prometheus name)                                                              | Attributes                  | What                                                                                                                                              |
| ------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http.server.requests` (`http_server_requests_total`), `http.server.request.duration` | `method`, `route`, `status` | Every request answered: the matched route pattern (never the raw path) and the status of the answer                                                |
| `portfolio.records` (`portfolio_records`)                                             | `kind`                      | The number of portfolios, accounts, recruiters, experiences, job postings... (`server/services/siteMetrics.ts`), read from MongoDB at most every 5 minutes |

Both stages report to the same stack and are told apart by `OTEL_SERVICE_NAME`: the dashboards'
**Stage** variable lists the names in use (`portfolio-api-production` and `portfolio-web-production`
for production, the defaults `portfolio-server` and `portfolio-client` for staging). Changing a
service's `OTEL_SERVICE_NAME` means changing that variable.

The dashboards identify no visitor and the site has no view counter in the browser (the privacy
policy says "no analytics"): what they show of a portfolio's audience is the number of times its
pages were rendered, crawlers included, over the last day.

## Diagnosing memory growth

If the API's memory keeps climbing on Railway, find the cause with service variables alone, no
code change. **Every variable change redeploys the service** (Railway stages the change and
deploys it), which restarts the process and resets its memory: compare the **slope** of each
deployment, not absolute values, and give each step about **12-24 hours**.

### Reading the `memory` lines

The API logs one `memory` line at startup, then every `MEMORY_LOG_INTERVAL_MS` (default 10
minutes). Read them in the service's **Deploy Logs** (search `memory`, or
`railway logs --service "portfolio api develop" | grep '\[INFO\] memory'`), not in Grafana: from
step 3 on, OpenTelemetry logs are off.

```
[INFO] memory {"rss":105.1,"heapUsed":32.2,"heapTotal":12.9,"external":21.4,"arrayBuffers":17.4,"objectCount":137142,"protectedObjectCount":1281,"topObjectTypes":"string=17592 Structure=16552 Function=14286 Array=12694 UnlinkedFunctionExecutable=12527 FunctionExecutable=10106 Object=6020 SymbolTable=5053"}
```

- `rss`, `heapUsed`, `heapTotal`, `external`, `arrayBuffers` are `process.memoryUsage()` in MB
  (on Bun, `heapUsed` is often larger than `heapTotal`: that is how Bun reports them, not an error);
  `objectCount`, `protectedObjectCount` and `topObjectTypes` (the 8 most numerous object types)
  come from the JavaScript heap (`bun:jsc` `heapStats()`).
- `rss` climbs **with** `heapUsed` and `objectCount`: JavaScript objects are being kept alive. The
  type that keeps climbing in `topObjectTypes` shows what is accumulating.
- `rss` climbs while `heapUsed` and `objectCount` stay flat: the growth is native memory (Bun's
  runtime, HTTP/TLS buffers); `external` or `arrayBuffers` climbing points at buffers.
- No garbage collection is forced, so heap values saw-tooth: compare the lows over hours.

The `Running at ...` line of each deployment shows what telemetry exports, e.g.
`"telemetry":"traces=otlp metrics=none logs=otlp"`: check it after every change. A value other
than `otlp`/`none` (or `true`/`false` for `OTEL_SDK_DISABLED`) stops the new deployment at
startup with the list of problems, and the previous deployment stays live.

### Bisection steps

On the API service (`portfolio api develop`), **Variables**, add one variable per step and keep
the ones from the previous steps. Stop at the first step whose memory stays flat.

| Step | Add                          | What it switches off                                                                                   |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1    | nothing (deploy this version) | Baseline: watch the `memory` lines with telemetry fully on                                            |
| 2    | `OTEL_METRICS_EXPORTER=none` | The metric reader and OTLP metric exporter: the export to Grafana every 60 s (while idle, the only other OTLP traffic is the `memory` log record every 10 min, until step 3). The HTTP request counter, the duration histogram and the record counts (`portfolio.records`, no MongoDB count runs) become no-ops |
| 3    | `OTEL_LOGS_EXPORTER=none`    | The log record processor and OTLP log exporter. Logs still reach Railway's deploy logs                 |
| 4    | `OTEL_TRACES_EXPORTER=none`  | The Elysia tracing plugin (no spans at all), the span processor and the OTLP trace exporter            |
| 5    | `OTEL_SDK_DISABLED=true`     | The OpenTelemetry SDK itself (context manager, propagator, the empty logger provider): same as no endpoint |

- **Memory goes flat at step N**: what step N switched off causes the growth. To confirm, delete
  the variables of the earlier steps (one redeploy) so only step N's switch remains, and check
  that memory stays flat.
- **Still growing at step 5**: OpenTelemetry is ruled out. The cause is elsewhere (Bun runtime,
  MongoDB driver, platform); the `memory` lines then tell JavaScript heap from native growth.
- **When done**, delete the variables again to restore full telemetry (one more redeploy).

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
   // One file per stage, or two calls with 'main' (production) and 'develop' (staging)
   const branch = 'main';
   // Deploy a service only when its own code, the shared package or the workspace manifests change
   const watchPatterns = (dir: string) => [`/${dir}/**`, '/common/**', '/package.json', '/bun.lock'];

   export default defineRailway(() => {
   	const api = service('<api service name>', {
   		// checkSuites = "Wait for CI": enable only once CI is green on this branch
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
   			LEGAL_PUBLISHER_NAME: preserve(),
   			LEGAL_CONTACT_EMAIL: preserve(),
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
