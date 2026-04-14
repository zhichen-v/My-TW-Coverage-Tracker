"""
build_themes.py - Generate thematic investment screens from report wikilinks.

The script reads theme definitions from themes/theme_definitions.json, scans
Pilot_Reports/ markdown files for wikilinks, and rebuilds themes/*.md pages.
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    from report_parser import parse_report_content
except ImportError:
    from scripts.report_parser import parse_report_content


PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = PROJECT_ROOT / "Pilot_Reports"
THEMES_DIR = PROJECT_ROOT / "themes"
DEFINITIONS_PATH = THEMES_DIR / "theme_definitions.json"
WIKILINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
SUPPLEMENTAL_MARKER = "<!-- graph_role: supplemental -->"


def setup_stdout() -> None:
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def safe_filename(theme_id: str) -> str:
    return theme_id.replace(" ", "_").replace("/", "_")


def load_theme_definitions() -> list[dict]:
    with DEFINITIONS_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    themes = payload.get("themes", [])
    if not themes:
        raise SystemExit(f"No themes found in {DEFINITIONS_PATH}")
    return themes


def extract_role_from_supply_chain(supply_chain_text: str, wikilink: str) -> str:
    role = "related"
    for match in re.finditer(re.escape(f"[[{wikilink}]]"), supply_chain_text):
        prefix = supply_chain_text[max(0, match.start() - 120):match.start()]
        if "上游" in prefix:
            return "upstream"
        if "下游" in prefix:
            return "downstream"
        if "中游" in prefix:
            return "midstream"
        role = "related"
    return role


def scan_wikilinks() -> dict[str, list[dict[str, str]]]:
    """Return {wikilink: [{ticker, company, sector, role}, ...]}."""
    wikilink_map: dict[str, list[dict[str, str]]] = defaultdict(list)

    for path in sorted(REPORTS_DIR.rglob("*.md")):
        match = re.match(r"^(\d{4})_(.+)\.md$", path.name)
        if not match:
            continue

        ticker, company = match.group(1), match.group(2)
        content = path.read_text(encoding="utf-8")
        parsed = parse_report_content(content)

        overview_text = parsed["overview_text"]
        supply_chain_text = parsed["supply_chain_text"]
        customer_text = parsed["customer_supplier_text"]
        text = "\n".join([overview_text, supply_chain_text, customer_text])

        for wikilink in set(WIKILINK_RE.findall(text)):
            role = (
                extract_role_from_supply_chain(supply_chain_text, wikilink)
                if f"[[{wikilink}]]" in supply_chain_text
                else "related"
            )
            wikilink_map[wikilink].append(
                {
                    "ticker": ticker,
                    "company": company,
                    "sector": path.parent.name,
                    "role": role,
                }
            )

    return wikilink_map


def format_entries(entries: list[dict[str, str]]) -> list[str]:
    by_sector: dict[str, list[dict[str, str]]] = defaultdict(list)
    for entry in entries:
        by_sector[entry["sector"]].append(entry)

    lines: list[str] = []
    for sector in sorted(by_sector):
        for item in sorted(by_sector[sector], key=lambda value: (value["ticker"], value["company"])):
            lines.append(f"- **{item['ticker']} {item['company']}** ({sector})")
    return lines


def build_theme_page(theme: dict, wikilink_map: dict[str, list[dict[str, str]]]) -> str | None:
    theme_id = theme["id"]
    entries = wikilink_map.get(theme_id, [])
    if not entries:
        return None

    lines: list[str] = [f"# {theme['name']}", ""]

    if theme.get("supplemental"):
        lines.extend([SUPPLEMENTAL_MARKER, ""])

    if theme.get("desc"):
        lines.extend([f"> {theme['desc']}", ""])

    lines.extend([f"**相關公司數：** {len(entries)}", ""])

    related_links = []
    for related in theme.get("related", []):
        count = len(wikilink_map.get(related, []))
        if count > 0:
            related_links.append(f"[[{related}]] ({count})")
    if related_links:
        lines.extend([f"**相關主題：** {' | '.join(related_links)}", ""])

    lines.extend(["---", ""])

    role_sections = [
        ("upstream", "上游"),
        ("midstream", "中游"),
        ("downstream", "下游"),
        ("related", "相關公司"),
    ]

    for role_key, role_label in role_sections:
        role_entries = [entry for entry in entries if entry["role"] == role_key]
        if not role_entries:
            continue
        lines.extend([f"## {role_label} ({len(role_entries)})", ""])
        lines.extend(format_entries(role_entries))
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def build_index(themes: list[dict], built_counts: dict[str, int]) -> str:
    lines = [
        "# Thematic Investment Screens",
        "",
        "> Auto-generated supply chain maps for thematic investing.",
        "> Regenerate: `python scripts/build_themes.py`",
        "",
        "---",
        "",
    ]

    categories: dict[str, list[dict]] = defaultdict(list)
    for theme in themes:
        categories[theme.get("category", "Uncategorized")].append(theme)

    for category in sorted(categories):
        visible = [theme for theme in categories[category] if theme["id"] in built_counts]
        if not visible:
            continue
        lines.extend([f"## {category}", ""])
        for theme in visible:
            theme_id = theme["id"]
            file_name = safe_filename(theme_id)
            lines.append(f"- [{theme_id}]({file_name}.md) · {built_counts[theme_id]} companies")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    setup_stdout()
    THEMES_DIR.mkdir(parents=True, exist_ok=True)

    definitions = load_theme_definitions()
    themes_by_id = {theme["id"]: theme for theme in definitions}

    args = sys.argv[1:]
    if "--list" in args:
        for theme_id in sorted(themes_by_id):
            print(f"  {theme_id}: {themes_by_id[theme_id]['name']}")
        return

    print("Scanning wikilinks across all reports...")
    wikilink_map = scan_wikilinks()
    print(f"Found {len(wikilink_map)} unique wikilinks.\n")

    if args:
        requested_theme = args[0]
        if requested_theme not in themes_by_id:
            raise SystemExit(
                f"Theme '{requested_theme}' not in {DEFINITIONS_PATH.name}. Use --list to see available themes."
            )
        themes_to_build = [themes_by_id[requested_theme]]
    else:
        themes_to_build = definitions

    built_counts: dict[str, int] = {}
    for theme in themes_to_build:
        page = build_theme_page(theme, wikilink_map)
        if not page:
            continue
        output_path = THEMES_DIR / f"{safe_filename(theme['id'])}.md"
        output_path.write_text(page, encoding="utf-8")
        count = len(wikilink_map.get(theme["id"], []))
        built_counts[theme["id"]] = count
        print(f"  {theme['id']}: {count} companies -> {output_path.name}")

    index = build_index(definitions, built_counts if args else {theme_id: len(wikilink_map.get(theme_id, [])) for theme_id in themes_by_id if wikilink_map.get(theme_id)})
    (THEMES_DIR / "README.md").write_text(index, encoding="utf-8")

    print(f"\nDone. Generated {len(built_counts)} theme pages in themes/")


if __name__ == "__main__":
    main()
