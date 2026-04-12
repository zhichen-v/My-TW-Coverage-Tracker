import type { SupportedLanguage } from "@/lib/i18n";

const translationPairs = [
  ["財務名詞解釋表", "Financial Terms Reference"],
  ["估值指標（Valuation Metrics）", "Valuation Metrics"],
  ["年度關鍵財務數據（Annual Financials）", "Annual Financials"],
  ["季度關鍵財務數據（Quarterly Financials）", "Quarterly Financials"],
  ["財務概況", "Financial Summary"],
  ["估值指標", "Valuation Metrics"],
  ["年度關鍵財務數據", "Annual Financials"],
  ["季度關鍵財務數據", "Quarterly Financials"],
  ["近 3 年", "Last 3 Years"],
  ["近 4 季", "Last 4 Quarters"],
  ["單位: 百萬台幣, 只有 Margin 為 %", "Unit: TWD millions, with margins shown in % only"],
  ["股價", "Share price"],
  ["截至", "through"],
  ["預估至", "forecast through"],
  ["名詞", "Term"],
  ["全名", "Full Name"],
  ["解釋", "Explanation"],
  ["投資意義", "Investment Relevance"],
  ["計算邏輯", "Calculation Logic"],
  ["重點觀察", "Key Observation"],
  ["分析重點", "Analysis Focus"],
  ["補充觀念", "Notes"],
  ["本益比（Trailing Twelve Months）", "Price-to-Earnings (Trailing Twelve Months)"],
  ["本益比", "Price-to-Earnings"],
  ["預估本益比", "Forward Price-to-Earnings"],
  ["股價營收比", "Price-to-Sales"],
  ["股價淨值比", "Price-to-Book"],
  ["企業價值倍數", "Enterprise Value to EBITDA"],
  ["營收", "Revenue"],
  ["毛利", "Gross Profit"],
  ["毛利率", "Gross Margin"],
  ["銷售費用", "Selling & Marketing Expense"],
  ["研發費用", "R&D Expense"],
  ["管理費用", "General & Admin Expense"],
  ["營業利益", "Operating Income"],
  ["營業利益率", "Operating Margin"],
  ["淨利", "Net Income"],
  ["淨利率", "Net Margin"],
  ["營運現金流", "Operating Cash Flow"],
  ["投資現金流", "Investing Cash Flow"],
  ["融資現金流", "Financing Cash Flow"],
  ["資本支出", "Capital Expenditure"],
  ["P/E (TTM)", "P/E (TTM)"],
  ["Forward P/E", "Forward P/E"],
  ["P/S (TTM)", "P/S (TTM)"],
  ["P/B", "P/B"],
  ["EV/EBITDA", "EV/EBITDA"],
  ["Revenue", "Revenue"],
  ["Gross Profit", "Gross Profit"],
  ["Gross Margin (%)", "Gross Margin (%)"],
  ["Selling & Marketing Exp", "Selling & Marketing Exp"],
  ["R&D Exp", "R&D Exp"],
  ["General & Admin Exp", "General & Admin Exp"],
  ["Operating Income", "Operating Income"],
  ["Operating Margin (%)", "Operating Margin (%)"],
  ["Net Income", "Net Income"],
  ["Net Margin (%)", "Net Margin (%)"],
  ["Op Cash Flow", "Op Cash Flow"],
  ["Investing Cash Flow", "Investing Cash Flow"],
  ["Financing Cash Flow", "Financing Cash Flow"],
  ["CAPEX", "CAPEX"],
] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildReplacements(language: SupportedLanguage) {
  const basePairs =
    language === "en"
      ? translationPairs
      : translationPairs.map(([zh, en]) => [en, zh] as const);

  return [...basePairs].sort((a, b) => b[0].length - a[0].length);
}

export function translateFinancialMarkdown(
  markdown: string,
  language: SupportedLanguage,
) {
  if (!markdown) {
    return markdown;
  }

  return buildReplacements(language).reduce((output, [from, to]) => {
    return output.replace(new RegExp(escapeRegExp(from), "g"), to);
  }, markdown);
}
