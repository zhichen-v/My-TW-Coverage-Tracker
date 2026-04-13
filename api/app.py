from __future__ import annotations

import json
import re
import sqlite3
from contextlib import closing
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.db import get_connection, get_db_path
from scripts.report_parser import json_relpath_from_report_relpath

INLINE_WIKILINK_PATTERN = re.compile(r"\[\[([^\]]+)\]\]")
INLINE_BOLD_PATTERN = re.compile(r"\*\*([^*]+)\*\*")

app = FastAPI(
    title="My TW Coverage API",
    version="0.1.0",
    description="Read-only API for Pilot_Reports coverage data.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def fetch_all(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with closing(get_connection()) as conn:
        rows = conn.execute(query, params).fetchall()
    return rows_to_dicts(rows)


def fetch_one(query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    with closing(get_connection()) as conn:
        row = conn.execute(query, params).fetchone()
    return dict(row) if row else None


def dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        normalized = item.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(normalized)
    return ordered


def sanitize_inline_text(text: str) -> str:
    without_wikilinks = INLINE_WIKILINK_PATTERN.sub(r"\1", text)
    return INLINE_BOLD_PATTERN.sub(r"\1", without_wikilinks).strip()


def segments_to_plain_text(segments: list[dict[str, Any]] | None) -> str:
    if not segments:
        return ""
    return "".join(str(segment.get("text", "")) for segment in segments).strip()


def get_first_paragraph_text(structured_content: dict[str, Any] | None) -> str:
    if not structured_content:
        return ""
    overview = structured_content.get("sections", {}).get("overview", {})
    for block in overview.get("blocks", []):
        if block.get("type") == "paragraph":
            paragraph_text = segments_to_plain_text(block.get("segments"))
            if paragraph_text:
                return paragraph_text
    return ""


def build_structured_summary(structured_content: dict[str, Any] | None) -> dict[str, Any] | None:
    if not structured_content:
        return None

    sections = structured_content.get("sections", {})
    overview_excerpt = get_first_paragraph_text(structured_content)
    if len(overview_excerpt) > 220:
        overview_excerpt = f"{overview_excerpt[:217].rstrip()}..."

    supply_chain_groups = [
        sanitize_inline_text(str(group.get("title", "")))
        for group in sections.get("supply_chain", {}).get("groups", [])[:3]
        if sanitize_inline_text(str(group.get("title", "")))
    ]
    customer_supplier_groups = [
        sanitize_inline_text(str(group.get("title", "")))
        for group in sections.get("customer_supplier", {}).get("groups", [])[:2]
        if sanitize_inline_text(str(group.get("title", "")))
    ]
    financial_groups = [
        sanitize_inline_text(str(group.get("title", "")))
        for group in sections.get("financials", {}).get("groups", [])[:3]
        if sanitize_inline_text(str(group.get("title", "")))
    ]
    top_wikilinks = dedupe_preserve_order(list(structured_content.get("wikilinks", [])))[:6]

    return {
        "overview_excerpt": overview_excerpt,
        "supply_chain_groups": supply_chain_groups,
        "customer_supplier_groups": customer_supplier_groups,
        "financial_groups": financial_groups,
        "top_wikilinks": top_wikilinks,
    }


def sanitize_structured_content(structured_content: dict[str, Any] | None) -> dict[str, Any] | None:
    if not structured_content:
        return None

    sanitized = dict(structured_content)
    sections: dict[str, Any] = {}

    for section_key, section in structured_content.get("sections", {}).items():
        if not isinstance(section, dict):
            continue
        blocks: list[dict[str, Any]] = []
        for block in section.get("blocks", []):
            if not isinstance(block, dict):
                continue
            if block.get("type") == "paragraph":
                blocks.append(
                    {
                        "type": "paragraph",
                        "segments": list(block.get("segments", [])),
                    }
                )
                continue
            if block.get("type") == "list":
                blocks.append(
                    {
                        "type": "list",
                        "items": [
                            {"segments": list(item.get("segments", []))}
                            for item in block.get("items", [])
                            if isinstance(item, dict)
                        ],
                    }
                )
                continue
            if block.get("type") == "table":
                blocks.append(
                    {
                        "type": "table",
                        "columns": list(block.get("columns", [])),
                        "rows": list(block.get("rows", [])),
                    }
                )
                continue

        groups: list[dict[str, Any]] = []
        for group in section.get("groups", []):
            if not isinstance(group, dict):
                continue
            group_blocks: list[dict[str, Any]] = []
            for block in group.get("blocks", []):
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "paragraph":
                    group_blocks.append(
                        {
                            "type": "paragraph",
                            "segments": list(block.get("segments", [])),
                        }
                    )
                    continue
                if block.get("type") == "list":
                    group_blocks.append(
                        {
                            "type": "list",
                            "items": [
                                {"segments": list(item.get("segments", []))}
                                for item in block.get("items", [])
                                if isinstance(item, dict)
                            ],
                        }
                    )
                    continue
                if block.get("type") == "table":
                    group_blocks.append(
                        {
                            "type": "table",
                            "columns": list(block.get("columns", [])),
                            "rows": list(block.get("rows", [])),
                        }
                    )
                    continue

            groups.append(
                {
                    "title": sanitize_inline_text(str(group.get("title", ""))),
                    "blocks": group_blocks,
                }
            )

        sections[section_key] = {
            "heading": section.get("heading", ""),
            "blocks": blocks,
            "groups": groups,
        }

    sanitized["sections"] = sections
    return sanitized


@lru_cache(maxsize=4096)
def load_structured_content(report_id: str) -> dict[str, Any] | None:
    json_relpath = json_relpath_from_report_relpath(report_id)
    json_path = Path(__file__).resolve().parent.parent / json_relpath
    if not json_path.exists():
        return None
    with json_path.open("r", encoding="utf-8") as handle:
        return sanitize_structured_content(json.load(handle))


def attach_structured_content(item: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(item)
    structured_content = load_structured_content(item["report_id"])
    enriched["structured_content"] = structured_content
    enriched["structured_report_path"] = json_relpath_from_report_relpath(item["report_id"])
    enriched["structured_summary"] = build_structured_summary(structured_content)
    return enriched


def attach_structured_summary(item: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(item)
    structured_content = load_structured_content(item["report_id"])
    enriched["structured_summary"] = build_structured_summary(structured_content)
    enriched["structured_report_path"] = json_relpath_from_report_relpath(item["report_id"])
    return enriched


@app.get("/health")
def health() -> dict[str, Any]:
    db_path = get_db_path()
    db_exists = db_path.exists()
    import_meta = fetch_one(
        """
        SELECT imported_at, company_count, wikilink_count
        FROM imports
        ORDER BY id DESC
        LIMIT 1
        """
    ) if db_exists else None
    return {
        "status": "ok" if db_exists else "missing_db",
        "database_path": str(db_path),
        "database_exists": db_exists,
        "latest_import": import_meta,
    }


@app.get("/api/sectors")
def list_sectors() -> dict[str, Any]:
    items = fetch_all(
        """
        SELECT name, company_count
        FROM sectors
        ORDER BY company_count DESC, name ASC
        """
    )
    return {"items": items, "count": len(items)}


@app.get("/api/companies")
def list_companies(
    q: str | None = None,
    sector: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    params: list[Any] = []
    count_params: list[Any] = []

    if q:
        query = """
            SELECT c.report_id, c.ticker, c.company_name, c.title, c.sector_folder,
                   c.metadata_sector, c.metadata_industry, c.market_cap_text,
                   c.enterprise_value_text, c.wikilink_count, c.report_path
            FROM site_search s
            JOIN companies c
              ON c.rowid = s.rowid
            WHERE site_search MATCH ?
        """
        params.append(q)
        count_query = """
            SELECT COUNT(*) AS total_count
            FROM site_search s
            JOIN companies c
              ON c.rowid = s.rowid
            WHERE site_search MATCH ?
        """
        count_params.append(q)
        if sector:
            query += " AND c.sector_folder = ?"
            params.append(sector)
            count_query += " AND c.sector_folder = ?"
            count_params.append(sector)
        query += " ORDER BY rank, c.ticker ASC, c.report_path ASC LIMIT ? OFFSET ?"
    else:
        query = """
            SELECT report_id, ticker, company_name, title, sector_folder,
                   metadata_sector, metadata_industry, market_cap_text,
                   enterprise_value_text, wikilink_count, report_path
            FROM companies
            WHERE 1 = 1
        """
        count_query = """
            SELECT COUNT(*) AS total_count
            FROM companies
            WHERE 1 = 1
        """
        if sector:
            query += " AND sector_folder = ?"
            count_query += " AND sector_folder = ?"
            params.append(sector)
            count_params.append(sector)
        query += " ORDER BY ticker ASC, report_path ASC LIMIT ? OFFSET ?"

    params.extend([limit, offset])
    items = fetch_all(query, tuple(params))
    total_count_row = fetch_one(count_query, tuple(count_params)) or {"total_count": 0}
    total_count = int(total_count_row.get("total_count", 0))
    enriched_items = [attach_structured_summary(item) for item in items]
    return {
        "items": enriched_items,
        "count": len(enriched_items),
        "total_count": total_count,
        "query": q,
        "sector": sector,
        "limit": limit,
        "offset": offset,
    }


@app.get("/api/companies/{ticker}")
def get_company_by_ticker(ticker: str) -> dict[str, Any]:
    items = fetch_all(
        """
        SELECT report_id, ticker, company_name, title, sector_folder,
               metadata_sector, metadata_industry, market_cap_text,
               enterprise_value_text, wikilink_count, report_path
        FROM companies
        WHERE ticker = ?
        ORDER BY report_path ASC
        """,
        (ticker,),
    )
    if not items:
        raise HTTPException(status_code=404, detail=f"Ticker not found: {ticker}")
    enriched_items = [attach_structured_content(item) for item in items]
    return {"items": enriched_items, "count": len(enriched_items), "ticker": ticker}


@app.get("/api/reports/{report_id:path}")
def get_company_by_report_id(report_id: str) -> dict[str, Any]:
    normalized = unquote(report_id).replace("\\", "/")
    item = fetch_one(
        """
        SELECT report_id, ticker, company_name, title, sector_folder,
               metadata_sector, metadata_industry, market_cap_text,
               enterprise_value_text, wikilink_count, report_path
        FROM companies
        WHERE report_id = ?
        """,
        (normalized,),
    )
    if not item:
        raise HTTPException(status_code=404, detail=f"Report not found: {normalized}")
    return attach_structured_content(item)


@app.get("/api/wikilinks")
def list_wikilinks(
    category: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    params: list[Any] = []
    query = """
        SELECT name, category, company_count, mention_count
        FROM wikilinks
        WHERE 1 = 1
    """
    if category:
        query += " AND category = ?"
        params.append(category)
    query += " ORDER BY company_count DESC, mention_count DESC, name ASC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    items = fetch_all(query, tuple(params))
    return {"items": items, "count": len(items), "category": category}


@app.get("/api/wikilinks/{name:path}")
def get_wikilink(name: str) -> dict[str, Any]:
    decoded_name = unquote(name)
    wikilink = fetch_one(
        """
        SELECT id, name, category, company_count, mention_count
        FROM wikilinks
        WHERE name = ?
        """,
        (decoded_name,),
    )
    if not wikilink:
        raise HTTPException(status_code=404, detail=f"Wikilink not found: {decoded_name}")

    companies = fetch_all(
        """
        SELECT c.report_id, c.ticker, c.company_name, c.sector_folder, c.report_path,
               cw.section_key, cw.occurrences
        FROM company_wikilinks cw
        JOIN companies c
          ON c.report_id = cw.company_report_id
        WHERE cw.wikilink_id = ?
        ORDER BY cw.occurrences DESC, c.ticker ASC, c.report_path ASC
        """,
        (wikilink["id"],),
    )
    wikilink.pop("id")
    return {"wikilink": wikilink, "companies": companies, "count": len(companies)}


@app.get("/api/search")
def search(
    q: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict[str, Any]:
    company_matches = fetch_all(
        """
        SELECT c.report_id, c.ticker, c.company_name, c.sector_folder, c.report_path
        FROM site_search s
        JOIN companies c
          ON c.rowid = s.rowid
        WHERE site_search MATCH ?
        ORDER BY rank, c.ticker ASC, c.report_path ASC
        LIMIT ?
        """,
        (q, limit),
    )
    wikilink_matches = fetch_all(
        """
        SELECT name, category, company_count, mention_count
        FROM wikilinks
        WHERE name LIKE ?
        ORDER BY company_count DESC, mention_count DESC, name ASC
        LIMIT ?
        """,
        (f"%{q}%", limit),
    )
    return {
        "query": q,
        "companies": company_matches,
        "wikilinks": wikilink_matches,
    }
