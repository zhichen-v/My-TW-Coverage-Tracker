---
name: tw-coverage-update-enrichment
description: Refresh business descriptions, supply-chain mapping, and customer or supplier sections for existing ticker reports while preserving financial tables. Use when Codex needs to re-research coverage content, apply new enrichment JSON, or update report narratives for an existing scope of tickers.
---

# TW Coverage Update Enrichment

Read `AGENTS.md` first. The common failure mode in this repo is mixing up ticker identity or degrading report quality, so verify carefully before writing.

## Workflow

1. Work from the repo root inside `.venv`. Install dependencies with `uv pip install -r requirements.txt` if needed.
2. Resolve the scope first: single ticker, multiple tickers, batch, sector, or all.
3. Read each target report before researching so the update preserves useful existing structure.
4. Verify the filename's ticker/company identity against your research before preparing content.
5. Prepare enrichment JSON with `desc`, `supply_chain`, and `cust`.
6. Apply the update with `.venv\Scripts\python.exe scripts/update_enrichment.py --data <json> [scope]`.
7. Audit the changed scope and rebuild `WIKILINKS.md` if the wikilink graph changed materially.

## Notes

- Do not hand-edit the financial tables section. This skill is for narrative and relationship content only.
- Use `references/legacy-project-rules.md` when you need the archived query wording or the prior slash-command contract.
