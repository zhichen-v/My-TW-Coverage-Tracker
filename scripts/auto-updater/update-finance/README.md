# Auto Updater

This folder contains the scheduled financial-refresh runner for the repo.

## Files

- `run_financial_refresh.py`
  - Main orchestrator.
  - Runs `update_financials.py`, retries unresolved tickers, then syncs derived data.
- `run_financial_refresh.ps1`
  - Thin Windows wrapper that calls the Python runner through the repo `.venv`.
  - This is the easiest file to point Windows Task Scheduler at.
- `financial_refresh_config.json`
  - Default runtime config.
  - Edit this file to change scope, smoke tickers, retries, or timeouts.

## Pipeline

The runner uses this order:

1. Preflight import check for `numpy`, `pandas`, and `yfinance`
2. Smoke-ticker update on the configured small sample
3. Full-scope `scripts/update_financials.py`
4. Targeted single-ticker retries for any `SKIP` or `ERROR` results
5. `scripts/export_reports_json.py`
6. `scripts/build_site_db.py`

`export_reports_json.py` is included on purpose. The public site does not read only `data/site.db`; company detail pages also depend on `Pilot_Reports_JSON/`.

## Run Manually

From the repo root:

```powershell
.\.venv\Scripts\python.exe scripts\auto-updater\update-finance\run_financial_refresh.py
```

Or via the Windows wrapper:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\auto-updater\update-finance\run_financial_refresh.ps1
```

## Useful Overrides

```powershell
.\.venv\Scripts\python.exe scripts\auto-updater\update-finance\run_financial_refresh.py --tickers 2330 2317
.\.venv\Scripts\python.exe scripts\auto-updater\update-finance\run_financial_refresh.py --sector Semiconductors
.\.venv\Scripts\python.exe scripts\auto-updater\update-finance\run_financial_refresh.py --batch 101
.\.venv\Scripts\python.exe scripts\auto-updater\update-finance\run_financial_refresh.py --dry-run --no-smoke
```

## Scheduling

Use Windows Task Scheduler and schedule `run_financial_refresh.ps1` at your chosen fixed time.

Program/script:

```text
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
```

Arguments:

```text
-NoProfile -ExecutionPolicy Bypass -File "C:\Users\user\Desktop\toy\My-TW-Coverage\scripts\auto-updater\update-finance\run_financial_refresh.ps1"
```

Optional alternative if you want to point the scheduled task at a different config:

```text
-NoProfile -ExecutionPolicy Bypass -File "C:\Users\user\Desktop\toy\My-TW-Coverage\scripts\auto-updater\update-finance\run_financial_refresh.ps1" -ConfigPath "C:\Users\user\Desktop\toy\My-TW-Coverage\scripts\auto-updater\update-finance\financial_refresh_config.json"
```

## Logs

Each run writes a timestamped log file under `scripts/auto-updater/logs/`.

The runner also creates a lock file at `scripts/auto-updater/financial_refresh.lock` so overlapping scheduled runs do not step on each other.
