from __future__ import annotations

import os
import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GRAPH_DB_PATH = PROJECT_ROOT / "data" / "graph.db"


def get_graph_db_path() -> Path:
    raw_path = os.environ.get("TW_COVERAGE_GRAPH_DB_PATH")
    if raw_path:
        return Path(raw_path)
    return DEFAULT_GRAPH_DB_PATH


def get_graph_connection() -> sqlite3.Connection:
    db_path = get_graph_db_path()
    if not db_path.exists():
        raise FileNotFoundError(f"Graph database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn
