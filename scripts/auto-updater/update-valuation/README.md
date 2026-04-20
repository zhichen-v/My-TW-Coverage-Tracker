# Auto Updater

This folder contains the scheduled valuation-refresh runner for the repo.

## Files

- `run_valuation_refresh.py`
  - Main orchestrator.
  - Runs `update_valuation.py`, retries unresolved tickers, then syncs derived data.
- `run_valuation_refresh.ps1`
  - Thin Windows wrapper that calls the Python runner through the repo `.venv`.
- `valuation_refresh_config.json`
  - Default runtime config.

## Pipeline

1. Preflight import check for `yfinance`
2. Smoke-ticker update on a small sample
3. Full-scope `scripts/update_valuation.py`
4. Targeted single-ticker retries for any `SKIP` or `ERROR` results
5. `scripts/export_reports_json.py`
6. `scripts/build_site_db.py`

## Run Manually

```powershell
.\.venv\Scripts\python.exe scripts\auto-updater\update-valuation\run_valuation_refresh.py
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\auto-updater\update-valuation\run_valuation_refresh.ps1
```

## Useful Overrides

```powershell
.\.venv\Scripts\python.exe scripts\auto-updater\update-valuation\run_valuation_refresh.py --tickers 2330 2317
.\.venv\Scripts\python.exe scripts\auto-updater\update-valuation\run_valuation_refresh.py --dry-run --no-smoke
```

## Scheduling

Program/script:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
```

Arguments:

```text
-NoProfile -ExecutionPolicy Bypass -File "C:\Users\user\Desktop\toy\My-TW-Coverage\scripts\auto-updater\update-valuation\run_valuation_refresh.ps1"
```

## Logs

Each run writes a timestamped log file under `scripts/auto-updater/update-valuation/logs/`.
