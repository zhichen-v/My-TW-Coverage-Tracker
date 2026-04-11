---
name: update-financials
description: Update financial tables (annual 3yr + quarterly 4Q) for ticker reports using yfinance data
user_invocable: true
---

# Update Financials

Refresh the `## 鞎∪?璁?` section in ticker reports with the latest financial data from yfinance. Also updates market cap and enterprise value in metadata.

**All enrichment content (璆剖?蝪∩?, 靘??? 摰Ｘ??? is preserved ??only financials are replaced.**

## Usage

The user can specify scope in their message:

- **All tickers**: `/update-financials` (no arguments ??updates all 1,733 reports)
- **Single ticker**: `/update-financials 2330`
- **Multiple tickers**: `/update-financials 2330 2317 3034`
- **By batch**: `/update-financials --batch 101`
- **By sector**: `/update-financials --sector Semiconductors`
- **Dry run**: add `--dry-run` to preview without writing

## Instructions

1. Parse the user's arguments from their message.
2. Run the update script:

```bash
cd "f:\My TW Coverage" && python scripts/update_financials.py [ARGS]
```

3. Report results: how many updated, skipped, failed.
4. If updating ALL tickers, warn the user this will take a while (~15-30 min for 1,733 tickers due to yfinance rate limits) and ask for confirmation before proceeding.
5. After completion, ask if the user wants to commit the changes.

## What Gets Updated

| Field | Source | Location |
|---|---|---|
| **撣?* (Market Cap) | `stock.info['marketCap']` | Metadata block |
| **隡平?孵?* (Enterprise Value) | `stock.info['enterpriseValue']` | Metadata block |
| **撟游漲鞎∪? (3yr)** | `stock.income_stmt` + `stock.cashflow` | `### 撟游漲?鞎∪??豢?` table |
| **摮?漲鞎∪? (4Q)** | `stock.quarterly_income_stmt` + `stock.quarterly_cashflow` | `### 摮?漲?鞎∪??豢?` table |

All monetary values in **?曇?啣馳** (Million NTD). Margins in **%**.

## Metrics Tracked

Revenue, Gross Profit, Gross Margin %, Selling & Marketing Exp, General & Admin Exp, Operating Income, Operating Margin %, Net Income, Net Margin %, Op Cash Flow, Investing Cash Flow, Financing Cash Flow, CAPEX.
