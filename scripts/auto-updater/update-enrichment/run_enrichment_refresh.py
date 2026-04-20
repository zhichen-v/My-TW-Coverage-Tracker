from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


AUTO_UPDATER_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = AUTO_UPDATER_DIR.parent.parent
PROJECT_ROOT = SCRIPTS_DIR.parent
DEFAULT_CONFIG_PATH = AUTO_UPDATER_DIR / "enrichment_refresh_config.json"
DEFAULT_LOG_DIR = AUTO_UPDATER_DIR / "logs"
DEFAULT_LOCK_PATH = AUTO_UPDATER_DIR / "enrichment_refresh.lock"
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "site.db"
DEFAULT_DATA_PATH = AUTO_UPDATER_DIR / "enrichment_payload.json"
UPDATE_SCRIPT = SCRIPTS_DIR / "update_enrichment.py"
EXPORT_SCRIPT = SCRIPTS_DIR / "export_reports_json.py"
BUILD_DB_SCRIPT = SCRIPTS_DIR / "build_site_db.py"
WIKILINK_SCRIPT = SCRIPTS_DIR / "build_wikilink_index.py"
TASK_FILE = PROJECT_ROOT / "task.md"

STATUS_LINE_RE = re.compile(r"^\s*(\d{4}):\s+(ENRICHED|WOULD ENRICH|SKIP|ERROR)\b")


@dataclass
class StepResult:
    name: str
    command: list[str]
    returncode: int
    output: str
    timed_out: bool = False


class Logger:
    def __init__(self, log_dir: Path) -> None:
        log_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.log_path = log_dir / f"enrichment-refresh-{timestamp}.log"
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
            "Run the enrichment-refresh pipeline with optional dry-run validation, "
            "JSON export, site-db rebuild, and optional wikilink-index rebuild."
        )
    )
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="Path to JSON config file.")
    parser.add_argument("--data", help="Override the enrichment JSON file path.")
    parser.add_argument("--all", action="store_true", help="Apply all ticker entries from the enrichment JSON.")
    parser.add_argument("--tickers", nargs="+", help="Apply only the given tickers.")
    parser.add_argument("--batch", help="Apply the tickers listed in task.md batch.")
    parser.add_argument("--sector", help="Apply all tickers in a sector folder.")
    parser.add_argument("--smoke-tickers", nargs="+", help="Override the configured smoke tickers.")
    parser.add_argument("--skip-json-export", action="store_true", help="Skip export_reports_json.py.")
    parser.add_argument("--skip-db-build", action="store_true", help="Skip build_site_db.py.")
    parser.add_argument("--rebuild-wikilink-index", action="store_true", help="Run build_wikilink_index.py after updates.")
    parser.add_argument("--json-timeout-seconds", type=int, help="Timeout for export_reports_json.py.")
    parser.add_argument("--db-timeout-seconds", type=int, help="Timeout for build_site_db.py.")
    parser.add_argument("--wikilink-timeout-seconds", type=int, help="Timeout for build_wikilink_index.py.")
    parser.add_argument("--update-timeout-seconds", type=int, help="Timeout for update_enrichment.py runs.")
    parser.add_argument("--db-path", help="Override the output path passed to build_site_db.py.")
    parser.add_argument("--no-smoke", action="store_true", help="Disable the configured smoke-ticker phase.")
    parser.add_argument("--dry-run", action="store_true", help="Pass --dry-run to update_enrichment.py.")
    return parser.parse_args()


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_enrichment_payload(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8-sig") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit("Enrichment payload must be a JSON object keyed by ticker.")
    return data


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
        "smoke_tickers": normalize_tickers(config.get("smoke_tickers")),
        "update_timeout_seconds": int(config.get("update_timeout_seconds", 1800)),
        "json_timeout_seconds": int(config.get("json_timeout_seconds", 1800)),
        "db_timeout_seconds": int(config.get("db_timeout_seconds", 1800)),
        "wikilink_timeout_seconds": int(config.get("wikilink_timeout_seconds", 1800)),
        "skip_json_export": bool(config.get("skip_json_export", False)),
        "skip_db_build": bool(config.get("skip_db_build", False)),
        "rebuild_wikilink_index": bool(config.get("rebuild_wikilink_index", False)),
        "db_path": str(config.get("db_path", "")).strip() or str(DEFAULT_DB_PATH),
        "data_path": str(config.get("data_path", "")).strip() or str(DEFAULT_DATA_PATH),
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
    if args.data:
        settings["data_path"] = args.data
    if args.smoke_tickers is not None:
        settings["smoke_tickers"] = normalize_tickers(args.smoke_tickers)
    if args.update_timeout_seconds is not None:
        settings["update_timeout_seconds"] = max(args.update_timeout_seconds, 1)
    if args.json_timeout_seconds is not None:
        settings["json_timeout_seconds"] = max(args.json_timeout_seconds, 1)
    if args.db_timeout_seconds is not None:
        settings["db_timeout_seconds"] = max(args.db_timeout_seconds, 1)
    if args.wikilink_timeout_seconds is not None:
        settings["wikilink_timeout_seconds"] = max(args.wikilink_timeout_seconds, 1)
    if args.db_path:
        settings["db_path"] = args.db_path
    if args.skip_json_export:
        settings["skip_json_export"] = True
    if args.skip_db_build:
        settings["skip_db_build"] = True
    if args.rebuild_wikilink_index:
        settings["rebuild_wikilink_index"] = True
    if args.no_smoke:
        settings["smoke_tickers"] = []

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


def describe_scope(settings: dict[str, Any]) -> str:
    mode = settings["scope_mode"]
    if mode == "tickers":
        return ", ".join(settings["scope_tickers"])
    if mode == "batch":
        return f"batch {settings['scope_batch']}"
    if mode == "sector":
        return f"sector {settings['scope_sector']}"
    return "all payload tickers"


def resolve_scope_tickers(settings: dict[str, Any], payload: dict[str, Any]) -> list[str]:
    mode = settings["scope_mode"]
    if mode == "all":
        return sorted(payload.keys())
    if mode == "tickers":
        return list(settings["scope_tickers"])
    if mode == "batch":
        return parse_batch_tickers(settings["scope_batch"])
    return []


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
        if raw_status in {"ENRICHED", "WOULD ENRICH"}:
            statuses[ticker] = "updated"
        elif raw_status == "SKIP":
            statuses[ticker] = "skipped"
        else:
            statuses[ticker] = "error"
    return statuses


def build_scope_args(settings: dict[str, Any]) -> list[str]:
    mode = settings["scope_mode"]
    if mode == "tickers":
        return list(settings["scope_tickers"])
    if mode == "batch":
        return ["--batch", settings["scope_batch"]]
    if mode == "sector":
        return ["--sector", settings["scope_sector"]]
    return []


def build_enrichment_command(python_executable: Path, settings: dict[str, Any], *, scope_args: list[str], dry_run: bool) -> list[str]:
    command = [
        str(python_executable),
        str(UPDATE_SCRIPT),
        "--data",
        settings["data_path"],
        *scope_args,
    ]
    if dry_run:
        command.append("--dry-run")
    return command


def run_smoke_phase(python_executable: Path, settings: dict[str, Any], payload: dict[str, Any], logger: Logger) -> None:
    smoke_tickers = [ticker for ticker in dict.fromkeys(settings["smoke_tickers"]) if ticker in payload]
    if not smoke_tickers:
        return

    command = build_enrichment_command(
        python_executable,
        settings,
        scope_args=smoke_tickers,
        dry_run=True,
    )
    result = run_command("Smoke enrichment dry-run", command, settings["update_timeout_seconds"], logger)
    statuses = parse_statuses(result.output)
    unresolved = [ticker for ticker in smoke_tickers if statuses.get(ticker) != "updated"]
    if result.returncode != 0 or unresolved:
        raise SystemExit(
            "Smoke enrichment validation failed for: " + ", ".join(unresolved or smoke_tickers)
        )


def run_full_refresh(
    python_executable: Path,
    settings: dict[str, Any],
    logger: Logger,
) -> dict[str, str]:
    command = build_enrichment_command(
        python_executable,
        settings,
        scope_args=build_scope_args(settings),
        dry_run=settings["dry_run"],
    )
    result = run_command("Full enrichment refresh", command, settings["update_timeout_seconds"], logger)
    if result.returncode != 0:
        raise SystemExit("The enrichment update command exited non-zero.")
    return parse_statuses(result.output)


def run_derived_sync(python_executable: Path, settings: dict[str, Any], logger: Logger) -> bool:
    if settings["dry_run"]:
        logger.section("Derived-data sync")
        logger.line("Dry-run mode: skipping export_reports_json.py, build_site_db.py, and wikilink rebuild.")
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
        db_result = run_command(
            "Build site database",
            [str(python_executable), str(BUILD_DB_SCRIPT), "--db-path", settings["db_path"]],
            settings["db_timeout_seconds"],
            logger,
        )
        if db_result.returncode != 0:
            return False

    if settings["rebuild_wikilink_index"]:
        wikilink_result = run_command(
            "Build wikilink index",
            [str(python_executable), str(WIKILINK_SCRIPT)],
            settings["wikilink_timeout_seconds"],
            logger,
        )
        if wikilink_result.returncode != 0:
            return False

    return True


def print_summary(settings: dict[str, Any], statuses: dict[str, str], logger: Logger) -> tuple[int, int, int]:
    updated = sorted(ticker for ticker, status in statuses.items() if status == "updated")
    skipped = sorted(ticker for ticker, status in statuses.items() if status == "skipped")
    failed = sorted(ticker for ticker, status in statuses.items() if status == "error")

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

    data_path = Path(settings["data_path"])
    if not data_path.is_absolute():
        data_path = (PROJECT_ROOT / data_path).resolve()
    settings["data_path"] = str(data_path)

    if not data_path.exists():
        raise SystemExit(f"Enrichment payload not found: {data_path}")

    payload = load_enrichment_payload(data_path)
    if not payload:
        raise SystemExit(f"Enrichment payload is empty: {data_path}")

    python_executable = get_python_executable()
    logger = Logger(DEFAULT_LOG_DIR)
    lock_acquired = False

    try:
        acquire_lock(DEFAULT_LOCK_PATH)
        lock_acquired = True

        logger.section("Enrichment refresh pipeline")
        logger.line(f"Project root: {PROJECT_ROOT}")
        logger.line(f"Config: {config_path}")
        logger.line(f"Payload: {data_path}")
        logger.line(f"Log file: {logger.log_path}")
        logger.line(f"Scope: {describe_scope(settings)}")
        logger.line(f"Payload tickers: {len(payload)}")

        scope_tickers = resolve_scope_tickers(settings, payload)
        if settings["scope_mode"] != "all" and not scope_tickers:
            raise SystemExit("The chosen scope resolved to zero tickers.")
        if scope_tickers:
            logger.line(f"Resolved tickers in scope: {len(scope_tickers)}")

        run_smoke_phase(python_executable, settings, payload, logger)
        statuses = run_full_refresh(python_executable, settings, logger)
        updated_count, skipped_count, failed_count = print_summary(settings, statuses, logger)

        if updated_count == 0 and (skipped_count > 0 or failed_count > 0):
            logger.line("No enrichment updates succeeded. Skipping derived-data sync.")
            return 1

        if not run_derived_sync(python_executable, settings, logger):
            logger.line("Derived-data sync failed.")
            return 1

        if failed_count > 0:
            logger.line("Enrichment refresh completed with unresolved tickers.")
            return 1

        logger.line("Enrichment refresh completed successfully.")
        return 0
    finally:
        if lock_acquired:
            release_lock(DEFAULT_LOCK_PATH)
        logger.close()


if __name__ == "__main__":
    sys.exit(main())
