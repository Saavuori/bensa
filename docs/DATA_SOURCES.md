# Data sources

## What bensa uses

**Statistics Finland (Tilastokeskus) PxWeb API — the only source.**
CC BY 4.0, no auth. Table 11xx "Polttonesteiden keskihintoja" gives monthly
national average consumer prices (incl. VAT) from 2002M01 onwards.

- Table: `https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/khi/11xx.px`
- `GET` returns variable metadata; `POST` a JSON-stat2 query returns the data.
- Commodities mapped to fuel keys in `backend/internal/api/statfin.go`:
  `0700200`→`95E10`, `0700300`→`98E5`, `0700100`→`diesel`, `0700800`→`biokaasu`.
  (Light heating oil `0400500` is intentionally dropped — not a pump fuel.)

National averages only — no regional or station granularity. Attribution
("Source: Statistics Finland") is rendered in the app footer, as the licence
requires.

## Why there is no station-level map

The original idea was a per-station price map (like the sibling ratikka app).
That was investigated thoroughly and **is not buildable from any source that
permits third-party reuse.** Recording the findings here so nobody re-derives
them:

- **tankille.fi** (`api.tankille.fi`) is the only rich per-station source
  (prices, brand, coordinates), but it is a private mobile-app API. Its terms
  forbid API/bot access without written permission, the device fingerprints in
  every public reverse-engineered client are blacklisted, and — verified live on
  2026-07-20 — the stations endpoint returns a blanket `403` from the AWS WAF
  before auth even runs. The company has also asked client authors to scrub
  references to it. Not usable, and not something to work around.
- **polttoaine.net** — crowdsourced per-station prices, but scraping-only and
  its terms forbid copying or redistributing site content.
- **www.tankille.fi** public pages are a JS shell that itself calls the blocked
  API — nothing server-rendered to read.

If a legitimate per-station feed ever becomes available (e.g. written
permission from Energy Brokers Finland, or an official open dataset), the app is
structured to add a map alongside the existing dashboard: the fuel-key
vocabulary and colour system already exist, and only a new backend poller,
cache entry, and `/api/stations` handler would be needed.

## Considered for future enrichment

- **EU Weekly Oil Bulletin** — genuinely open, weekly cadence, good for a
  Finland-vs-EU comparison line. XLSX downloads, no API. A natural next feature.
