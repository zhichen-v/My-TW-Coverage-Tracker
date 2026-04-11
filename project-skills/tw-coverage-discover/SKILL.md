---
name: tw-coverage-discover
description: Discover Taiwan-listed companies related to a buzzword, technology, material, or supply-chain theme in this repository. Use when Codex needs to search the existing coverage database, optionally apply wikilinks for an identified theme, or research missing matches before proposing report updates.
---

# TW Coverage Discover

Read `AGENTS.md` before mutating reports. This workflow starts with the local database and only moves to external research when the local search is insufficient.

## Workflow

1. Work from the repo root inside `.venv`. Install dependencies with `uv pip install -r requirements.txt` if needed.
2. Search the local database first with `.venv\Scripts\python.exe scripts/discover.py "<buzzword>" [--smart] [--sector <sector>]`.
3. If results are found, summarize the companies and relationship types before applying edits.
4. Use `--apply` only when the user wants report files updated for that buzzword.
5. If no results are found, research externally, map findings back to existing ticker files, and verify ticker/company identity before editing.
6. Preserve existing report content. Add only the minimum new wikilinks or wording needed to represent the theme correctly.
7. When edits were applied, rebuild downstream artifacts with `--rebuild` or run the specific rebuild scripts that were affected.

## Notes

- Keep `discover.py` as the first stop. It is cheaper and more deterministic than web-first research.
- Use `references/legacy-project-rules.md` for the archived project wording around fallback research and theme creation.
