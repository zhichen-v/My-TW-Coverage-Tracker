# Site Architecture

## Goal

Build a public website that lets users browse and query the structured company coverage stored in `Pilot_Reports/`, while keeping markdown as the source of truth.

## Recommended First Version

Use this pipeline:

`Pilot_Reports/` -> `scripts/export_reports_json.py` -> `Pilot_Reports_JSON/`

`Pilot_Reports/` -> `scripts/build_site_db.py` -> `data/site.db` -> API -> frontend

`themes/` + `Pilot_Reports/` -> `scripts/build_graph_db.py` -> `data/graph.db` -> API -> `/graph`

This keeps content authoring in markdown, uses SQLite for query-heavy list/search workloads, uses a dedicated SQLite file for graph data, and uses the mirrored JSON tree for structured detail rendering.

The JSON mirror is a derived artifact, not a second source of truth.

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

The first version of `data/graph.db` contains:

- `graph_imports`: graph-build metadata for the latest rebuild
- `graph_payloads`: stored JSON payloads for `graph` and `company_map`
- `graph_themes`: one row per theme with company-role groupings
- `graph_nodes`: graph nodes with D3-oriented metadata
- `graph_links`: theme-to-wikilink edges with sections and occurrences

## Current API Surface

The current backend exposes:

- `GET /api/companies`
- `GET /api/companies/{ticker}`
- `GET /api/graph`
- `GET /api/graph/themes/{theme_id}`
- `GET /api/graph/health`
- `GET /api/reports/{report_id}`
- `GET /api/sectors`
- `GET /api/wikilinks`
- `GET /api/wikilinks/{name}`
- `GET /api/search?q=...`

The contract is split deliberately:

- list/search responses come primarily from `data/site.db`
- detail responses attach `structured_content` and `structured_report_path` from `Pilot_Reports_JSON/`
- legacy markdown detail blobs are no longer part of the public detail API

## Suggested Frontend Pages

- Home: overall coverage stats, featured sectors, featured themes
- Companies index: search, sort, and sector filters
- Company detail page: overview, supply chain, customer/supplier section, financial tables rendered from structured JSON blocks/tables
- Graph page: D3-driven theme graph using graph payloads served from `data/graph.db` through the API
- Wikilink detail page: all companies mentioning a specific entity
- Sector page: all companies in one sector

## Structured Detail Schema

Structured detail payloads under `structured_content.sections.*` use:

- `heading`: section label
- `blocks`: top-level content blocks
- `groups`: titled grouped subsections

Block types:

- `paragraph`: uses `segments`
- `list`: uses `items[].segments`
- `table`: uses `columns` and `rows`

Inline text is tokenized instead of left as markdown-like strings:

- `{ "type": "text", "text": "..." }`
- `{ "type": "strong", "text": "..." }`
- `{ "type": "wikilink", "text": "..." }`

This keeps styling and future link behavior in the UI layer without requiring the frontend to regex-parse `**...**` or `[[...]]`.

## Implementation Order

1. Keep markdown as the source of truth.
2. Rebuild `data/site.db` whenever `Pilot_Reports/` changes materially.
3. Re-export `Pilot_Reports_JSON/` whenever structured report output changes materially.
4. Keep summary/search data in SQLite and structured detail payloads in the mirrored JSON output.
5. Build the frontend against the API, not against filesystem reads.
6. Render detail prose/lists from inline token `segments` rather than markdown fallbacks.
7. Keep graph data in its own `data/graph.db` pipeline instead of merging it into `data/site.db`, and treat `graph/*.json` as derived exports from the same builder.

## Backend Recommendation

For the next step, use Python `FastAPI` for the read-only API:

- native fit with the current repo
- easy SQLite integration
- simple deployment behind an `Nginx` reverse proxy

## Frontend Recommendation

For the next step, use `Next.js` or `Vite + React`.

- `Next.js` if you want SSR/SEO and easier public deployment
- `Vite + React` if you want the smallest and fastest local build loop

For a public research site with company detail pages, `Next.js` is the better default.

## Deployment

- Recommended public edge: `Nginx`
- Recommended upstreams: `Next.js` on `127.0.0.1:3000`, `FastAPI` on `127.0.0.1:8000`
- Deployment reference: [deployment-nginx.md](deployment-nginx.md)
