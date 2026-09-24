# Bensa Changelog

All notable changes to this project are documented here. The version headings
match the tags CI generates on each push to `main`.

## [v0.0.17] - 2026-09-23

### Fixed
- **Chart tooltip for biogas**: Hovering the trend chart showed biogas prices
  from the wrong month (and drew its marker far from the crosshair) on every
  view longer than one year, because biogas data only starts in 2025. Points
  are now matched by month.
- **Year-on-year change**: The stat tiles now compare with the same calendar
  month a year earlier rather than the value twelve data points back.
- **Full price history**: The backend asks Statistics Finland for every month
  instead of the latest 400, which the table would have outgrown in 2035, and
  rejects malformed responses instead of charting misread prices.
- **Redis outages**: The API now answers from its in-memory copy first, so a
  Redis outage no longer slows every request down or serves an older copy.
- **Loading retries**: Only one request is in flight while the backend warms up,
  so a late failure can no longer replace an already-loaded chart.
- **Slow clients**: The server now times out connections that never finish
  sending their request headers.

### Changed
- CI builds the frontend on Node 26, matching the Docker image.

## [v0.0.1] - 2026-07-20

### Added
- **National fuel-price dashboard**: Current national average prices for 95E10,
  98E5, diesel and biogas as stat tiles, each with its year-on-year change, plus
  a historical trend chart going back to 2002.
- **Trend chart**: Multi-series line chart with selectable time windows
  (1v / 3v / 5v / 10v / Max), a hover crosshair with a per-fuel tooltip, direct
  end-labels, and a colourblind-safe validated palette.
- **Statistics Finland backend**: Go service that polls the Tilastokeskus PxWeb
  API (table 11xx, CC BY 4.0), normalises the commodity codes to fuel keys, and
  caches the result in Redis with an in-memory fallback so a cache outage never
  takes the site down.
- **Light and dark themes**: An explicit toggle (not tied to the OS setting),
  persisted across visits.
- **CI/CD**: Push to `main` tags a release, builds a multi-arch image and pushes
  it to GHCR; the host auto-deploys within five minutes.
- **Changelog on GitHub Pages**: This file is compiled to a styled page on each
  change.

### Notes
- Per-station pump prices were investigated (tankille.fi) but are not available
  through any interface that permits third-party reuse, so this release is built
  entirely on open national-average data. See `docs/DATA_SOURCES.md`.
