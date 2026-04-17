# API

## Purpose

Expose `data/site.db` through a read-only HTTP API for the public website.

## Prerequisites

Install dependencies in the project venv:

```powershell
uv pip install -r requirements.txt
```

Rebuild the site database before starting the API if `Pilot_Reports/` changed:

```powershell
.\.venv\Scripts\python.exe scripts\build_site_db.py
```

Re-export the mirrored structured JSON before starting the API if report structure changed:

```powershell
.\.venv\Scripts\python.exe scripts\export_reports_json.py
```

Rebuild the theme graph JSON before using the `/graph` page if `themes/` or graph-derived company mappings changed:

```powershell
.\.venv\Scripts\python.exe scripts\build_theme_graph.py
```

## Run

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.app:app --reload
```

Then open:

- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

## Endpoints

- `GET /health`
- `GET /api/sectors`
- `GET /api/companies?q=2330`
- `GET /api/companies?q=2330&limit=30&offset=30`
- `GET /api/companies/{ticker}`
- `GET /api/reports/{report_id}`
- `GET /api/wikilinks`
- `GET /api/wikilinks/{name}`
- `GET /api/search?q=AI`
- `GET /api/graph`

## Structured Detail Payloads

- `GET /api/companies/{ticker}` and `GET /api/reports/{report_id}` now include:
- `structured_content`: structured JSON loaded from the mirrored file under `Pilot_Reports_JSON/`
- `structured_report_path`: relative path to the mirrored JSON file
- Detail payloads no longer expose the legacy `overview_text`, `supply_chain_text`, `customer_supplier_text`, or `financials_text` markdown fields.
- Section objects under `structured_content.sections.*` expose only structured `heading`, `blocks`, and `groups` data; the intermediate per-section `markdown` strings are not part of the public API.
- Paragraph blocks now expose `segments`, and list blocks expose `items[].segments`, using inline token objects such as `{ "type": "text" | "strong" | "wikilink", "text": "..." }`.

## Structured List Payloads

- `GET /api/companies` now also includes:
- `structured_summary`: lightweight structured summary derived from the mirrored report JSON for list/homepage rendering
- `structured_report_path`: relative path to the mirrored JSON file
- `total_count`, `limit`, and `offset`: pagination metadata for client-side list pagination
- The list payload keeps the existing flat company fields so older clients continue to work.

## Notes

- `Pilot_Reports/` remains the source of truth.
- `Pilot_Reports_JSON/` is a derived mirror for structured report output and should be regenerated, not edited by hand.
- `graph/theme_graph.json` and `graph/theme_company_map.json` are derived artifacts for the `/graph` page and should be regenerated, not edited by hand.
- `ticker` is not assumed to be globally unique forever, so the API also exposes `report_id`.
- The API is read-only by design.
- For public deployment behind `Nginx`, see [deployment-nginx.md](deployment-nginx.md).
