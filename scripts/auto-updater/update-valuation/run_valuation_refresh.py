from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


AUTO_UPDATER_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = AUTO_UPDATER_DIR.parent.parent
PROJECT_ROOT = SCRIPTS_DIR.parent
DEFAULT_CONFIG_PATH = AUTO_UPDATER_DIR / "valuation_refresh_config.json"
DEFAULT_LOG_DIR = AUTO_UPDATER_DIR / "logs"
DEFAULT_LOCK_PATH = AUTO_UPDATER_DIR / "valuation_refresh.lock"
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "site.db"
DEFAULT_SMOKE_TICKERS = ["2330", "2317", "2454"]
UPDATE_SCRIPT = SCRIPTS_DIR / "update_valuation.py"
EXPORT_SCRIPT = SCRIPTS_DIR / "export_reports_json.py"
BUILD_DB_SCRIPT = SCRIPTS_DIR / "build_site_db.py"
TASK_FILE = PROJECT_ROOT / "task.md"

STATUS_LINE_RE = re.compile(r"^\s*(\d{4}):\s+(UPDATED|WOULD UPDATE|SKIP|ERROR)\b")
REPORT_FILE_RE = re.compile(r"^(?P<ticker>\d{4})_.+\.md$")


@dataclass
class StepResult:
    name: str
    command: list[str]
    returncode: int
    output: str
    timed_out: bool = False


@dataclass
class UpdateOutcome:
    status: str
    attempts: int
    last_output: str


class Logger:
    def __init__(self, log_dir: Path) -> None:
        log_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.log_path = log_dir / f"valuation-refresh-{timestamp}.log"
        self._handle = self.log_path.open("a", encoding="utf-8")

    def close(self) -> None:
        self._handle.close()

    def line(self, message: str = "") -> None:
        print(message)
        self._handle.write(f"{message}\n")
        self._handle.flush()

    def section(self, title: str) -> None:
        self.line("")
        self.line(f"== {title} ==")

    def command(self, command: list[str]) -> None:
        self.line(f"$ {' '.join(command)}")

    def block(self, text: str) -> None:
        if not text:
            return
        for raw_line in text.rstrip().splitlines():
            self.line(raw_line)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run the valuation-refresh pipeline with retries, optional smoke tickers, "
            "JSON export, and site-db rebuild."
        )
    )
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="Path to JSON config file.")
    parser.add_argument("--all", action="store_true", help="Refresh all ticker reports.")
    parser.add_argument("--tickers", nargs="+", help="Refresh only the given tickers.")
    parser.add_argument("--batch", help="Refresh the tickers listed in task.md batch.")
    parser.add_argument("--sector", help="Refresh all tickers in a sector folder.")
    parser.add_argument("--smoke-tickers", nargs="+", help="Override the configured smoke tickers.")
    parser.add_argument("--update-retries", type=int, help="Per-ticker retry count after the first failed attempt.")
    parser.add_argument("--retry-delay-seconds", type=int, help="Delay between retry attempts.")
    parser.add_argument("--update-timeout-seconds", type=int, help="Timeout for update_valuation.py runs.")
    parser.add_argument("--json-timeout-seconds", type=int, help="Timeout for export_reports_json.py.")
    parser.add_argument("--db-timeout-seconds", type=int, help="Timeout for build_site_db.py.")
    parser.add_argument("--db-path", help="Override the output path passed to build_site_db.py.")
    parser.add_argument("--skip-json-export", action="store_true", help="Skip export_reports_json.py.")
    parser.add_argument("--skip-db-build", action="store_true", help="Skip build_site_db.py.")
    parser.add_argument("--no-smoke", action="store_true", help="Disable the configured smoke-ticker phase.")
    parser.add_argument("--no-preflight", action="store_true", help="Skip the import preflight check.")
    parser.add_argument("--dry-run", action="store_true", help="Pass --dry-run to update_valuation.py.")
    return parser.parse_args()


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_tickers(values: list[str] | None) -> list[str]:
    if not values:
        return []
    return [value.strip() for value in values if re.fullmatch(r"\d{4}", value.strip())]


def resolve_settings(args: argparse.Namespace, config: dict[str, Any]) -> dict[str, Any]:
    scope_config = config.get("scope", {})

    settings: dict[str, Any] = {
        "scope_mode": scope_config.get("mode", "all"),
        "scope_tickers": normalize_tickers(scope_config.get("tickers")),
        "scope_batch": str(scope_config.get("batch", "")).strip() or None,
        "scope_sector": str(scope_config.get("sector", "")).strip() or None,
        "smoke_tickers": normalize_tickers(config.get("smoke_tickers")) or DEFAULT_SMOKE_TICKERS,
        "update_retries": int(config.get("update_retries", 2)),
        "retry_delay_seconds": int(config.get("retry_delay_seconds", 30)),
        "update_timeout_seconds": int(config.get("update_timeout_seconds", 3600)),
        "json_timeout_seconds": int(config.get("json_timeout_seconds", 1800)),
        "db_timeout_seconds": int(config.get("db_timeout_seconds", 1800)),
        "skip_json_export": bool(config.get("skip_json_export", False)),
        "skip_db_build": bool(config.get("skip_db_build", False)),
        "db_path": str(config.get("db_path", "")).strip() or str(DEFAULT_DB_PATH),
    }

    if args.all:
        settings["scope_mode"] = "all"
        settings["scope_tickers"] = []
        settings["scope_batch"] = None
        settings["scope_sector"] = None
    if args.tickers:
        settings["scope_mode"] = "tickers"
        settings["scope_tickers"] = normalize_tickers(args.tickers)
        settings["scope_batch"] = None
        settings["scope_sector"] = None
    if args.batch:
        settings["scope_mode"] = "batch"
        settings["scope_batch"] = args.batch.strip()
        settings["scope_tickers"] = []
        settings["scope_sector"] = None
    if args.sector:
        settings["scope_mode"] = "sector"
        settings["scope_sector"] = args.sector.strip()
        settings["scope_tickers"] = []
        settings["scope_batch"] = None
    if args.smoke_tickers is not None:
        settings["smoke_tickers"] = normalize_tickers(args.smoke_tickers)
    if args.update_retries is not None:
        settings["update_retries"] = max(args.update_retries, 0)
    if args.retry_delay_seconds is not None:
        settings["retry_delay_seconds"] = max(args.retry_delay_seconds, 0)
    if args.update_timeout_seconds is not None:
        settings["update_timeout_seconds"] = max(args.update_timeout_seconds, 1)
    if args.json_timeout_seconds is not None:
        settings["json_timeout_seconds"] = max(args.json_timeout_seconds, 1)
    if args.db_timeout_seconds is not None:
        settings["db_timeout_seconds"] = max(args.db_timeout_seconds, 1)
    if args.db_path:
        settings["db_path"] = args.db_path
    if args.skip_json_export:
        settings["skip_json_export"] = True
    if args.skip_db_build:
        settings["skip_db_build"] = True
    if args.no_smoke:
        settings["smoke_tickers"] = []

    settings["no_preflight"] = bool(args.no_preflight)
    settings["dry_run"] = bool(args.dry_run)

    validate_scope(settings)
    return settings


def validate_scope(settings: dict[str, Any]) -> None:
    mode = settings["scope_mode"]
    if mode == "tickers" and not settings["scope_tickers"]:
        raise SystemExit("Ticker mode requires at least one 4-digit ticker.")
    if mode == "batch" and not settings["scope_batch"]:
        raise SystemExit("Batch mode requires a batch number.")
    if mode == "sector" and not settings["scope_sector"]:
        raise SystemExit("Sector mode requires a sector folder name.")
    if mode not in {"all", "tickers", "batch", "sector"}:
        raise SystemExit(f"Unsupported scope mode: {mode}")


def get_python_executable() -> Path:
    if os.name == "nt":
        python_path = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
    else:
        python_path = PROJECT_ROOT / ".venv" / "bin" / "python"
    if not python_path.exists():
        raise SystemExit(f"Python interpreter not found: {python_path}")
    return python_path


def build_scope_args(settings: dict[str, Any]) -> list[str]:
    mode = settings["scope_mode"]
    if mode == "tickers":
        return list(settings["scope_tickers"])
    if mode == "batch":
        return ["--batch", settings["scope_batch"]]
    if mode == "sector":
        return ["--sector", settings["scope_sector"]]
    return []


def describe_scope(settings: dict[str, Any]) -> str:
    mode = settings["scope_mode"]
    if mode == "tickers":
        return ", ".join(settings["scope_tickers"])
    if mode == "batch":
        return f"batch {settings['scope_batch']}"
    if mode == "sector":
        return f"sector {settings['scope_sector']}"
    return "all tickers"


def parse_batch_tickers(batch: str) -> list[str]:
    if not TASK_FILE.exists():
        return []
    content = TASK_FILE.read_text(encoding="utf-8")
    pattern = re.compile(rf"Batch\s+{re.escape(batch)}\*\*.*?:[:\s]*(.*)$", re.IGNORECASE | re.MULTILINE)
    match = pattern.search(content)
    if not match:
        return []
    values = []
    for chunk in match.group(1).strip().rstrip(".").split(","):
        ticker_match = re.search(r"(\d{4})", chunk)
        if ticker_match:
            values.append(ticker_match.group(1))
    return values


def resolve_scope_tickers(settings: dict[str, Any]) -> list[str]:
    mode = settings["scope_mode"]
    if mode == "tickers":
        return list(settings["scope_tickers"])
    if mode == "batch":
        return parse_batch_tickers(settings["scope_batch"])

    tickers: list[str] = []
    reports_dir = PROJECT_ROOT / "Pilot_Reports"
    for report_path in sorted(reports_dir.rglob("*.md")):
        filename_match = REPORT_FILE_RE.match(report_path.name)
        if not filename_match:
            continue
        if mode == "sector" and report_path.parent.name.lower() != settings["scope_sector"].lower():
            continue
        tickers.append(filename_match.group("ticker"))
    return tickers


def acquire_lock(path: Path) -> None:
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as exc:
        raise SystemExit(
            f"Another auto-updater run appears to be active. Remove the lock file if stale: {path}"
        ) from exc
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(f"{os.getpid()}\n")
        handle.write(f"{datetime.now(timezone.utc).isoformat()}\n")


def release_lock(path: Path) -> None:
    if path.exists():
        path.unlink()


def run_command(name: str, command: list[str], timeout_seconds: int, logger: Logger) -> StepResult:
    logger.section(name)
    logger.command(command)
    try:
        completed = subprocess.run(
            command,
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
        )
        output = (completed.stdout or "") + (completed.stderr or "")
        logger.block(output)
        logger.line(f"[exit] {completed.returncode}")
        return StepResult(name=name, command=command, returncode=completed.returncode, output=output)
    except subprocess.TimeoutExpired as exc:
        output = (exc.stdout or "") + (exc.stderr or "")
        logger.block(output)
        logger.line(f"[timeout] exceeded {timeout_seconds} seconds")
        return StepResult(name=name, command=command, returncode=1, output=output, timed_out=True)


def parse_statuses(output: str) -> dict[str, str]:
    statuses: dict[str, str] = {}
    for line in output.splitlines():
        match = STATUS_LINE_RE.match(line)
        if not match:
            continue
        ticker, raw_status = match.groups()
        if raw_status in {"UPDATED", "WOULD UPDATE"}:
            statuses[ticker] = "updated"
        elif raw_status == "SKIP":
            statuses[ticker] = "skipped"
        else:
            statuses[ticker] = "error"
    return statuses


def run_preflight(python_executable: Path, logger: Logger) -> None:
    command = [str(python_executable), "-c", "import yfinance; print('preflight-ok')"]
    result = run_command("Preflight import check", command, timeout_seconds=120, logger=logger)
    if result.returncode != 0:
        raise SystemExit("Preflight failed. Fix the Python environment before scheduling the updater.")


def run_single_ticker_update(
    python_executable: Path,
    ticker: str,
    settings: dict[str, Any],
    logger: Logger,
    label_prefix: str,
) -> UpdateOutcome:
    attempts_allowed = settings["update_retries"] + 1
    scope_args = [ticker]
    if settings["dry_run"]:
        scope_args.append("--dry-run")

    last_output = ""
    for attempt in range(1, attempts_allowed + 1):
        step_name = f"{label_prefix} {ticker} (attempt {attempt}/{attempts_allowed})"
        command = [str(python_executable), str(UPDATE_SCRIPT), *scope_args]
        result = run_command(step_name, command, settings["update_timeout_seconds"], logger)
        last_output = result.output
        statuses = parse_statuses(result.output)
        status = statuses.get(ticker)

        if result.returncode == 0 and status == "updated":
            return UpdateOutcome(status="updated", attempts=attempt, last_output=last_output)

        if attempt < attempts_allowed:
            logger.line(
                f"Retrying {ticker} after {settings['retry_delay_seconds']} seconds "
                f"(last status: {status or 'unknown'})."
            )
            time.sleep(settings["retry_delay_seconds"])

    final_status = parse_statuses(last_output).get(ticker) or "error"
    return UpdateOutcome(status=final_status, attempts=attempts_allowed, last_output=last_output)


def run_smoke_phase(python_executable: Path, settings: dict[str, Any], logger: Logger) -> dict[str, UpdateOutcome]:
    smoke_tickers = list(dict.fromkeys(settings["smoke_tickers"]))
    if not smoke_tickers:
        return {}

    logger.section("Smoke tickers")
    logger.line(f"Smoke tickers: {', '.join(smoke_tickers)}")

    outcomes: dict[str, UpdateOutcome] = {}
    for ticker in smoke_tickers:
        outcomes[ticker] = run_single_ticker_update(
            python_executable=python_executable,
            ticker=ticker,
            settings=settings,
            logger=logger,
            label_prefix="Smoke refresh",
        )

    unresolved = [ticker for ticker, outcome in outcomes.items() if outcome.status != "updated"]
    if unresolved:
        raise SystemExit(
            "Smoke phase did not pass for: " + ", ".join(unresolved) + ". Aborting before the full-scope refresh."
        )
    return outcomes


def run_full_refresh(
    python_executable: Path,
    settings: dict[str, Any],
    expected_tickers: list[str],
    logger: Logger,
) -> tuple[dict[str, str], bool]:
    scope_args = build_scope_args(settings)
    if settings["dry_run"]:
        scope_args.append("--dry-run")

    command = [str(python_executable), str(UPDATE_SCRIPT), *scope_args]
    result = run_command("Full valuation refresh", command, settings["update_timeout_seconds"], logger)
    if result.returncode != 0:
        logger.line("The full-scope update command exited non-zero. Continuing into targeted retries.")

    initial_statuses = parse_statuses(result.output)
    missing_tickers = sorted(set(expected_tickers) - set(initial_statuses))
    for ticker in missing_tickers:
        initial_statuses[ticker] = "error"

    retry_candidates = sorted(ticker for ticker, status in initial_statuses.items() if status in {"skipped", "error"})
    if retry_candidates:
        logger.section("Targeted ticker retries")
        logger.line("Retry candidates: " + ", ".join(retry_candidates))

    final_statuses = dict(initial_statuses)
    for ticker in retry_candidates:
        outcome = run_single_ticker_update(
            python_executable=python_executable,
            ticker=ticker,
            settings=settings,
            logger=logger,
            label_prefix="Targeted retry",
        )
        final_statuses[ticker] = outcome.status

    catastrophic_failure = result.returncode != 0 and not initial_statuses
    return final_statuses, catastrophic_failure


def run_export_and_build(python_executable: Path, settings: dict[str, Any], logger: Logger) -> bool:
    if settings["dry_run"]:
        logger.section("Derived-data sync")
        logger.line("Dry-run mode: skipping export_reports_json.py and build_site_db.py.")
        return True

    if not settings["skip_json_export"]:
        export_result = run_command(
            "Export structured JSON",
            [str(python_executable), str(EXPORT_SCRIPT)],
            settings["json_timeout_seconds"],
            logger,
        )
        if export_result.returncode != 0:
            return False

    if not settings["skip_db_build"]:
        build_result = run_command(
            "Build site database",
            [str(python_executable), str(BUILD_DB_SCRIPT), "--db-path", settings["db_path"]],
            settings["db_timeout_seconds"],
            logger,
        )
        if build_result.returncode != 0:
            return False

    return True


def print_summary(settings: dict[str, Any], final_statuses: dict[str, str], logger: Logger) -> tuple[int, int, int]:
    updated = sorted(ticker for ticker, status in final_statuses.items() if status == "updated")
    skipped = sorted(ticker for ticker, status in final_statuses.items() if status == "skipped")
    failed = sorted(ticker for ticker, status in final_statuses.items() if status == "error")

    logger.section("Summary")
    logger.line(f"Scope: {describe_scope(settings)}")
    logger.line(f"Updated: {len(updated)}")
    logger.line(f"Skipped: {len(skipped)}")
    logger.line(f"Failed: {len(failed)}")
    if skipped:
        logger.line("Skipped tickers: " + ", ".join(skipped))
    if failed:
        logger.line("Failed tickers: " + ", ".join(failed))

    return len(updated), len(skipped), len(failed)


def main() -> int:
    args = parse_args()
    config_path = Path(args.config).resolve()
    config = load_config(config_path)
    settings = resolve_settings(args, config)

    python_executable = get_python_executable()
    logger = Logger(DEFAULT_LOG_DIR)
    lock_acquired = False

    try:
        acquire_lock(DEFAULT_LOCK_PATH)
        lock_acquired = True

        logger.section("Valuation refresh pipeline")
        logger.line(f"Project root: {PROJECT_ROOT}")
        logger.line(f"Config: {config_path}")
        logger.line(f"Log file: {logger.log_path}")
        logger.line(f"Scope: {describe_scope(settings)}")

        if not settings["no_preflight"]:
            run_preflight(python_executable, logger)

        scope_tickers = resolve_scope_tickers(settings)
        if settings["scope_mode"] != "all" and not scope_tickers:
            raise SystemExit("The chosen scope resolved to zero tickers.")
        if scope_tickers:
            logger.line(f"Resolved tickers in scope: {len(scope_tickers)}")

        run_smoke_phase(python_executable, settings, logger)
        final_statuses, catastrophic_failure = run_full_refresh(
            python_executable,
            settings,
            scope_tickers,
            logger,
        )

        updated_count, skipped_count, failed_count = print_summary(settings, final_statuses, logger)

        if catastrophic_failure:
            logger.line("The full-scope update failed before ticker-level statuses could be parsed.")
            return 1

        if updated_count == 0 and (skipped_count > 0 or failed_count > 0):
            logger.line("No ticker updates succeeded. Skipping JSON export and DB rebuild.")
            return 1

        derived_ok = run_export_and_build(python_executable, settings, logger)
        if not derived_ok:
            logger.line("Derived-data sync failed.")
            return 1

        if skipped_count > 0 or failed_count > 0:
            logger.line("Valuation refresh completed with unresolved tickers.")
            return 1

        logger.line("Valuation refresh completed successfully.")
        return 0
    finally:
        if lock_acquired:
            release_lock(DEFAULT_LOCK_PATH)
        logger.close()


if __name__ == "__main__":
    sys.exit(main())
