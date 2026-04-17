# Theme Graph Data

Generated graph data for theme-to-wikilink exploration lives here.

- Primary build: `.\.venv\Scripts\python.exe scripts\build_graph_db.py`
- JSON-only build: `.\.venv\Scripts\python.exe scripts\build_theme_graph.py`
- Default outputs:
  - `graph/theme_graph.json`
  - `graph/theme_company_map.json`
- Live API backing store: `data/graph.db`
- Source inputs:
  - `themes/*.md`
  - `Pilot_Reports/**/*.md` for theme-company mapping
- Demo page: `graph/index.html`

`theme_graph.json` contains:

- `nodes`: theme pages plus referenced wikilinks
- `links`: theme -> wikilink mention edges
- `occurrences`: per-edge line/section references back to the source markdown
- `note`: the theme page blockquote line (`> ...`)
- `related_themes`: parsed from the `**相關主題：** ...` line on each theme page
- D3-ready fields such as `group`, `degree`, `radius_hint`, `weight`, and `primary_section`

To preview the static HTML locally:

- `.\.venv\Scripts\python.exe -m http.server 8000`
- Open `http://127.0.0.1:8000/graph/`
