# Site Architecture

## Goal

Build a public website that lets users browse and query the structured company coverage stored in `Pilot_Reports/`, while keeping markdown as the source of truth.

## Recommended First Version

Use this pipeline:

`Pilot_Reports/` -> `scripts/build_site_db.py` -> `data/site.db` -> API -> frontend

This keeps content authoring in markdown and exposes a stable query layer for the website.

## Why SQLite First

- The repository is write-light and read-heavy.
- Public browsing and filtering need faster structured queries than raw markdown parsing.
- SQLite is simple to deploy for a first public release.
- The schema can be migrated to PostgreSQL later with low friction.

## Current Database Shape

The first version of `data/site.db` contains:

- `companies`: one row per report file
- `sectors`: folder-level sector counts
- `wikilinks`: deduplicated wikilink entities with category and mention counts
- `company_wikilinks`: per-company wikilink occurrences by section
- `site_search`: SQLite FTS index for ticker, name, sector, and main text sections
- `imports`: snapshot metadata for each rebuild

## Suggested API Surface

The next backend layer should expose at least:

- `GET /api/companies`
- `GET /api/companies/{ticker}`
- `GET /api/sectors`
- `GET /api/wikilinks`
- `GET /api/wikilinks/{name}`
- `GET /api/search?q=...`

## Suggested Frontend Pages

- Home: overall coverage stats, featured sectors, featured themes
- Companies index: search, sort, and sector filters
- Company detail page: overview, supply chain, customer/supplier section, financial tables
- Wikilink detail page: all companies mentioning a specific entity
- Sector page: all companies in one sector

## Implementation Order

1. Keep markdown as the source of truth.
2. Rebuild `data/site.db` whenever `Pilot_Reports/` changes materially.
3. Add a small API service that reads only from SQLite.
4. Build the frontend against the API, not against filesystem reads.
5. Add theme ingestion later if `themes/` should be part of the public site.

## Backend Recommendation

For the next step, use Python `FastAPI` for the read-only API:

- native fit with the current repo
- easy SQLite integration
- simple deployment behind a domain

## Frontend Recommendation

For the next step, use `Next.js` or `Vite + React`.

- `Next.js` if you want SSR/SEO and easier public deployment
- `Vite + React` if you want the smallest and fastest local build loop

For a public research site with company detail pages, `Next.js` is the better default.
