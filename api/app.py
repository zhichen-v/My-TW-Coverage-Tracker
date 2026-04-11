from __future__ import annotations

import sqlite3
from contextlib import closing
from typing import Any
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.db import get_connection, get_db_path

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
        if sector:
            query += " AND c.sector_folder = ?"
            params.append(sector)
        query += " ORDER BY rank, c.ticker ASC, c.report_path ASC LIMIT ? OFFSET ?"
    else:
        query = """
            SELECT report_id, ticker, company_name, title, sector_folder,
                   metadata_sector, metadata_industry, market_cap_text,
                   enterprise_value_text, wikilink_count, report_path
            FROM companies
            WHERE 1 = 1
        """
        if sector:
            query += " AND sector_folder = ?"
            params.append(sector)
        query += " ORDER BY ticker ASC, report_path ASC LIMIT ? OFFSET ?"

    params.extend([limit, offset])
    items = fetch_all(query, tuple(params))
    return {"items": items, "count": len(items), "query": q, "sector": sector}


@app.get("/api/companies/{ticker}")
def get_company_by_ticker(ticker: str) -> dict[str, Any]:
    items = fetch_all(
        """
        SELECT report_id, ticker, company_name, title, sector_folder,
               metadata_sector, metadata_industry, market_cap_text,
               enterprise_value_text, overview_text, supply_chain_text,
               customer_supplier_text, financials_text, wikilink_count, report_path
        FROM companies
        WHERE ticker = ?
        ORDER BY report_path ASC
        """,
        (ticker,),
    )
    if not items:
        raise HTTPException(status_code=404, detail=f"Ticker not found: {ticker}")
    return {"items": items, "count": len(items), "ticker": ticker}


@app.get("/api/reports/{report_id:path}")
def get_company_by_report_id(report_id: str) -> dict[str, Any]:
    normalized = unquote(report_id).replace("\\", "/")
    item = fetch_one(
        """
        SELECT report_id, ticker, company_name, title, sector_folder,
               metadata_sector, metadata_industry, market_cap_text,
               enterprise_value_text, overview_text, supply_chain_text,
               customer_supplier_text, financials_text, wikilink_count, report_path
        FROM companies
        WHERE report_id = ?
        """,
        (normalized,),
    )
    if not item:
        raise HTTPException(status_code=404, detail=f"Report not found: {normalized}")
    return item


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
