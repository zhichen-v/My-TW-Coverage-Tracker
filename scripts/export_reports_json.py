from __future__ import annotations

import argparse
import json
import os
import re

from report_parser import REPORTS_JSON_DIR, build_structured_report, json_abspath_from_report_path
from utils import REPORTS_DIR


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export Pilot_Reports markdown into mirrored structured JSON files."
    )
    parser.add_argument(
        "--output-root",
        default=REPORTS_JSON_DIR,
        help="Root directory for mirrored JSON output.",
    )
    return parser.parse_args()


def iter_report_paths() -> list[str]:
    report_paths = []
    for root, _, files in os.walk(REPORTS_DIR):
        for filename in files:
            if not filename.endswith(".md"):
                continue
            if not re.match(r"^\d{4}_.+\.md$", filename):
                continue
            report_paths.append(os.path.join(root, filename))
    return sorted(report_paths)


def export_reports(output_root: str) -> int:
    count = 0
    for report_path in iter_report_paths():
        payload = build_structured_report(report_path)
        default_output_path = json_abspath_from_report_path(report_path)
        relative_output_path = os.path.relpath(default_output_path, REPORTS_JSON_DIR)
        output_path = os.path.join(output_root, relative_output_path)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        count += 1
    return count


def main() -> None:
    args = parse_args()
    export_count = export_reports(args.output_root)
    print(f"Exported {export_count} report JSON files into {args.output_root}")


if __name__ == "__main__":
    main()
