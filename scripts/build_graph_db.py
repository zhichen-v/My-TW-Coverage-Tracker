"""
build_graph_db.py - Build the dedicated graph database and refresh graph JSON exports.

Writes:
- data/graph.db
- graph/theme_graph.json
- graph/theme_company_map.json
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from graph_builder import (
        DEFAULT_COMPANY_OUTPUT,
        DEFAULT_GRAPH_DB_PATH,
        DEFAULT_GRAPH_OUTPUT,
        build_graph_bundle,
        setup_stdout,
        write_graph_database,
        write_graph_json_outputs,
    )
except ImportError:
    from scripts.graph_builder import (
        DEFAULT_COMPANY_OUTPUT,
        DEFAULT_GRAPH_DB_PATH,
        DEFAULT_GRAPH_OUTPUT,
        build_graph_bundle,
        setup_stdout,
        write_graph_database,
        write_graph_json_outputs,
    )


def parse_args(argv: list[str]) -> tuple[Path, Path, Path, bool]:
    db_path = DEFAULT_GRAPH_DB_PATH
    graph_output = DEFAULT_GRAPH_OUTPUT
    company_output = DEFAULT_COMPANY_OUTPUT
    write_json = True

    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--db-path":
            if i + 1 >= len(argv):
                raise SystemExit("Error: --db-path requires a file path")
            db_path = Path(argv[i + 1])
            i += 2
            continue
        if arg == "--graph-output":
            if i + 1 >= len(argv):
                raise SystemExit("Error: --graph-output requires a file path")
            graph_output = Path(argv[i + 1])
            i += 2
            continue
        if arg == "--company-output":
            if i + 1 >= len(argv):
                raise SystemExit("Error: --company-output requires a file path")
            company_output = Path(argv[i + 1])
            i += 2
            continue
        if arg == "--skip-json":
            write_json = False
            i += 1
            continue
        raise SystemExit(f"Error: unknown argument: {arg}")

    return db_path, graph_output, company_output, write_json


def main() -> None:
    setup_stdout()
    db_path, graph_output, company_output, write_json = parse_args(sys.argv[1:])

    bundle = build_graph_bundle()
    write_graph_database(db_path, bundle["graph"], bundle["company_map"], bundle["meta"])
    if write_json:
        write_graph_json_outputs(bundle["graph"], bundle["company_map"], graph_output, company_output)

    print(
        f"Saved graph database with {bundle['meta']['theme_count']} themes / "
        f"{bundle['meta']['node_count']} nodes / {bundle['meta']['link_count']} links "
        f"to {db_path}"
    )
    if write_json:
        print(f"Refreshed graph JSON exports at {graph_output} and {company_output}")


if __name__ == "__main__":
    main()
