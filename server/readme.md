# portfolio-api

Elysia API (Bun runtime, MongoDB via Mongoose). The web client imports its
`Portfolio` type for type-safe calls with Eden Treaty.

## Scripts

| Script | What it does |
| --- | --- |
| `bun run start` | Start the API (`bun run index.ts`) |
| `bun run dev` | Start with watch mode and the inspector |
| `bun run test` | Run the tests (`bun test tests/`, needs MongoDB at `MONGO_URL`) |
| `bun run typecheck` | `tsc --noEmit -p .` |
| `bun run seed` | Create the owner's user and the `louis.gentil` domain (idempotent) |

## Environment

Validated once at startup by `env.ts`; a misconfiguration stops the server
with a message listing every problem.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `MONGO_URL` | yes | | `mongodb://` or `mongodb+srv://` connection string |
| `JWT_SECRET` | yes | | Signs session cookies; use a long random value |
| `ALLOWED_DOMAINS` | yes | | JSON array of allowed CORS origins, e.g. `["https://example.com"]` |
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
- The session cookie only reaches the API when the web app and the API are
  on the same site (e.g. `example.com` and `api.example.com`); two
  `*.up.railway.app` hosts are different sites.
