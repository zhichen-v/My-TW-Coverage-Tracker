"""
build_theme_graph.py - Export theme graph data and theme-company mappings.

Reads theme markdown files under themes/ and writes:
- graph/theme_graph.json
- graph/theme_company_map.json
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    from report_parser import parse_report_content
except ImportError:
    from scripts.report_parser import parse_report_content


PROJECT_ROOT = Path(__file__).resolve().parent.parent
THEMES_DIR = PROJECT_ROOT / "themes"
GRAPH_DIR = PROJECT_ROOT / "graph"
REPORTS_DIR = PROJECT_ROOT / "Pilot_Reports"
WEB_I18N_PATH = PROJECT_ROOT / "web" / "lib" / "i18n.ts"
DEFAULT_GRAPH_OUTPUT = GRAPH_DIR / "theme_graph.json"
DEFAULT_COMPANY_OUTPUT = GRAPH_DIR / "theme_company_map.json"

WIKILINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
RELATED_THEMES_RE = re.compile(r"^\*\*.+?:\*\*\s*(.+)$")
SUPPLEMENTAL_MARKER = "<!-- graph_role: supplemental -->"
SECTOR_TRANSLATION_BLOCK_RE = re.compile(
    r"const sectorTranslations: Record<string, string> = \{(.*?)\n\};",
    re.DOTALL,
)
SECTOR_TRANSLATION_PAIR_RE = re.compile(r'"([^"]+)":\s*"([^"]*)"')

ROLE_LABELS = {
    "upstream": {"zh": "上游", "en": "Upstream"},
    "midstream": {"zh": "中游", "en": "Midstream"},
    "downstream": {"zh": "下游", "en": "Downstream"},
    "related": {"zh": "相關公司", "en": "Related Companies"},
}


def setup_stdout() -> None:
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def theme_id_from_filename(filename: str) -> str:
    return Path(filename).stem.replace("_", " ")


def parse_args(argv: list[str]) -> tuple[Path, Path]:
    graph_output = DEFAULT_GRAPH_OUTPUT
    company_output = DEFAULT_COMPANY_OUTPUT

    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--output":
            if i + 1 >= len(argv):
                raise SystemExit("Error: --output requires a file path")
            graph_output = Path(argv[i + 1])
            i += 2
            continue
        if arg == "--company-output":
            if i + 1 >= len(argv):
                raise SystemExit("Error: --company-output requires a file path")
            company_output = Path(argv[i + 1])
            i += 2
            continue
        raise SystemExit(f"Error: unknown argument: {arg}")

    return graph_output, company_output


def load_sector_translations() -> dict[str, str]:
    if not WEB_I18N_PATH.exists():
        return {}

    content = WEB_I18N_PATH.read_text(encoding="utf-8")
    block_match = SECTOR_TRANSLATION_BLOCK_RE.search(content)
    if not block_match:
        return {}

    block = block_match.group(1)
    return {match.group(1): match.group(2) for match in SECTOR_TRANSLATION_PAIR_RE.finditer(block)}


def load_theme_records() -> list[dict]:
    records = []
    for path in sorted(THEMES_DIR.glob("*.md")):
        if path.name == "README.md":
            continue

        content = path.read_text(encoding="utf-8")
        lines = content.splitlines()
        title = ""
        note = ""
        related_themes = []

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
        if "上游" in prefix:
            found_roles.append("upstream")
        elif "中游" in prefix:
            found_roles.append("midstream")
        elif "下游" in prefix:
            found_roles.append("downstream")

    ordered_roles = []
    for role in found_roles:
        if role not in ordered_roles:
            ordered_roles.append(role)

    if ordered_roles:
        return ordered_roles[0], ordered_roles
    return "related", ["related"]


def scan_theme_company_mentions(theme_ids: set[str], sector_translations: dict[str, str]) -> dict[str, list[dict]]:
    theme_company_map: dict[str, list[dict]] = defaultdict(list)

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


def build_graph(theme_records: list[dict]) -> dict:
    theme_ids = {record["theme_id"] for record in theme_records}
    supplemental_ids = {record["theme_id"] for record in theme_records if record["is_supplemental"]}

    nodes: dict[str, dict] = {}
    link_map: dict[tuple[str, str], dict] = {}
    inbound_by_node: dict[str, set[str]] = defaultdict(set)
    outbound_by_node: dict[str, set[str]] = defaultdict(set)

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

    serialized_nodes = []
    for node_id in sorted(nodes):
        node = dict(nodes[node_id])
        node["group"] = node["type"]
        node["is_theme_page"] = node["type"] in {"theme", "supplemental_theme"}
        node["mentioned_by_count"] = len(inbound_by_node.get(node_id, set()))
        node["outgoing_count"] = len(outbound_by_node.get(node_id, set()))
        node["degree"] = node["mentioned_by_count"] + node["outgoing_count"]
        node["radius_hint"] = 24 if node["is_theme_page"] else 9
        serialized_nodes.append(node)

    serialized_links = []
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
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_dir": "themes",
        "graph_kind": "theme_to_wikilink",
        "node_counts": {
            "total": len(serialized_nodes),
            "themes": sum(1 for n in serialized_nodes if n["type"] == "theme"),
            "supplemental_themes": sum(1 for n in serialized_nodes if n["type"] == "supplemental_theme"),
            "wikilinks": sum(1 for n in serialized_nodes if n["type"] == "wikilink"),
        },
        "nodes": serialized_nodes,
        "links": serialized_links,
    }


def build_theme_company_payload(
    theme_records: list[dict],
    theme_company_mentions: dict[str, list[dict]],
) -> dict:
    def serialize_company(company: dict) -> dict:
        return {
            "ticker": company["ticker"],
            "company_name": company["company_name"],
            "sector_en": company["sector_en"],
            "sector_zh": company["sector_zh"],
        }

    themes = []
    for record in theme_records:
        theme_id = record["theme_id"]
        companies = sorted(
            theme_company_mentions.get(theme_id, []),
            key=lambda item: (item["role"], item["sector_en"], item["ticker"], item["company_name"]),
        )

        companies_by_role = {}
        counts_by_role = {}
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
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_dir": "Pilot_Reports",
        "payload_kind": "theme_company_map",
        "theme_count": len(themes),
        "themes": themes,
    }


def main() -> None:
    setup_stdout()
    graph_output, company_output = parse_args(sys.argv[1:])

    graph_output.parent.mkdir(parents=True, exist_ok=True)
    company_output.parent.mkdir(parents=True, exist_ok=True)

    theme_records = load_theme_records()
    sector_translations = load_sector_translations()
    theme_company_mentions = scan_theme_company_mentions(
        {record["theme_id"] for record in theme_records},
        sector_translations,
    )

    graph_payload = build_graph(theme_records)
    company_payload = build_theme_company_payload(theme_records, theme_company_mentions)

    graph_output.write_text(json.dumps(graph_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    company_output.write_text(json.dumps(company_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"Saved {graph_payload['node_counts']['total']} nodes / {len(graph_payload['links'])} links "
        f"to {graph_output}"
    )
    print(
        f"Saved {company_payload['theme_count']} themes with company mappings "
        f"to {company_output}"
    )


if __name__ == "__main__":
    main()
