---
name: tw-coverage-add-ticker
description: Add a new Taiwan-listed company coverage report in this repository, including base report generation, enrichment handoff, and audit steps. Use when Codex needs to create a new ticker file under `Pilot_Reports/`, expand coverage to a newly requested company, or guide a user through the add-ticker workflow.
---

# TW Coverage Add Ticker

Read `AGENTS.md` before editing reports. Follow the repo-wide constraints there, especially ticker identity verification, Traditional Chinese output, and wikilink specificity.

## Workflow

1. Work from the repo root inside `.venv`. Install dependencies with `uv pip install -r requirements.txt` if the environment is missing required packages.
2. Generate the base report with `.venv\Scripts\python.exe scripts/add_ticker.py <ticker> <name> [--sector <sector>]`.
3. Read the generated filename and verify the ticker/company identity before doing any research or enrichment.
4. Research the company and prepare enrichment JSON for `desc`, `supply_chain`, and `cust`.
5. Apply the enrichment with `.venv\Scripts\python.exe scripts/update_enrichment.py --data <json> <ticker>`.
6. Audit the result with `.venv\Scripts\python.exe scripts/audit_batch.py --all -v` or a narrower scope when available.
7. Rebuild `WIKILINKS.md` if the new report materially changes the wikilink graph.

## Notes

- Use `references/legacy-project-rules.md` when you need the archived slash-command phrasing or example queries from the prior project setup.
- Do not hand-edit the financial tables section after report creation. Use project scripts for financial data changes.
