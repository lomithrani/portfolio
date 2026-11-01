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
| `GOOGLE_CLIENT_ID` | no | `DEFAULT_GOOGLE_CLIENT_ID` (portfolio-common) | Expected audience of Google ID tokens |
| `HOST` | no | `::` (dual-stack) | Falls back to `0.0.0.0` when IPv6 is unavailable, unless set explicitly |
| `PORT` | no | `3000` | |
| `AUTH_COOKIE_SAMESITE` | no | `strict` | `strict`, `lax` or `none`; the cookie is `Secure` in production or with `none` |
| `API_DOCS` | no | | `true` serves the OpenAPI docs (`/swagger`) in production; always on otherwise |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | | Enables OpenTelemetry (traces, metrics, logs); fully off when unset |
| `OTEL_EXPORTER_OTLP_HEADERS` | no | | e.g. the Grafana Cloud authorization header |
| `OTEL_SERVICE_NAME` | no | `portfolio-server` | |
| `TLS_PASSPHRASE` | no | | Serve HTTPS with `cert.pem` / `key.pem` |
| `NODE_ENV` | no | `development` | `production` hides docs and makes the cookie `Secure` |

## Operations

- `GET /health` answers `200 OK` when MongoDB is connected, `503` otherwise.
- `SIGTERM`/`SIGINT` stop the HTTP server, close MongoDB and flush telemetry
  before exiting (give the process a few seconds, e.g. Railway's
  `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`).
- Login verifies Google ID tokens locally (signature, issuer, audience,
  expiry, `email_verified`) and keys users by their Google account ID.
- `POST`/`PUT`/`PATCH`/`DELETE` bodies must be JSON: any other
  `Content-Type` gets `415` before the body is parsed, so a cross-site HTML
  form never reaches a handler, whatever `AUTH_COOKIE_SAMESITE` is.
- The session cookie only reaches the API when the web app and the API are
  on the same site (e.g. `example.com` and `api.example.com`); two
  `*.up.railway.app` hosts are different sites.

## Tests

`bun test` loads `server/.env`, then `tests/setup.ts` (preloaded by
`bunfig.toml`) clears every `OTEL_*` variable, so tests never export
telemetry, and replaces `MONGO_URL` with `TEST_MONGO_URL` when that is set.

The integration and Eden suites write to MongoDB (they seed the
`louis.gentil` domain and create then delete their own documents). They
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
