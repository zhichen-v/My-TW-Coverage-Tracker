# Auto Updater

This folder contains the scheduled enrichment-refresh runner for the repo.

## Files

- `run_enrichment_refresh.py`
  - Main orchestrator.
  - Runs `update_enrichment.py` with a configured JSON payload, then syncs derived data.
- `run_enrichment_refresh.ps1`
  - Thin Windows wrapper that calls the Python runner through the repo `.venv`.
- `enrichment_refresh_config.json`
  - Default runtime config.
- `enrichment_payload.json`
  - The default payload file path referenced by the config.
  - Replace this empty JSON object with real enrichment data before running the updater.

## Pipeline

1. Optional smoke dry-run on configured sample tickers
2. Full-scope `scripts/update_enrichment.py --data ...`
3. `scripts/export_reports_json.py`
4. `scripts/build_site_db.py`
5. Optional `scripts/build_wikilink_index.py`

## Run Manually

```powershell
.\.venv\Scripts\python.exe scripts\auto-updater\update-enrichment\run_enrichment_refresh.py
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\auto-updater\update-enrichment\run_enrichment_refresh.ps1
```

## Useful Overrides

```powershell
.\.venv\Scripts\python.exe scripts\auto-updater\update-enrichment\run_enrichment_refresh.py --data .\my-enrichment.json --tickers 2330 --dry-run
.\.venv\Scripts\python.exe scripts\auto-updater\update-enrichment\run_enrichment_refresh.py --data .\my-enrichment.json --rebuild-wikilink-index
```

## Scheduling

Program/script:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
```

Arguments:

```text
-NoProfile -ExecutionPolicy Bypass -File "C:\Users\user\Desktop\toy\My-TW-Coverage\scripts\auto-updater\update-enrichment\run_enrichment_refresh.ps1"
```

## Logs

Each run writes a timestamped log file under `scripts/auto-updater/update-enrichment/logs/`.
