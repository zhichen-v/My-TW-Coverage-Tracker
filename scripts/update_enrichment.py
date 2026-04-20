"""
update_enrichment.py -- Update enrichment content (description, supply chain,
customers/suppliers) in ticker reports while preserving financial tables.

This script applies enrichment data from a JSON file to ticker report files. It
replaces 業務簡介, 供應鏈位置, and 主要客戶及供應商 sections while preserving
metadata and 財務概況.

Usage:
  python scripts/update_enrichment.py --data enrichment.json
  python scripts/update_enrichment.py --data enrichment.json 2330
  python scripts/update_enrichment.py --data enrichment.json --batch 101
  python scripts/update_enrichment.py --data enrichment.json --sector Semiconductors
  python scripts/update_enrichment.py --data enrichment.json --dry-run 2330
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utils import PROJECT_ROOT, find_ticker_files, normalize_wikilinks, parse_scope_args, setup_stdout

BUSINESS_HEADER = "## 業務簡介"
SUPPLY_CHAIN_HEADER = "## 供應鏈位置"
CUSTOMER_SUPPLIER_HEADER = "## 主要客戶及供應商"
FINANCIALS_HEADER = "## 財務概況 (單位: 百萬台幣, 只有 Margin 為 %)"
METADATA_PREFIXES = (
    "**板塊:**",
    "**產業:**",
    "**市值:**",
    "**企業價值:**",
)


def load_enrichment_data(json_path):
    with open(json_path, "r", encoding="utf-8-sig") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError("Enrichment JSON must be an object keyed by ticker.")
    return data


def extract_data_arg(args):
    if "--data" not in args:
        return None, args

    idx = args.index("--data")
    if idx + 1 >= len(args):
        raise ValueError("--data requires a JSON file path.")

    json_path = args[idx + 1]
    remaining_args = args[:idx] + args[idx + 2:]
    return json_path, remaining_args


def split_metadata_lines(section_body):
    lines = section_body.splitlines()
    metadata_lines = []
    index = 0

    while index < len(lines) and any(lines[index].startswith(prefix) for prefix in METADATA_PREFIXES):
        metadata_lines.append(lines[index])
        index += 1

    while index < len(lines) and lines[index] == "":
        index += 1

    remaining_body = "\n".join(lines[index:]).strip()
    return metadata_lines, remaining_body


def build_metadata_lines(data):
    sector = data.get("sector", "N/A")
    industry = data.get("industry", "N/A")
    return [
        f"**板塊:** {sector}",
        f"**產業:** {industry}",
        "**市值:** N/A 百萬台幣",
        "**企業價值:** N/A 百萬台幣",
    ]


def replace_section_body(content, header, next_header, new_body):
    pattern = rf"({re.escape(header)}\n)(.*?)(?=\n{re.escape(next_header)})"
    return re.subn(pattern, rf"\g<1>{new_body.rstrip()}\n", content, flags=re.DOTALL)


def update_business_section(content, data):
    pattern = rf"({re.escape(BUSINESS_HEADER)}\n)(.*?)(?=\n{re.escape(SUPPLY_CHAIN_HEADER)})"
    match = re.search(pattern, content, flags=re.DOTALL)
    if not match:
        return content, False

    existing_body = match.group(2)
    metadata_lines, _ = split_metadata_lines(existing_body)
    if not metadata_lines:
        metadata_lines = build_metadata_lines(data)

    body_parts = []
    if metadata_lines:
        body_parts.append("\n".join(metadata_lines))
        body_parts.append("")
    body_parts.append(data["desc"].rstrip())
    replacement_body = "\n".join(body_parts).rstrip()

    new_content = re.sub(
        pattern,
        rf"\g<1>{replacement_body}\n",
        content,
        flags=re.DOTALL,
    )
    return new_content, True


def apply_enrichment(filepath, ticker, data, dry_run=False):
    with open(filepath, "r", encoding="utf-8") as handle:
        original_content = handle.read()

    content = original_content
    applied_sections = []

    if "desc" in data:
        content, replaced = update_business_section(content, data)
        if not replaced:
            print(f"  {ticker}: SKIP (business section not found)")
            return False
        applied_sections.append("desc")

    if "supply_chain" in data:
        content, replaced = replace_section_body(
            content,
            SUPPLY_CHAIN_HEADER,
            CUSTOMER_SUPPLIER_HEADER,
            data["supply_chain"],
        )
        if not replaced:
            print(f"  {ticker}: SKIP (supply-chain section not found)")
            return False
        applied_sections.append("supply_chain")

    if "cust" in data:
        content, replaced = replace_section_body(
            content,
            CUSTOMER_SUPPLIER_HEADER,
            FINANCIALS_HEADER,
            data["cust"],
        )
        if not replaced:
            print(f"  {ticker}: SKIP (customer/supplier section not found)")
            return False
        applied_sections.append("cust")

    content = normalize_wikilinks(content)

    if content == original_content:
        print(f"  {ticker}: SKIP (no content changes)")
        return False

    if dry_run:
        print(f"  {ticker}: WOULD ENRICH ({', '.join(applied_sections)})")
        return True

    with open(filepath, "w", encoding="utf-8") as handle:
        handle.write(content)

    print(f"  {ticker}: ENRICHED ({os.path.basename(filepath)})")
    return True


def main():
    setup_stdout()

    args = list(sys.argv[1:])
    dry_run = "--dry-run" in args
    if dry_run:
        args.remove("--dry-run")

    try:
        json_path, args = extract_data_arg(args)
    except ValueError as exc:
        print(f"Error: {exc}")
        return

    if not json_path:
        print("Usage: python scripts/update_enrichment.py --data <json_file> [scope]")
        print("  Scope: 2330 | 2330 2317 | --batch 101 | --sector Semiconductors | (none=all)")
        return

    if not os.path.isabs(json_path):
        json_path = os.path.join(PROJECT_ROOT, json_path)

    try:
        enrichment_data = load_enrichment_data(json_path)
    except Exception as exc:
        print(f"Error loading enrichment data: {exc}")
        return

    print(f"Loaded {len(enrichment_data)} ticker entries from {os.path.basename(json_path)}")

    tickers, sector, desc = parse_scope_args(args)
    print(f"Scope: {desc}\n")

    available_tickers = list(enrichment_data.keys())
    if tickers:
        target_tickers = [ticker for ticker in tickers if ticker in enrichment_data]
    else:
        target_tickers = available_tickers

    files = find_ticker_files(target_tickers, sector)
    if not files:
        print("No matching files found.")
        return

    enriched = skipped = failed = 0
    missing_from_data = sorted(set(target_tickers) - set(files.keys()))

    for ticker in sorted(files.keys()):
        if ticker not in enrichment_data:
            print(f"  {ticker}: SKIP (no enrichment payload)")
            skipped += 1
            continue

        try:
            if apply_enrichment(files[ticker], ticker, enrichment_data[ticker], dry_run=dry_run):
                enriched += 1
            else:
                skipped += 1
        except Exception as exc:
            print(f"  {ticker}: ERROR ({exc})")
            failed += 1

    for ticker in missing_from_data:
        print(f"  {ticker}: SKIP (report file not found)")
        skipped += 1

    print(f"\nDone. Enriched: {enriched} | Skipped: {skipped} | Failed: {failed}")


if __name__ == "__main__":
    main()
