"""
Build a SQLite database for the public-facing website from Pilot_Reports markdown.

The markdown files remain the source of truth. This script creates a query-friendly
SQLite snapshot that a future API/frontend can read without reparsing thousands of
markdown files on every request.
"""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from utils import REPORTS_DIR, classify_wikilink, get_ticker_from_filename

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "data", "site.db")
WIKILINK_PATTERN = re.compile(r"\[\[([^\]]+)\]\]")
H2_PATTERN = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
METADATA_LINE_PATTERN = re.compile(r"^\*\*(.+?)\*\*\s*:?\s*(.+?)\s*$")


@dataclass
class ParsedReport:
    report_id: str
    ticker: str
    company_name: str
    title: str
    report_path: str
    sector_folder: str
    metadata_sector: str
    metadata_industry: str
    market_cap_text: str
    enterprise_value_text: str
    overview_text: str
    supply_chain_text: str
    customer_supplier_text: str
    financials_text: str
    wikilinks_by_section: dict[str, Counter]
    all_wikilinks: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build SQLite site database from Pilot_Reports.")
    parser.add_argument("--db-path", default=DEFAULT_DB_PATH, help="Output SQLite database path.")
    return parser.parse_args()


def iter_report_paths(reports_dir: str) -> list[str]:
    report_paths = []
    for root, _, files in os.walk(reports_dir):
        for filename in files:
            if not filename.endswith(".md"):
                continue
            if not re.match(r"^\d{4}_.+\.md$", filename):
                continue
            report_paths.append(os.path.join(root, filename))
    return sorted(report_paths)


def split_h2_sections(content: str) -> list[tuple[str, str]]:
    matches = list(H2_PATTERN.finditer(content))
    sections = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        sections.append((match.group(1).strip(), content[start:end].strip()))
    return sections


def parse_metadata_and_overview(section_body: str) -> tuple[list[tuple[str, str]], str]:
    metadata = []
    overview_lines = []
    collecting_metadata = True

    for raw_line in section_body.splitlines():
        line = raw_line.strip()
        if collecting_metadata and not line:
            continue
        if collecting_metadata:
            match = METADATA_LINE_PATTERN.match(line)
            if match:
                metadata.append((match.group(1).strip(), match.group(2).strip()))
                continue
            collecting_metadata = False
        overview_lines.append(raw_line)

    overview_text = "\n".join(overview_lines).strip()
    return metadata, overview_text


def extract_wikilinks(text: str) -> list[str]:
    return [match.strip() for match in WIKILINK_PATTERN.findall(text) if match.strip()]


def build_section_map(content: str) -> dict[str, str]:
    sections = split_h2_sections(content)
    normalized = {}
    if sections:
        normalized["overview"] = sections[0][1]
    if len(sections) > 1:
        normalized["supply_chain"] = sections[1][1]
    if len(sections) > 2:
        normalized["customer_supplier"] = sections[2][1]
    if len(sections) > 3:
        normalized["financials"] = sections[3][1]
    return normalized


def parse_report(report_path: str) -> ParsedReport:
    with open(report_path, "r", encoding="utf-8") as handle:
        content = handle.read()

    ticker, company_name = get_ticker_from_filename(report_path)
    if not ticker or not company_name:
        raise ValueError(f"Unexpected report filename format: {report_path}")

    sector_folder = os.path.basename(os.path.dirname(report_path))
    title = content.splitlines()[0].strip() if content.strip() else f"# {ticker} - {company_name}"
    section_map = build_section_map(content)

    metadata_pairs, overview_text = parse_metadata_and_overview(section_map.get("overview", ""))
    metadata_values = [value for _, value in metadata_pairs]

    wikilinks_by_section = {
        "overview": Counter(extract_wikilinks(overview_text)),
        "supply_chain": Counter(extract_wikilinks(section_map.get("supply_chain", ""))),
        "customer_supplier": Counter(extract_wikilinks(section_map.get("customer_supplier", ""))),
        "financials": Counter(extract_wikilinks(section_map.get("financials", ""))),
    }
    all_wikilinks = extract_wikilinks(content)

    return ParsedReport(
        report_id=os.path.relpath(report_path, PROJECT_ROOT).replace("\\", "/"),
        ticker=ticker,
        company_name=company_name,
        title=title,
        report_path=os.path.relpath(report_path, PROJECT_ROOT).replace("\\", "/"),
        sector_folder=sector_folder,
        metadata_sector=metadata_values[0] if len(metadata_values) > 0 else "",
        metadata_industry=metadata_values[1] if len(metadata_values) > 1 else "",
        market_cap_text=metadata_values[2] if len(metadata_values) > 2 else "",
        enterprise_value_text=metadata_values[3] if len(metadata_values) > 3 else "",
        overview_text=overview_text,
        supply_chain_text=section_map.get("supply_chain", ""),
        customer_supplier_text=section_map.get("customer_supplier", ""),
        financials_text=section_map.get("financials", ""),
        wikilinks_by_section=wikilinks_by_section,
        all_wikilinks=all_wikilinks,
    )


def ensure_parent_dir(filepath: str) -> None:
    parent = os.path.dirname(filepath)
    if parent:
        os.makedirs(parent, exist_ok=True)


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA foreign_keys = ON;
        DROP TABLE IF EXISTS site_search;
        DROP TABLE IF EXISTS ingest_warnings;
        DROP TABLE IF EXISTS company_wikilinks;
        DROP TABLE IF EXISTS wikilinks;
        DROP TABLE IF EXISTS companies;
        DROP TABLE IF EXISTS sectors;
        DROP TABLE IF EXISTS imports;

        CREATE TABLE imports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            imported_at TEXT NOT NULL,
            source_dir TEXT NOT NULL,
            company_count INTEGER NOT NULL,
            wikilink_count INTEGER NOT NULL
        );

        CREATE TABLE ingest_warnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            warning_type TEXT NOT NULL,
            subject TEXT NOT NULL,
            details TEXT NOT NULL
        );

        CREATE TABLE sectors (
            name TEXT PRIMARY KEY,
            company_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE companies (
            report_id TEXT PRIMARY KEY,
            ticker TEXT NOT NULL,
            company_name TEXT NOT NULL,
            title TEXT NOT NULL,
            sector_folder TEXT NOT NULL REFERENCES sectors(name),
            metadata_sector TEXT NOT NULL DEFAULT '',
            metadata_industry TEXT NOT NULL DEFAULT '',
            market_cap_text TEXT NOT NULL DEFAULT '',
            enterprise_value_text TEXT NOT NULL DEFAULT '',
            overview_text TEXT NOT NULL DEFAULT '',
            supply_chain_text TEXT NOT NULL DEFAULT '',
            customer_supplier_text TEXT NOT NULL DEFAULT '',
            financials_text TEXT NOT NULL DEFAULT '',
            wikilink_count INTEGER NOT NULL DEFAULT 0,
            report_path TEXT NOT NULL
        );

        CREATE TABLE wikilinks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,
            company_count INTEGER NOT NULL DEFAULT 0,
            mention_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE company_wikilinks (
            company_report_id TEXT NOT NULL REFERENCES companies(report_id) ON DELETE CASCADE,
            wikilink_id INTEGER NOT NULL REFERENCES wikilinks(id) ON DELETE CASCADE,
            section_key TEXT NOT NULL,
            occurrences INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (company_report_id, wikilink_id, section_key)
        );

        CREATE INDEX idx_companies_ticker ON companies(ticker);
        CREATE INDEX idx_companies_sector_folder ON companies(sector_folder);
        CREATE INDEX idx_companies_company_name ON companies(company_name);
        CREATE INDEX idx_company_wikilinks_wikilink_id ON company_wikilinks(wikilink_id);
        CREATE INDEX idx_company_wikilinks_section_key ON company_wikilinks(section_key);

        CREATE VIRTUAL TABLE site_search USING fts5(
            ticker,
            company_name,
            sector_folder,
            metadata_sector,
            metadata_industry,
            overview_text,
            supply_chain_text,
            customer_supplier_text,
            content='',
            tokenize='unicode61'
        );
        """
    )


def insert_reports(conn: sqlite3.Connection, reports: list[ParsedReport]) -> None:
    sector_counts = Counter(report.sector_folder for report in reports)
    conn.executemany(
        "INSERT INTO sectors (name, company_count) VALUES (?, ?)",
        sorted(sector_counts.items()),
    )

    company_rows = [
        (
            report.report_id,
            report.ticker,
            report.company_name,
            report.title,
            report.sector_folder,
            report.metadata_sector,
            report.metadata_industry,
            report.market_cap_text,
            report.enterprise_value_text,
            report.overview_text,
            report.supply_chain_text,
            report.customer_supplier_text,
            report.financials_text,
            len(report.all_wikilinks),
            report.report_path,
        )
        for report in reports
    ]
    conn.executemany(
        """
        INSERT INTO companies (
            report_id, ticker, company_name, title, sector_folder, metadata_sector, metadata_industry,
            market_cap_text, enterprise_value_text, overview_text, supply_chain_text,
            customer_supplier_text, financials_text, wikilink_count, report_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        company_rows,
    )

    conn.executemany(
        """
        INSERT INTO site_search (
            ticker, company_name, sector_folder, metadata_sector, metadata_industry,
            overview_text, supply_chain_text, customer_supplier_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                report.ticker,
                report.company_name,
                report.sector_folder,
                report.metadata_sector,
                report.metadata_industry,
                report.overview_text,
                report.supply_chain_text,
                report.customer_supplier_text,
            )
            for report in reports
        ],
    )


def insert_wikilinks(conn: sqlite3.Connection, reports: list[ParsedReport]) -> None:
    total_mentions = Counter()
    company_mentions = defaultdict(set)
    section_rows = []

    for report in reports:
        for section_key, section_counter in report.wikilinks_by_section.items():
            for wikilink_name, occurrences in section_counter.items():
                total_mentions[wikilink_name] += occurrences
                company_mentions[wikilink_name].add(report.report_id)
                section_rows.append((report.report_id, wikilink_name, section_key, occurrences))

    wikilink_rows = [
        (
            name,
            classify_wikilink(name),
            len(company_mentions[name]),
            total_mentions[name],
        )
        for name in sorted(total_mentions)
    ]
    conn.executemany(
        "INSERT INTO wikilinks (name, category, company_count, mention_count) VALUES (?, ?, ?, ?)",
        wikilink_rows,
    )

    wikilink_id_map = {name: wikilink_id for wikilink_id, name in conn.execute("SELECT id, name FROM wikilinks")}
    conn.executemany(
        """
        INSERT INTO company_wikilinks (company_report_id, wikilink_id, section_key, occurrences)
        VALUES (?, ?, ?, ?)
        """,
        [
            (report_id, wikilink_id_map[wikilink_name], section_key, occurrences)
            for report_id, wikilink_name, section_key, occurrences in section_rows
        ],
    )


def insert_import_row(conn: sqlite3.Connection, reports: list[ParsedReport]) -> None:
    conn.execute(
        """
        INSERT INTO imports (imported_at, source_dir, company_count, wikilink_count)
        VALUES (?, ?, ?, ?)
        """,
        (
            datetime.now(timezone.utc).isoformat(),
            os.path.relpath(REPORTS_DIR, PROJECT_ROOT).replace("\\", "/"),
            len(reports),
            sum(len(report.all_wikilinks) for report in reports),
        ),
    )


def insert_warnings(conn: sqlite3.Connection, reports: list[ParsedReport]) -> int:
    duplicate_paths = defaultdict(list)
    for report in reports:
        duplicate_paths[report.ticker].append(report.report_path)

    warning_rows = []
    for ticker, paths in sorted(duplicate_paths.items()):
        if len(paths) < 2:
            continue
        warning_rows.append(("duplicate_ticker", ticker, "\n".join(paths)))

    if warning_rows:
        conn.executemany(
            "INSERT INTO ingest_warnings (warning_type, subject, details) VALUES (?, ?, ?)",
            warning_rows,
        )
    return len(warning_rows)


def build_database(db_path: str) -> tuple[int, int, int, int]:
    report_paths = iter_report_paths(REPORTS_DIR)
    reports = [parse_report(path) for path in report_paths]

    ensure_parent_dir(db_path)
    conn = sqlite3.connect(db_path)
    try:
        create_schema(conn)
        insert_reports(conn, reports)
        insert_wikilinks(conn, reports)
        insert_import_row(conn, reports)
        warning_count = insert_warnings(conn, reports)
        conn.commit()
        sector_count = conn.execute("SELECT COUNT(*) FROM sectors").fetchone()[0]
        wikilink_count = conn.execute("SELECT COUNT(*) FROM wikilinks").fetchone()[0]
    finally:
        conn.close()

    return len(reports), sector_count, wikilink_count, warning_count


def main() -> None:
    args = parse_args()
    company_count, sector_count, wikilink_count, warning_count = build_database(args.db_path)
    print(f"Built {args.db_path}")
    print(f"Companies: {company_count}")
    print(f"Sectors: {sector_count}")
    print(f"Unique wikilinks: {wikilink_count}")
    print(f"Ingest warnings: {warning_count}")


if __name__ == "__main__":
    main()
