from __future__ import annotations

import json
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from report_parser import parse_report_content
except ImportError:
    from scripts.report_parser import parse_report_content


PROJECT_ROOT = Path(__file__).resolve().parent.parent
THEMES_DIR = PROJECT_ROOT / "themes"
GRAPH_DIR = PROJECT_ROOT / "graph"
REPORTS_DIR = PROJECT_ROOT / "Pilot_Reports"
DATA_DIR = PROJECT_ROOT / "data"
WEB_I18N_PATH = PROJECT_ROOT / "web" / "lib" / "i18n.ts"

DEFAULT_GRAPH_OUTPUT = GRAPH_DIR / "theme_graph.json"
DEFAULT_COMPANY_OUTPUT = GRAPH_DIR / "theme_company_map.json"
DEFAULT_GRAPH_DB_PATH = DATA_DIR / "graph.db"
GRAPH_DB_SCHEMA_VERSION = 1

WIKILINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
RELATED_THEMES_RE = re.compile(r"^\*\*\u76f8\u95dc\u4e3b\u984c[:\uff1a]\*\*\s*(.+)$")
SUPPLEMENTAL_MARKER = "<!-- graph_role: supplemental -->"
SECTOR_TRANSLATION_BLOCK_RE = re.compile(
    r"const sectorTranslations: Record<string, string> = \{(.*?)\n\};",
    re.DOTALL,
)
SECTOR_TRANSLATION_PAIR_RE = re.compile(r'"([^"]+)":\s*"([^"]*)"')

ROLE_LABELS = {
    "upstream": {"zh": "\u4e0a\u6e38", "en": "Upstream"},
    "midstream": {"zh": "\u4e2d\u6e38", "en": "Midstream"},
    "downstream": {"zh": "\u4e0b\u6e38", "en": "Downstream"},
    "related": {"zh": "\u76f8\u95dc\u516c\u53f8", "en": "Related Companies"},
}


def setup_stdout() -> None:
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def theme_id_from_filename(filename: str) -> str:
    return Path(filename).stem.replace("_", " ")


def load_sector_translations() -> dict[str, str]:
    if not WEB_I18N_PATH.exists():
        return {}

    content = WEB_I18N_PATH.read_text(encoding="utf-8")
    block_match = SECTOR_TRANSLATION_BLOCK_RE.search(content)
    if not block_match:
        return {}

    block = block_match.group(1)
    return {match.group(1): match.group(2) for match in SECTOR_TRANSLATION_PAIR_RE.finditer(block)}


def load_theme_records() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for path in sorted(THEMES_DIR.glob("*.md")):
        if path.name == "README.md":
            continue

        content = path.read_text(encoding="utf-8")
        lines = content.splitlines()
        title = ""
        note = ""
        related_themes: list[str] = []

        for line in lines:
            if line.startswith("# "):
                title = line[2:].strip()
            elif not note and line.startswith("> "):
                note = line[2:].strip()
            else:
                related_match = RELATED_THEMES_RE.match(line.strip())
                if related_match:
                    related_themes.extend(WIKILINK_RE.findall(related_match.group(1)))

        records.append(
            {
                "theme_id": theme_id_from_filename(path.name),
                "file_name": path.name,
                "path": path,
                "content": content,
                "title": title or theme_id_from_filename(path.name),
                "note": note,
                "related_themes": related_themes,
                "is_supplemental": SUPPLEMENTAL_MARKER in content,
            }
        )

    return records


def extract_role_from_supply_chain(supply_chain_text: str, wikilink: str) -> tuple[str, list[str]]:
    found_roles: list[str] = []
    for match in re.finditer(re.escape(f"[[{wikilink}]]"), supply_chain_text):
        prefix = supply_chain_text[max(0, match.start() - 120):match.start()]
        if "\u4e0a\u6e38" in prefix:
            found_roles.append("upstream")
        elif "\u4e2d\u6e38" in prefix:
            found_roles.append("midstream")
        elif "\u4e0b\u6e38" in prefix:
            found_roles.append("downstream")

    ordered_roles: list[str] = []
    for role in found_roles:
        if role not in ordered_roles:
            ordered_roles.append(role)

    if ordered_roles:
        return ordered_roles[0], ordered_roles
    return "related", ["related"]


def scan_theme_company_mentions(
    theme_ids: set[str],
    sector_translations: dict[str, str],
) -> dict[str, list[dict[str, Any]]]:
    theme_company_map: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for path in sorted(REPORTS_DIR.rglob("*.md")):
        match = re.match(r"^(\d{4})_(.+)\.md$", path.name)
        if not match:
            continue

        ticker, company_name = match.group(1), match.group(2)
        sector_en = path.parent.name
        sector_zh = sector_translations.get(sector_en, sector_en)
        content = path.read_text(encoding="utf-8")
        parsed = parse_report_content(content)

        overview_text = parsed["overview_text"]
        supply_chain_text = parsed["supply_chain_text"]
        customer_text = parsed["customer_supplier_text"]
        combined_text = "\n".join([overview_text, supply_chain_text, customer_text])

        present_themes = sorted(set(WIKILINK_RE.findall(combined_text)) & theme_ids)
        report_relpath = path.relative_to(PROJECT_ROOT).as_posix()

        for theme_id in present_themes:
            mention_count = combined_text.count(f"[[{theme_id}]]")
            primary_role = "related"
            roles = ["related"]
            if f"[[{theme_id}]]" in supply_chain_text:
                primary_role, roles = extract_role_from_supply_chain(supply_chain_text, theme_id)

            theme_company_map[theme_id].append(
                {
                    "ticker": ticker,
                    "company_name": company_name,
                    "report_id": report_relpath,
                    "sector_en": sector_en,
                    "sector_zh": sector_zh,
                    "role": primary_role,
                    "roles": roles,
                    "mention_count": mention_count,
                }
            )

    return theme_company_map


def build_graph_payload(theme_records: list[dict[str, Any]]) -> dict[str, Any]:
    theme_ids = {record["theme_id"] for record in theme_records}
    supplemental_ids = {record["theme_id"] for record in theme_records if record["is_supplemental"]}

    nodes: dict[str, dict[str, Any]] = {}
    link_map: dict[tuple[str, str], dict[str, Any]] = {}
    inbound_by_node: dict[str, set[str]] = defaultdict(set)
    outbound_by_node: dict[str, set[str]] = defaultdict(set)
    unique_wikilink_targets: set[str] = set()
    total_wikilink_mentions = 0

    for record in theme_records:
        theme_id = record["theme_id"]
        rel_path = record["path"].relative_to(PROJECT_ROOT).as_posix()
        node_type = "supplemental_theme" if record["is_supplemental"] else "theme"

        nodes[theme_id] = {
            "id": theme_id,
            "label": theme_id,
            "type": node_type,
            "title": record["title"],
            "note": record["note"],
            "file_name": record["file_name"],
            "path": rel_path,
            "related_themes": [],
        }

        section = "root"
        for line_no, line in enumerate(record["content"].splitlines(), start=1):
            if line.startswith("## "):
                section = line[3:].strip()

            wikilinks = WIKILINK_RE.findall(line)
            if not wikilinks:
                continue

            unique_wikilink_targets.update(wikilinks)
            total_wikilink_mentions += len(wikilinks)

            for wikilink in wikilinks:
                if wikilink in supplemental_ids:
                    target_type = "supplemental_theme"
                elif wikilink in theme_ids:
                    target_type = "theme"
                else:
                    target_type = "wikilink"

                if wikilink not in nodes:
                    nodes[wikilink] = {
                        "id": wikilink,
                        "label": wikilink,
                        "type": target_type,
                    }
                elif target_type in {"theme", "supplemental_theme"}:
                    nodes[wikilink]["type"] = target_type

                edge_key = (theme_id, wikilink)
                if edge_key not in link_map:
                    link_map[edge_key] = {
                        "source": theme_id,
                        "target": wikilink,
                        "type": "mentions",
                        "count": 0,
                        "sections": set(),
                        "occurrences": [],
                    }

                link_map[edge_key]["count"] += 1
                link_map[edge_key]["sections"].add(section)
                link_map[edge_key]["occurrences"].append(
                    {
                        "line": line_no,
                        "section": section,
                        "text": line.strip(),
                    }
                )
                inbound_by_node[wikilink].add(theme_id)
                outbound_by_node[theme_id].add(wikilink)

        nodes[theme_id]["related_themes"] = [
            {"id": item, "label": item, "is_theme_page": item in theme_ids}
            for item in record["related_themes"]
            if item in theme_ids
        ]

    serialized_nodes: list[dict[str, Any]] = []
    for node_id in sorted(nodes):
        node = dict(nodes[node_id])
        node["group"] = node["type"]
        node["is_theme_page"] = node["type"] in {"theme", "supplemental_theme"}
        node["mentioned_by_count"] = len(inbound_by_node.get(node_id, set()))
        node["outgoing_count"] = len(outbound_by_node.get(node_id, set()))
        node["degree"] = node["mentioned_by_count"] + node["outgoing_count"]
        node["radius_hint"] = 24 if node["is_theme_page"] else 9
        serialized_nodes.append(node)

    serialized_links: list[dict[str, Any]] = []
    for source, target in sorted(link_map):
        edge = dict(link_map[(source, target)])
        edge["sections"] = sorted(edge["sections"])
        edge["value"] = edge["count"]
        edge["weight"] = edge["count"]
        edge["source_type"] = nodes[source]["type"]
        edge["target_type"] = nodes[target]["type"]
        edge["target_is_theme"] = nodes[target]["type"] in {"theme", "supplemental_theme"}
        edge["primary_section"] = edge["occurrences"][0]["section"] if edge["occurrences"] else "root"
        serialized_links.append(edge)

    return {
        "generated_at": utc_now_iso(),
        "source_dir": "themes",
        "graph_kind": "theme_to_wikilink",
        "node_counts": {
            "total": len(serialized_nodes),
            "themes": sum(1 for node in serialized_nodes if node["type"] == "theme"),
            "supplemental_themes": sum(
                1 for node in serialized_nodes if node["type"] == "supplemental_theme"
            ),
            "wikilinks": sum(1 for node in serialized_nodes if node["type"] == "wikilink"),
            "wikilink_targets": len(unique_wikilink_targets),
            "wikilink_mentions": total_wikilink_mentions,
        },
        "nodes": serialized_nodes,
        "links": serialized_links,
    }


def build_theme_company_payload(
    theme_records: list[dict[str, Any]],
    theme_company_mentions: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    def serialize_company(company: dict[str, Any]) -> dict[str, Any]:
        return {
            "ticker": company["ticker"],
            "company_name": company["company_name"],
            "sector_en": company["sector_en"],
            "sector_zh": company["sector_zh"],
        }

    themes: list[dict[str, Any]] = []
    for record in theme_records:
        theme_id = record["theme_id"]
        companies = sorted(
            theme_company_mentions.get(theme_id, []),
            key=lambda item: (item["role"], item["sector_en"], item["ticker"], item["company_name"]),
        )

        companies_by_role: dict[str, dict[str, Any]] = {}
        counts_by_role: dict[str, int] = {}
        for role_key, role_labels in ROLE_LABELS.items():
            role_companies = [company for company in companies if company["role"] == role_key]
            companies_by_role[role_key] = {
                "label_zh": role_labels["zh"],
                "label_en": role_labels["en"],
                "count": len(role_companies),
                "companies": [serialize_company(company) for company in role_companies],
            }
            counts_by_role[role_key] = len(role_companies)

        themes.append(
            {
                "id": theme_id,
                "title": record["title"],
                "note": record["note"],
                "type": "supplemental_theme" if record["is_supplemental"] else "theme",
                "path": record["path"].relative_to(PROJECT_ROOT).as_posix(),
                "related_themes": record["related_themes"],
                "company_count": len(companies),
                "counts_by_role": counts_by_role,
                "companies_by_role": companies_by_role,
                "all_companies": [serialize_company(company) for company in companies],
            }
        )

    return {
        "generated_at": utc_now_iso(),
        "source_dir": "Pilot_Reports",
        "payload_kind": "theme_company_map",
        "theme_count": len(themes),
        "themes": themes,
    }


def build_graph_bundle() -> dict[str, Any]:
    theme_records = load_theme_records()
    sector_translations = load_sector_translations()
    theme_company_mentions = scan_theme_company_mentions(
        {record["theme_id"] for record in theme_records},
        sector_translations,
    )

    graph_payload = build_graph_payload(theme_records)
    company_payload = build_theme_company_payload(theme_records, theme_company_mentions)

    unique_report_ids = {
        company["report_id"]
        for companies in theme_company_mentions.values()
        for company in companies
    }
    company_mapping_count = sum(len(companies) for companies in theme_company_mentions.values())

    meta = {
        "built_at": utc_now_iso(),
        "schema_version": GRAPH_DB_SCHEMA_VERSION,
        "graph_generated_at": graph_payload["generated_at"],
        "company_map_generated_at": company_payload["generated_at"],
        "theme_count": company_payload["theme_count"],
        "node_count": graph_payload["node_counts"]["total"],
        "link_count": len(graph_payload["links"]),
        "unique_company_count": len(unique_report_ids),
        "company_mapping_count": company_mapping_count,
        "source_dirs": {
            "themes": "themes",
            "reports": "Pilot_Reports",
        },
    }

    return {
        "graph": graph_payload,
        "company_map": company_payload,
        "meta": meta,
    }


def write_graph_json_outputs(
    graph_payload: dict[str, Any],
    company_payload: dict[str, Any],
    graph_output: Path = DEFAULT_GRAPH_OUTPUT,
    company_output: Path = DEFAULT_COMPANY_OUTPUT,
) -> None:
    graph_output.parent.mkdir(parents=True, exist_ok=True)
    company_output.parent.mkdir(parents=True, exist_ok=True)
    graph_output.write_text(json.dumps(graph_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    company_output.write_text(json.dumps(company_payload, ensure_ascii=False, indent=2), encoding="utf-8")


def reset_graph_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS graph_links;
        DROP TABLE IF EXISTS graph_nodes;
        DROP TABLE IF EXISTS graph_themes;
        DROP TABLE IF EXISTS graph_payloads;
        DROP TABLE IF EXISTS graph_imports;

        CREATE TABLE graph_imports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            built_at TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            graph_generated_at TEXT NOT NULL,
            company_map_generated_at TEXT NOT NULL,
            theme_count INTEGER NOT NULL,
            node_count INTEGER NOT NULL,
            link_count INTEGER NOT NULL,
            unique_company_count INTEGER NOT NULL,
            company_mapping_count INTEGER NOT NULL
        );

        CREATE TABLE graph_payloads (
            kind TEXT PRIMARY KEY,
            generated_at TEXT NOT NULL,
            payload_json TEXT NOT NULL
        );

        CREATE TABLE graph_themes (
            theme_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            note TEXT NOT NULL,
            theme_type TEXT NOT NULL,
            path TEXT NOT NULL,
            related_themes_json TEXT NOT NULL,
            company_count INTEGER NOT NULL,
            counts_by_role_json TEXT NOT NULL,
            companies_by_role_json TEXT NOT NULL,
            all_companies_json TEXT NOT NULL
        );

        CREATE TABLE graph_nodes (
            node_id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            node_type TEXT NOT NULL,
            title TEXT,
            note TEXT,
            file_name TEXT,
            path TEXT,
            related_themes_json TEXT NOT NULL,
            group_name TEXT NOT NULL,
            is_theme_page INTEGER NOT NULL,
            mentioned_by_count INTEGER NOT NULL,
            outgoing_count INTEGER NOT NULL,
            degree INTEGER NOT NULL,
            radius_hint INTEGER NOT NULL
        );

        CREATE TABLE graph_links (
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            edge_type TEXT NOT NULL,
            mention_count INTEGER NOT NULL,
            value INTEGER NOT NULL,
            weight INTEGER NOT NULL,
            source_type TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_is_theme INTEGER NOT NULL,
            primary_section TEXT NOT NULL,
            sections_json TEXT NOT NULL,
            occurrences_json TEXT NOT NULL,
            PRIMARY KEY (source_id, target_id)
        );

        CREATE INDEX idx_graph_themes_type ON graph_themes(theme_type);
        CREATE INDEX idx_graph_nodes_type ON graph_nodes(node_type);
        CREATE INDEX idx_graph_nodes_degree ON graph_nodes(degree DESC, node_id ASC);
        CREATE INDEX idx_graph_links_target ON graph_links(target_id);
        CREATE INDEX idx_graph_links_source_type ON graph_links(source_type, target_type);
        """
    )


def write_graph_database(
    db_path: Path,
    graph_payload: dict[str, Any],
    company_payload: dict[str, Any],
    meta: dict[str, Any],
) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        reset_graph_schema(conn)

        conn.execute(
            """
            INSERT INTO graph_imports (
                built_at,
                schema_version,
                graph_generated_at,
                company_map_generated_at,
                theme_count,
                node_count,
                link_count,
                unique_company_count,
                company_mapping_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                meta["built_at"],
                meta["schema_version"],
                meta["graph_generated_at"],
                meta["company_map_generated_at"],
                meta["theme_count"],
                meta["node_count"],
                meta["link_count"],
                meta["unique_company_count"],
                meta["company_mapping_count"],
            ),
        )

        conn.executemany(
            """
            INSERT INTO graph_payloads (kind, generated_at, payload_json)
            VALUES (?, ?, ?)
            """,
            [
                ("graph", graph_payload["generated_at"], json.dumps(graph_payload, ensure_ascii=False)),
                (
                    "company_map",
                    company_payload["generated_at"],
                    json.dumps(company_payload, ensure_ascii=False),
                ),
            ],
        )

        conn.executemany(
            """
            INSERT INTO graph_themes (
                theme_id,
                title,
                note,
                theme_type,
                path,
                related_themes_json,
                company_count,
                counts_by_role_json,
                companies_by_role_json,
                all_companies_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    theme["id"],
                    theme["title"],
                    theme["note"],
                    theme["type"],
                    theme["path"],
                    json.dumps(theme["related_themes"], ensure_ascii=False),
                    theme["company_count"],
                    json.dumps(theme["counts_by_role"], ensure_ascii=False),
                    json.dumps(theme["companies_by_role"], ensure_ascii=False),
                    json.dumps(theme["all_companies"], ensure_ascii=False),
                )
                for theme in company_payload["themes"]
            ],
        )

        conn.executemany(
            """
            INSERT INTO graph_nodes (
                node_id,
                label,
                node_type,
                title,
                note,
                file_name,
                path,
                related_themes_json,
                group_name,
                is_theme_page,
                mentioned_by_count,
                outgoing_count,
                degree,
                radius_hint
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    node["id"],
                    node["label"],
                    node["type"],
                    node.get("title"),
                    node.get("note"),
                    node.get("file_name"),
                    node.get("path"),
                    json.dumps(node.get("related_themes", []), ensure_ascii=False),
                    node["group"],
                    1 if node["is_theme_page"] else 0,
                    node["mentioned_by_count"],
                    node["outgoing_count"],
                    node["degree"],
                    node["radius_hint"],
                )
                for node in graph_payload["nodes"]
            ],
        )

        conn.executemany(
            """
            INSERT INTO graph_links (
                source_id,
                target_id,
                edge_type,
                mention_count,
                value,
                weight,
                source_type,
                target_type,
                target_is_theme,
                primary_section,
                sections_json,
                occurrences_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    link["source"],
                    link["target"],
                    link["type"],
                    link["count"],
                    link["value"],
                    link["weight"],
                    link["source_type"],
                    link["target_type"],
                    1 if link["target_is_theme"] else 0,
                    link["primary_section"],
                    json.dumps(link["sections"], ensure_ascii=False),
                    json.dumps(link["occurrences"], ensure_ascii=False),
                )
                for link in graph_payload["links"]
            ],
        )

        conn.commit()
