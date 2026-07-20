# bensa

Finnish fuel-price dashboard. A Go backend polls Statistics Finland for the
national monthly average pump prices, caches them in Redis, and serves a React
frontend (embedded into the same binary) that shows current averages and a
historical trend chart.

Sibling projects `ratikka` (HSL live transit) and `tieliikenne` (road traffic)
share this architecture, deployment host, and CI/CD shape — when something here
looks unexplained, check how they solved it before inventing a new approach.

## Layout

```
backend/cmd/server/main.go     entrypoint: starts the poller, wires routes
backend/internal/api/statfin.go  Statistics Finland PxWeb client
backend/internal/api/handler.go  HTTP handlers (/api/trend)
backend/internal/cache/        Redis wrapper with in-memory fallback
backend/internal/models/       shared response types
backend/internal/api/dist/     frontend build, embedded via //go:embed at image build
frontend/                      Vite + React + TypeScript (SVG charts, no map)
scripts/build-changelog.js     CHANGELOG.md -> dist-changelog/index.html for Pages
deploy/                        production compose + cron auto-update script
```

## Local development

Two processes. The backend defaults to `:8081`, which is what the Vite dev
proxy targets:

```
docker compose up -d          # Redis on :6379
cd backend && go run ./cmd/server
cd frontend && npm run dev    # :5173, proxies /api -> :8081
```

`backend/internal/api/dist/` holds only `.gitkeep` in a checkout, so
`//go:embed all:dist` still compiles; the backend serves no static files
locally and Vite serves the frontend instead.

## Data source

- **Statistics Finland PxWeb** (table 11xx) — monthly national average pump
  prices since 2002, CC BY 4.0, no auth. This is the *only* data source; the
  whole app is built on it. See `docs/DATA_SOURCES.md`.

Per-station pump prices (a Tankille-style map) were investigated and are **not**
buildable: no Finnish per-station API permits third-party reuse, and the one
private API is WAF-blocked and against its own terms. `docs/DATA_SOURCES.md`
records the details so nobody re-derives them.

## Conventions

- Version/build metadata is injected via `-ldflags` in CI, never hardcoded.
- The upstream fetch degrades gracefully: a failed poll logs and retries, and
  the handler falls back to the last good copy (Redis, then in-memory) rather
  than 500ing. A cold start with no data yet returns 503, which the frontend
  shows as a loading state.
- Unknown `/api/*` paths 404 instead of falling through to `index.html`.
- Fuel keys (`95E10`, `98E5`, `diesel`, `biokaasu`) are the shared vocabulary:
  the backend normalises PxWeb commodity codes onto them in `statfin.go`, and
  the frontend's `lib/fuels.ts` colours and orders them. Change one, change both.
- Chart colours come from the validated data-viz categorical palette; if you add
  a fuel, run the palette validator before picking its colour.
- CHANGELOG.md headings must match the tags CI generates (`## [v0.1.0] - date`),
  or the Pages changelog renders them as plain text.

## Deployment

Push to `main` -> CI tags, builds a multi-arch image, pushes to
`ghcr.io/saavuori/bensa:latest`. The host runs a 5-minute cron
(`deploy/update.sh`) that pulls and redeploys. TLS is terminated by the Caddy
container in the *ratikka* stack, which proxies `polttoaine.duckdns.org` over
the shared external `web-proxy` podman network. See `docs/DEPLOYMENT.md`.
