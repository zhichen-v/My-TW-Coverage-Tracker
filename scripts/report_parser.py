from __future__ import annotations

import os
import re
from collections import Counter
from typing import Any

try:
    from utils import PROJECT_ROOT, REPORTS_DIR, get_ticker_from_filename
except ImportError:
    from scripts.utils import PROJECT_ROOT, REPORTS_DIR, get_ticker_from_filename

REPORTS_JSON_DIR = os.path.join(PROJECT_ROOT, "Pilot_Reports_JSON")
WIKILINK_PATTERN = re.compile(r"\[\[([^\]]+)\]\]")
H2_PATTERN = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
H3_PATTERN = re.compile(r"^###\s+(.+?)\s*$")
METADATA_LINE_PATTERN = re.compile(r"^\*\*(.+?)\*\*\s*:?\s*(.+?)\s*$")
GROUP_TITLE_PATTERN = re.compile(r"^\*\*(.+?)\*\*\s*:?\s*$")
TABLE_SEPARATOR_PATTERN = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$")
INLINE_TOKEN_PATTERN = re.compile(r"\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*")

SECTION_KEYS = ("overview", "supply_chain", "customer_supplier", "financials")


def extract_wikilinks(text: str) -> list[str]:
    return [match.strip() for match in WIKILINK_PATTERN.findall(text) if match.strip()]


def split_h2_sections(content: str) -> list[tuple[str, str]]:
    matches = list(H2_PATTERN.finditer(content))
    sections = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        sections.append((match.group(1).strip(), content[start:end].strip()))
    return sections


def build_section_map(content: str) -> dict[str, dict[str, str]]:
    sections = split_h2_sections(content)
    mapping: dict[str, dict[str, str]] = {}
    for index, key in enumerate(SECTION_KEYS):
        if index >= len(sections):
            mapping[key] = {"heading": "", "markdown": ""}
            continue
        heading, markdown = sections[index]
        mapping[key] = {"heading": heading, "markdown": markdown}
    return mapping


def parse_metadata_and_body(section_body: str) -> tuple[list[dict[str, str]], str]:
    metadata_items: list[dict[str, str]] = []
    body_lines: list[str] = []
    collecting_metadata = True

    for raw_line in section_body.splitlines():
        line = raw_line.strip()
        if collecting_metadata and not line:
            continue
        if collecting_metadata:
            match = METADATA_LINE_PATTERN.match(line)
            if match:
                metadata_items.append(
                    {
                        "label": match.group(1).strip(),
                        "value": match.group(2).strip(),
                    }
                )
                continue
            collecting_metadata = False
        body_lines.append(raw_line)

    return metadata_items, "\n".join(body_lines).strip()


def is_table_start(lines: list[str], index: int) -> bool:
    if index + 1 >= len(lines):
        return False
    return lines[index].lstrip().startswith("|") and bool(TABLE_SEPARATOR_PATTERN.match(lines[index + 1]))


def split_table_row(line: str) -> list[str]:
    stripped = line.strip().strip("|")
    return [cell.strip() for cell in stripped.split("|")]


def tokenize_inline_text(text: str) -> list[dict[str, str]]:
    segments: list[dict[str, str]] = []
    last_index = 0

    for match in INLINE_TOKEN_PATTERN.finditer(text):
        start, end = match.span()
        if start > last_index:
            plain_text = text[last_index:start]
            if plain_text:
                segments.append({"type": "text", "text": plain_text})

        wikilink_text = match.group(1)
        strong_text = match.group(2)
        if wikilink_text:
            segments.append({"type": "wikilink", "text": wikilink_text.strip()})
        elif strong_text:
            segments.append({"type": "strong", "text": strong_text})

        last_index = end

    if last_index < len(text):
        tail_text = text[last_index:]
        if tail_text:
            segments.append({"type": "text", "text": tail_text})

    if not segments and text:
        return [{"type": "text", "text": text}]

    return segments


def parse_markdown_blocks(markdown: str) -> list[dict[str, Any]]:
    lines = markdown.splitlines()
    blocks: list[dict[str, Any]] = []
    index = 0

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        if not stripped:
            index += 1
            continue

        if is_table_start(lines, index):
            columns = split_table_row(lines[index])
            index += 2
            rows: list[list[str]] = []
            while index < len(lines) and lines[index].lstrip().startswith("|"):
                rows.append(split_table_row(lines[index]))
                index += 1
            blocks.append(
                {
                    "type": "table",
                    "columns": columns,
                    "rows": rows,
                }
            )
            continue

        if stripped.startswith("- "):
            items: list[str] = []
            current_item = stripped[2:].strip()
            index += 1
            while index < len(lines):
                next_line = lines[index]
                next_stripped = next_line.strip()
                if not next_stripped:
                    if current_item:
                        items.append(current_item)
                        current_item = ""
                    index += 1
                    break
                if next_stripped.startswith("- "):
                    if current_item:
                        items.append(current_item)
                    current_item = next_stripped[2:].strip()
                    index += 1
                    continue
                if is_table_start(lines, index) or H3_PATTERN.match(next_stripped) or GROUP_TITLE_PATTERN.match(next_stripped):
                    break
                current_item = f"{current_item}\n{next_stripped}" if current_item else next_stripped
                index += 1
            if current_item:
                items.append(current_item)
            blocks.append({"type": "list", "items": items})
            continue

        paragraph_lines = [stripped]
        index += 1
        while index < len(lines):
            next_line = lines[index]
            next_stripped = next_line.strip()
            if not next_stripped:
                index += 1
                break
            if (
                next_stripped.startswith("- ")
                or is_table_start(lines, index)
                or H3_PATTERN.match(next_stripped)
                or GROUP_TITLE_PATTERN.match(next_stripped)
            ):
                break
            paragraph_lines.append(next_stripped)
            index += 1
        paragraph_text = "\n".join(paragraph_lines)
        blocks.append({"type": "paragraph", "segments": tokenize_inline_text(paragraph_text)})

    normalized_blocks: list[dict[str, Any]] = []
    for block in blocks:
        if block["type"] == "list":
            normalized_blocks.append(
                {
                    "type": "list",
                    "items": [
                        {"segments": tokenize_inline_text(item)}
                        for item in block.get("items", [])
                    ],
                }
            )
            continue
        normalized_blocks.append(block)

    return normalized_blocks


def parse_grouped_section(markdown: str) -> dict[str, Any]:
    lines = markdown.splitlines()
    groups: list[dict[str, Any]] = []
    preamble_lines: list[str] = []
    current_group: dict[str, Any] | None = None
    current_lines: list[str] = []

    def flush_current_lines() -> None:
        nonlocal current_lines, preamble_lines
        target = current_group["blocks"] if current_group is not None else preamble_lines
        if current_group is not None:
            current_group["blocks"].extend(parse_markdown_blocks("\n".join(current_lines).strip()))
        else:
            preamble_lines.extend(current_lines)
        current_lines = []

    for line in lines:
        stripped = line.strip()
        h3_match = H3_PATTERN.match(stripped)
        bold_match = GROUP_TITLE_PATTERN.match(stripped)
        title = ""
        if h3_match:
            title = h3_match.group(1).strip()
        elif bold_match:
            title = bold_match.group(1).strip().rstrip(":")

        if title:
            if current_lines:
                flush_current_lines()
            current_group = {"title": title, "blocks": []}
            groups.append(current_group)
            continue

        current_lines.append(line)

    if current_lines:
        flush_current_lines()

    return {
        "blocks": parse_markdown_blocks("\n".join(preamble_lines).strip()),
        "groups": [group for group in groups if group["blocks"]],
    }


def parse_financial_section(markdown: str) -> dict[str, Any]:
    return parse_grouped_section(markdown)


def parse_structured_sections(section_map: dict[str, dict[str, str]]) -> dict[str, Any]:
    overview_markdown = section_map["overview"]["markdown"]
    metadata_items, overview_body = parse_metadata_and_body(overview_markdown)

    structured_sections = {
        "overview": {
            "heading": section_map["overview"]["heading"],
            "markdown": overview_body,
            "blocks": parse_markdown_blocks(overview_body),
            "groups": [],
        },
        "supply_chain": {
            "heading": section_map["supply_chain"]["heading"],
            "markdown": section_map["supply_chain"]["markdown"],
            **parse_grouped_section(section_map["supply_chain"]["markdown"]),
        },
        "customer_supplier": {
            "heading": section_map["customer_supplier"]["heading"],
            "markdown": section_map["customer_supplier"]["markdown"],
            **parse_grouped_section(section_map["customer_supplier"]["markdown"]),
        },
        "financials": {
            "heading": section_map["financials"]["heading"],
            "markdown": section_map["financials"]["markdown"],
            **parse_financial_section(section_map["financials"]["markdown"]),
        },
    }

    return {
        "metadata_items": metadata_items,
        "metadata_values": [item["value"] for item in metadata_items],
        "sections": structured_sections,
    }


def build_public_sections(structured_sections: dict[str, dict[str, Any]]) -> dict[str, Any]:
    public_sections: dict[str, Any] = {}
    for key, section in structured_sections.items():
        public_sections[key] = {
            "heading": section.get("heading", ""),
            "blocks": section.get("blocks", []),
            "groups": section.get("groups", []),
        }
    return public_sections


def parse_report_content(content: str) -> dict[str, Any]:
    section_map = build_section_map(content)
    structured = parse_structured_sections(section_map)

    overview_text = structured["sections"]["overview"]["markdown"]
    supply_chain_text = section_map["supply_chain"]["markdown"]
    customer_supplier_text = section_map["customer_supplier"]["markdown"]
    financials_text = section_map["financials"]["markdown"]

    wikilinks_by_section = {
        "overview": Counter(extract_wikilinks(overview_text)),
        "supply_chain": Counter(extract_wikilinks(supply_chain_text)),
        "customer_supplier": Counter(extract_wikilinks(customer_supplier_text)),
        "financials": Counter(extract_wikilinks(financials_text)),
    }

    return {
        "section_map": section_map,
        "metadata_items": structured["metadata_items"],
        "metadata_values": structured["metadata_values"],
        "overview_text": overview_text,
        "supply_chain_text": supply_chain_text,
        "customer_supplier_text": customer_supplier_text,
        "financials_text": financials_text,
        "structured_content": {
            "metadata": {"items": structured["metadata_items"]},
            "sections": structured["sections"],
            "wikilinks": extract_wikilinks(content),
        },
        "wikilinks_by_section": wikilinks_by_section,
        "all_wikilinks": extract_wikilinks(content),
    }


def json_relpath_from_report_relpath(report_relpath: str) -> str:
    normalized = report_relpath.replace("\\", "/")
    if normalized.startswith("Pilot_Reports/"):
        normalized = normalized.replace("Pilot_Reports/", "Pilot_Reports_JSON/", 1)
    elif normalized == "Pilot_Reports":
        normalized = "Pilot_Reports_JSON"
    root, _ = os.path.splitext(normalized)
    return f"{root}.json"


def json_abspath_from_report_path(report_path: str) -> str:
    report_relpath = os.path.relpath(report_path, PROJECT_ROOT).replace("\\", "/")
    return os.path.join(PROJECT_ROOT, json_relpath_from_report_relpath(report_relpath))


def build_structured_report(report_path: str) -> dict[str, Any]:
    with open(report_path, "r", encoding="utf-8") as handle:
        content = handle.read()

    ticker, company_name = get_ticker_from_filename(report_path)
    if not ticker or not company_name:
        raise ValueError(f"Unexpected report filename format: {report_path}")

    parsed = parse_report_content(content)
    report_relpath = os.path.relpath(report_path, PROJECT_ROOT).replace("\\", "/")
    sector_folder = os.path.basename(os.path.dirname(report_path))
    title = content.splitlines()[0].strip() if content.strip() else f"# {ticker} - {company_name}"

    return {
        "report_id": report_relpath,
        "source_path": report_relpath,
        "json_path": json_relpath_from_report_relpath(report_relpath),
        "ticker": ticker,
        "company_name": company_name,
        "title": title,
        "sector_folder": sector_folder,
        "metadata": parsed["structured_content"]["metadata"],
        "sections": build_public_sections(parsed["structured_content"]["sections"]),
        "wikilinks": parsed["all_wikilinks"],
    }
