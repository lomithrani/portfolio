# Grafana dashboards

Three dashboards for the Grafana Cloud stack the two services send their telemetry to
(`OTEL_EXPORTER_OTLP_ENDPOINT`, see [DEPLOYMENT.md](../DEPLOYMENT.md)). They live in the
**Portfolio** folder of the stack; the JSON files here are their source.

| File                 | Dashboard (uid)                                  | Shows                                                                                                                                                  |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `overview.json`      | Portfolio · Overview (`portfolio-overview`)      | How many portfolios, accounts, recruiters, job postings... the site holds; visits, sign-ins and what people did; pages and portfolios loaded in the last day |
| `one-portfolio.json` | Portfolio · One portfolio (`portfolio-detail`)   | One portfolio, chosen by its address name: page loads, Hire page, journey steps, booking calendar, latest requests                                     |
| `api-health.json`    | Portfolio · API health (`portfolio-api`)         | Requests by route and status, response times, warnings and errors, memory                                                                              |

The overview's "Portfolios loaded" table links each portfolio to its own dashboard.

## What they read

| Data                                                                                         | From                                                             | Kept as            |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------ |
| `portfolio_records{kind}`: the number of portfolios, accounts, recruiters, experiences, job postings, open job postings, journeys started (by a visitor's first step, or by a mutual interest of matching that leads its recruiter there), upcoming meetings, candidates with discovery on (`discoverable_candidates`: their consent in force and active, those paused for a setting removed since included: an upper bound of those proposed), and of matching's jobs: proposed to candidates (`matching_job_postings`: open, in matching and approved, of a recruiter who accepted the terms in force), waiting for a review (`matching_job_reviews`: what tells the reviewers there is something to read) and the mutual interests going on (`active_matches`); the matching kinds are zero while `MATCHING` is off | `server/services/siteMetrics.ts`, read from MongoDB at most every 5 minutes | Metric (Prometheus) |
| `http_server_requests_total{method, route, status}` and `http_server_request_duration_milliseconds` | `server/app.ts`, every request the API answers                   | Metric (Prometheus) |
| Warnings, errors and the `memory` line                                                        | `server/services/logger.ts`                                      | Logs (Loki)        |
| Page renders (`sveltekit.handle.root`, by route) and API requests (by route and path)         | The traces of the web service and the API                        | Traces (Tempo)     |

Nothing identifies a visitor: these are counts of records and of requests the servers already
handle. There is no view counter in the browser, so the dashboards cannot tell a signed-in visitor
from an anonymous one, and what is counted where pages are rendered includes crawlers.

The page for recruiters (the Hire page) is rendered on the server, crawlers and link previews
included: that render asks the API for the journey and the meeting types with the header
`x-portfolio-render: server` (`client/src/routes/[domain]/hire/+page.server.ts`), which the API's
OpenTelemetry plugin records on the span like every request header
(`http.request.header.x-portfolio-render`). The one-portfolio dashboard's Hire page panels leave
those requests out (`span."http.request.header.x-portfolio-render" = nil`), so they count what
browsers did: "Hire page opened" the journey loaded once per visit, "Booking calendar opened" the
meeting types listed by the booking step (and by the page as it loads when its server render found
none: it does not ask again when the render found some). A change to that header, or to the
requests the page makes, means updating those panels.

## The Stage variable

Each dashboard has a **Stage** variable whose value is a regular expression on the services'
`OTEL_SERVICE_NAME`:

| Stage      | Value                            | Services                                              |
| ---------- | -------------------------------- | ----------------------------------------------------- |
| Production | `portfolio-(api\|web)-production` | `portfolio-api-production`, `portfolio-web-production` |
| Staging    | `portfolio-(server\|client)`      | `portfolio-server`, `portfolio-client` (the defaults)  |

A service whose `OTEL_SERVICE_NAME` changes must be changed there too (dashboard settings,
Variables), in the three dashboards.

## Limits to know

- **Traces are counted over 25 hours at most** (a limit of Grafana Cloud's TraceQL metrics). The two
  tables at the bottom of the overview always show the last 24 hours; on the one-portfolio dashboard,
  keep the time range to a day or less. Per-portfolio numbers therefore have no history beyond what
  the traces keep.
- **Small numbers are approximate.** Prometheus counts the increase of a counter: the first request
  of a route after the API starts creates the series and is not counted, and a count over a period
  is extrapolated (hence 13.8 rounded to 14).
- **"Portfolio loads" on the overview** leaves out addresses that are no portfolio only since the
  API reports the `status` of its answers; series written before have none and count every
  `GET /domain/:name`, scans for `/domain/wp-login.php` included.
- **"What the site holds"** is empty for a stage until its API runs a version with
  `portfolio.records`, and while `OTEL_METRICS_EXPORTER=none`.
- **`unmatched` 404s are not all scanners.** While `MATCHING` is off its routes are not registered,
  and the web client still asks once whether matching is available: `GET /me/notifications` from
  the header of every signed-in page load (never again in that page once it answered 404), `GET
  /discovery` from the admin page and from the inbox (`/opportunities`) read signed in, `GET
  /me/notifications` from the private page of a job and the inbox read signed out, and `GET
  /matching/reviews` from the reviewers' page (`/recruiter/reviews`), whose address only a reviewer
  types. Those count as `route="unmatched"`, `status="404"` (the API cannot tell them from a route
  that never existed).

## Changing a dashboard

Edit it in Grafana, then export it (Export, Export as JSON, without "Export for sharing
externally") over the file here, so the repository keeps what the stack shows. To install them on
another stack: Dashboards, New, Import, one file at a time, into a folder named Portfolio. The data
source uids (`grafanacloud-prom`, `grafanacloud-logs`, `grafanacloud-traces`) are those Grafana
Cloud provisions on every stack.
