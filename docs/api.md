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
- `GET /api/companies/{ticker}`
- `GET /api/reports/{report_id}`
- `GET /api/wikilinks`
- `GET /api/wikilinks/{name}`
- `GET /api/search?q=AI`

## Notes

- `Pilot_Reports/` remains the source of truth.
- `ticker` is not assumed to be globally unique forever, so the API also exposes `report_id`.
- The API is read-only by design.
- For public deployment behind `Nginx`, see [deployment-nginx.md](deployment-nginx.md).
