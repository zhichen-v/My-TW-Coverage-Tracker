---
name: tw-coverage-update-financials
description: Refresh financial tables and valuation metadata in existing ticker reports using the repo's automation scripts. Use when Codex needs to update annual or quarterly financial data, market cap, enterprise value, or decide between full financial refresh and the lighter valuation-only workflow.
---

# TW Coverage Update Financials

Read `AGENTS.md` first. This workflow updates script-owned financial content; do not replace that content manually.

## Workflow

1. Work from the repo root inside `.venv`. Install dependencies with `uv pip install -r requirements.txt` if needed.
2. Resolve the scope first: single ticker, multiple tickers, batch, sector, or all.
3. Use `.venv\Scripts\python.exe scripts/update_financials.py [scope]` for full financial table refreshes.
4. Use `.venv\Scripts\python.exe scripts/update_valuation.py [scope]` when only valuation multiples and related metadata need to change.
5. For very large scopes, warn about runtime and rate-limit behavior before execution.
6. Report updated, skipped, and failed targets after the script finishes.

## Notes

- Use `references/legacy-project-rules.md` for the archived slash-command wording and examples from the older project setup.
- Do not mix this workflow with manual report narrative edits unless the user asked for both financial and enrichment updates.
