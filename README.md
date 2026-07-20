# Bensa

**Finnish fuel-price dashboard** — current national average pump prices and
their history since 2002, from open [Statistics Finland][statfin] data.

🔗 **Live:** <https://polttoaine.duckdns.org> · **Changelog:** <https://saavuori.github.io/bensa/>

## What it shows

- **Current average price** per fuel (95E10, 98E5, diesel, biogas), each with
  its year-on-year change.
- **Historical trend chart** back to 2002, with selectable time windows and a
  hover tooltip, on a colourblind-safe palette.
- **Light and dark** themes.

Prices are national monthly averages including VAT. There is no per-station
map — Finland has no open per-station price feed; see
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for the full reasoning.

## Stack

A Go backend polls the Tilastokeskus PxWeb API, caches the result in Redis (with
an in-memory fallback), and serves a Vite + React + TypeScript frontend embedded
into the same binary. It is a sibling of the `ratikka` and `tieliikenne`
projects and shares their architecture, CI/CD, and deployment host.

## Develop

```bash
docker compose up -d                     # Redis on :6379
cd backend && go run ./cmd/server        # API on :8081
cd frontend && npm install && npm run dev # UI on :5173, proxies /api -> :8081
```

The backend runs without Redis too (memory fallback), and without any
credentials — the data source is open.

## Deploy

Push to `main`: CI tags a release, builds a multi-arch image, and pushes it to
`ghcr.io/saavuori/bensa`; the host redeploys within five minutes. Full details
in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Licence

Fuel-price data © Statistics Finland, [CC BY 4.0][ccby].

[statfin]: https://stat.fi
[ccby]: https://creativecommons.org/licenses/by/4.0/
