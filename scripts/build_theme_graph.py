"""
build_theme_graph.py - Export theme graph JSON artifacts.

Reads theme markdown files under themes/ and writes:
- graph/theme_graph.json
- graph/theme_company_map.json
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from graph_builder import (
        DEFAULT_COMPANY_OUTPUT,
        DEFAULT_GRAPH_OUTPUT,
        build_graph_bundle,
        setup_stdout,
        write_graph_json_outputs,
    )
except ImportError:
    from scripts.graph_builder import (
        DEFAULT_COMPANY_OUTPUT,
        DEFAULT_GRAPH_OUTPUT,
        build_graph_bundle,
        setup_stdout,
        write_graph_json_outputs,
    )


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


def main() -> None:
    setup_stdout()
    graph_output, company_output = parse_args(sys.argv[1:])
    bundle = build_graph_bundle()
    graph_payload = bundle["graph"]
    company_payload = bundle["company_map"]
    write_graph_json_outputs(graph_payload, company_payload, graph_output, company_output)

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
