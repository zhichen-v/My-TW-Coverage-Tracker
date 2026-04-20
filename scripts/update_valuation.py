"""
update_valuation.py -- Refresh ONLY the valuation multiples in ticker reports.

Much faster than update_financials.py since it only fetches stock.info (no
financial statements). Updates: P/E (TTM), Forward P/E, P/S, P/B, EV/EBITDA,
stock price, and period dates. Preserves all other content including financial
tables.

Usage:
  python scripts/update_valuation.py                     # ALL tickers
  python scripts/update_valuation.py 2330                # Single ticker
  python scripts/update_valuation.py 2330 2317 3034      # Multiple tickers
  python scripts/update_valuation.py --batch 101         # By batch
  python scripts/update_valuation.py --sector Semiconductors  # By sector
  python scripts/update_valuation.py --dry-run 2330      # Preview without writing
"""

import os
import re
import sys
import time

import yfinance as yf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utils import (
    PROJECT_ROOT,
    build_valuation_table,
    fetch_valuation_data,
    find_ticker_files,
    parse_scope_args,
    setup_stdout,
    update_metadata,
)

FINANCIALS_HEADER = "## 財務概況 (單位: 百萬台幣, 只有 Margin 為 %)"
VALUATION_HEADER_PREFIX = "### 估值指標"
ANNUAL_HEADER = "### 年度關鍵財務數據 (近 3 年)"
YFINANCE_CACHE_DIR = os.path.join(PROJECT_ROOT, "data", "yfinance-cache")
YFINANCE_SUFFIXES = [".TW", ".TWO"]
YFINANCE_FETCH_ATTEMPTS = 2
YFINANCE_RETRY_DELAY_SECONDS = 1.5


def configure_yfinance_cache():
    os.makedirs(YFINANCE_CACHE_DIR, exist_ok=True)
    cache_setter = getattr(yf, "set_tz_cache_location", None)
    if callable(cache_setter):
        cache_setter(YFINANCE_CACHE_DIR)


def format_fetch_error(exc):
    message = str(exc).strip()
    if not message:
        return exc.__class__.__name__
    return message


def fetch_valuation(ticker):
    """Fetch valuation multiples only. Tries .TW then .TWO with small retries."""
    reasons = []

    for suffix in YFINANCE_SUFFIXES:
        symbol = f"{ticker}{suffix}"
        for attempt in range(1, YFINANCE_FETCH_ATTEMPTS + 1):
            try:
                stock = yf.Ticker(symbol)
                info = stock.info or {}
                if not info or not info.get("currentPrice"):
                    reasons.append(f"{symbol} attempt {attempt}: missing currentPrice in quote info")
                    if attempt < YFINANCE_FETCH_ATTEMPTS:
                        time.sleep(YFINANCE_RETRY_DELAY_SECONDS)
                    continue

                valuation = fetch_valuation_data(info)
                market_cap = (
                    f"{info['marketCap'] / 1_000_000:,.0f}"
                    if info.get("marketCap")
                    else None
                )
                enterprise_value = (
                    f"{info['enterpriseValue'] / 1_000_000:,.0f}"
                    if info.get("enterpriseValue")
                    else None
                )

                return {
                    "valuation": valuation,
                    "market_cap": market_cap,
                    "enterprise_value": enterprise_value,
                    "suffix": suffix,
                }, None
            except Exception as exc:
                reasons.append(f"{symbol} attempt {attempt}: {format_fetch_error(exc)}")
                if attempt < YFINANCE_FETCH_ATTEMPTS:
                    time.sleep(YFINANCE_RETRY_DELAY_SECONDS)

    failure_reason = "; ".join(reasons) if reasons else "no data from yfinance"
    return None, failure_reason


def replace_valuation_section(content, new_table):
    if VALUATION_HEADER_PREFIX in content and ANNUAL_HEADER in content:
        pattern = rf"{re.escape(VALUATION_HEADER_PREFIX)}.*?(?=\n{re.escape(ANNUAL_HEADER)})"
        new_content, replaced = re.subn(pattern, new_table + "\n", content, flags=re.DOTALL)
        return new_content, replaced > 0

    if FINANCIALS_HEADER in content and ANNUAL_HEADER in content:
        return content.replace(ANNUAL_HEADER, new_table + "\n\n" + ANNUAL_HEADER, 1), True

    return content, False


def update_file(filepath, ticker, dry_run=False):
    """Update only the valuation section in a ticker file."""
    with open(filepath, "r", encoding="utf-8") as handle:
        content = handle.read()

    data, failure_reason = fetch_valuation(ticker)
    if data is None:
        print(f"  {ticker}: SKIP ({failure_reason})")
        return False

    new_table = build_valuation_table(data["valuation"])
    new_content, replaced = replace_valuation_section(content, new_table)
    if not replaced:
        print(f"  {ticker}: SKIP (valuation section or annual financial header not found)")
        return False

    new_content = update_metadata(
        new_content,
        data.get("market_cap"),
        data.get("enterprise_value"),
    )

    if dry_run:
        print(f"  {ticker}: WOULD UPDATE ({data['suffix']})")
        return True

    with open(filepath, "w", encoding="utf-8") as handle:
        handle.write(new_content)
    print(f"  {ticker}: UPDATED ({data['suffix']})")
    return True


def main():
    setup_stdout()
    configure_yfinance_cache()

    args = list(sys.argv[1:])
    dry_run = "--dry-run" in args
    if dry_run:
        args.remove("--dry-run")

    tickers, sector, desc = parse_scope_args(args)
    print(f"Updating valuation for {desc}...")
    files = find_ticker_files(tickers, sector)

    if not files:
        print("No matching files found.")
        return

    print(f"Found {len(files)} files.\n")
    updated = failed = skipped = 0

    for ticker in sorted(files.keys()):
        try:
            if update_file(files[ticker], ticker, dry_run):
                updated += 1
            else:
                skipped += 1
        except Exception as exc:
            print(f"  {ticker}: ERROR ({exc})")
            failed += 1
        time.sleep(0.3)

    print(f"\nDone. Updated: {updated} | Skipped: {skipped} | Failed: {failed}")


if __name__ == "__main__":
    main()
