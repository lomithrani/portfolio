# portfolio-api

Elysia API (Bun runtime, MongoDB via Mongoose). The web client imports its
`Portfolio` type for type-safe calls with Eden Treaty.

## Scripts

| Script | What it does |
| --- | --- |
| `bun run start` | Start the API (`bun run index.ts`) |
| `bun run dev` | Start with watch mode and the inspector |
| `bun run test` | Run the tests (`bun test tests/`, see [Tests](#tests)) |
| `bun run typecheck` | `tsc --noEmit -p .` |
| `bun run seed` | Create the owner's user and the `louis.gentil` domain (idempotent) |

## Environment

Validated once at startup by `env.ts`; a misconfiguration stops the server
with a message listing every problem.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `MONGO_URL` | yes | | `mongodb://` or `mongodb+srv://` connection string |
| `JWT_SECRET` | yes | | Signs session cookies; use a long random value |
| `ALLOWED_DOMAINS` | yes | | JSON array of allowed CORS origins, e.g. `["https://example.com"]`; entries that are not origins (`*`, no scheme, a path) are ignored with a startup warning |
| `GOOGLE_CLIENT_ID` | no | `DEFAULT_GOOGLE_CLIENT_ID` (portfolio-common) | Expected audience of Google ID tokens, and the OAuth client of Google Calendar |
| `GOOGLE_CLIENT_SECRET` | no | | Client secret of that OAuth client; enables Google Calendar appointments (off while unset). Quotes or spaces stop the server |
| `HOST` | no | `::` (dual-stack) | Falls back to `0.0.0.0` when IPv6 is unavailable, unless set explicitly |
| `PORT` | no | `3000` | |
| `AUTH_COOKIE_SAMESITE` | no | `strict` | `strict`, `lax` or `none`; the cookie is `Secure` in production or with `none` |
| `CLIENT_IP_HEADER` | no | `X-Real-IP` on Railway (`RAILWAY_PROJECT_ID` set), else none | Request header holding the visitor's IP, set by the reverse proxy (last entry of a list such as `X-Forwarded-For`); unset: the socket's peer address. Used by the booking and availability rate limits only |
| `ANTHROPIC_API_KEY` | no | | Claude API key billed for résumé imports (off while unset); never logged, returned or traced. Quotes or spaces stop the server |
| `RESUME_IMPORT_MONTHLY_LIMIT` | no | `3` | Résumé imports per user per 30-day window; `0` turns the feature off |
| `RESUME_IMPORT_DAILY_LIMIT` | no | `30` | Résumé imports per UTC day across all users; `0` turns the feature off |
| `API_DOCS` | no | | `true` serves the OpenAPI docs (`/swagger`) in production; always on otherwise |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | | Enables OpenTelemetry (traces, metrics, logs); fully off when unset |
| `OTEL_EXPORTER_OTLP_HEADERS` | no | | e.g. the Grafana Cloud authorization header |
| `OTEL_SERVICE_NAME` | no | `portfolio-server` | |
| `OTEL_SDK_DISABLED` | no | `false` | `true` turns telemetry fully off, as if the endpoint were unset |
| `OTEL_TRACES_EXPORTER` | no | `otlp` | `none`: no span processor or exporter, and no Elysia tracing plugin |
| `OTEL_METRICS_EXPORTER` | no | `otlp` | `none`: no metric reader or exporter (the HTTP metrics become no-ops) |
| `OTEL_LOGS_EXPORTER` | no | `otlp` | `none`: no log record processor or exporter; logs still go to the console |
| `MEMORY_LOG_INTERVAL_MS` | no | `600000` | Period of the `memory` log line (see [Operations](#operations)); `0` turns it off, otherwise at least `1000` |
| `TLS_PASSPHRASE` | no | | Serve HTTPS with `cert.pem` / `key.pem` |
| `NODE_ENV` | no | `development` | `production` hides docs and makes the cookie `Secure` |

## Operations

- `GET /health` answers `200 OK` when MongoDB is connected, `503` otherwise.
- `SIGTERM`/`SIGINT` stop the memory log timer and the HTTP server, close
  MongoDB and flush telemetry before exiting (give the process a few seconds,
  e.g. Railway's `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`).
- Every log record is also printed as one console line,
  `[LEVEL] message {"attribute":...}` (Railway shows each output line as a
  separate entry).
- The startup line `Running at ...` says what telemetry exports, e.g.
  `"telemetry":"traces=otlp metrics=none logs=otlp"` or
  `"telemetry":"off (OTEL_SDK_DISABLED=true)"`. The OTel switches are
  validated at startup: a value other than `otlp`/`none` (or `true`/`false`)
  stops the server.
- A `memory` line is logged at startup, then every `MEMORY_LOG_INTERVAL_MS`:
  `rss`, `heapUsed`, `heapTotal`, `external` and `arrayBuffers` in MB
  (`process.memoryUsage()`), `objectCount` and `protectedObjectCount` of the
  JavaScript heap, and `topObjectTypes`, the 8 most numerous object types
  (`bun:jsc` `heapStats()`). No garbage collection is forced, so samples
  include garbage not yet collected: compare trends over hours. The timer
  never keeps the process alive. See "Diagnosing memory growth" in
  `docs/DEPLOYMENT.md`.
- Login verifies Google ID tokens locally (signature, issuer, audience,
  expiry, `email_verified`) and keys users by their Google account ID.
- `POST`/`PUT`/`PATCH`/`DELETE` bodies must be JSON: any other
  `Content-Type` gets `415` before the body is parsed, so a cross-site HTML
  form never reaches a handler, whatever `AUTH_COOKIE_SAMESITE` is.
- Request bodies are capped at 1 MB (`413`, checked on `Content-Length`
  before the body is parsed), except `POST /experiences/import`; Bun refuses
  anything over 6 MB itself.
- `GET /experiences/import` says whether résumé import is on and what is left
  of the caller's allowance (`{enabled, limit, remaining, resetsAt}`).
  `POST /experiences/import` (`{file: base64 PDF, fileName?}`, the caller must
  own a domain) answers `{experiences, warnings, quota}`: drafts extracted by
  Claude Haiku 5.5, normalised, never saved. Errors: `404` feature off or no
  domain, `422` not base64 / not a PDF / over ~10 pages / unreadable / refused
  by the model / too much content, `413` over 4 MB, `429` (`Retry-After`) over
  a quota, `503` Claude unavailable or refusing the key. See "Résumé import"
  in `docs/DEPLOYMENT.md`.
- `POST /appointments/book` (public) is limited per IP address (IPv6: per
  /64) and, once the slot is known to be free, per visitor email; an email
  can hold a few upcoming bookings per schedule (`429`, with `Retry-After`
  for the rate limits; values in `services/appointmentBookings.ts`). Each
  booking is reserved in MongoDB (`appointmentbookings`, unique on schedule
  and start) before the Google event is created, under an id derived from
  the reservation's, so two concurrent requests cannot book one slot and an
  event Google created without answering is still found. Emails and IPs are
  stored as HMACs keyed from `JWT_SECRET`.
- `GET /appointments/available-slots` and `GET /appointments/available-dates`
  (public, each one a Google FreeBusy call) share a generous limit per IP
  address (`429` with `Retry-After`).
- The session cookie only reaches the API when the web app and the API are
  on the same site (e.g. `example.com` and `api.example.com`); two
  `*.up.railway.app` hosts are different sites.

## Tests

`bun test` loads `server/.env`, then `tests/setup.ts` (preloaded by
`bunfig.toml`) clears every `OTEL_*` variable, so tests never export
telemetry, removes `ANTHROPIC_API_KEY`, so no test can call (and bill) the
real Claude API (the résumé import tests answer for `api.anthropic.com`
themselves), and replaces `MONGO_URL` with `TEST_MONGO_URL` when that is set.

The integration, appointments, résumé import, rate limit and Eden suites
write to MongoDB: each test
(the Eden suite, for its server) creates the documents it needs, named with a unique
suffix, then deletes them, so the tests pass in any order
(`bun test --randomize tests/`). They
refuse to run unless `MONGO_URL` points at `localhost`/`127.0.0.1`/`::1`, or
`TEST_MONGO_URL` names a disposable database, so a `.env` pointing at a
shared or production cluster is never written to.

```bash
TEST_MONGO_URL=mongodb://127.0.0.1:27017/portfolio-test bun run test
```

## Before deploying this version

- `ALLOWED_DOMAINS` must be a JSON array of strings and `MONGO_URL` must start
  with `mongodb://` or `mongodb+srv://`, or the server exits at startup with
  the list of problems. Check the Railway service variables first.
- No data migration: the app was never in production, so start from a fresh
  database (drop the old data, then run `bun run seed` against the production
  `MONGO_URL`) rather than carrying documents written by older versions.
