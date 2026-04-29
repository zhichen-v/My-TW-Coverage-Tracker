import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as d3 from "d3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, "../src/data/homepage-company-cloud-nodes.json");
const apiBase =
  process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://127.0.0.1:8000";
const limit = Number.parseInt(process.env.HOMEPAGE_COMPANY_CLOUD_LIMIT || "100", 10);
const viewBoxSize = 1000;
const nodeColors = [
  "#faff69",
  "#f4f692",
  "#a7f3d0",
  "#86efac",
  "#6ee7b7",
  "#166534",
  "#c4d600",
  "#d9d9d9",
];

function cleanInlineText(value) {
  return String(value || "")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#+\s*/, "")
    .trim();
}

function cleanReportTitle(value, fallbackTicker) {
  return cleanInlineText(value)
    .replace(new RegExp(`^${fallbackTicker}\\s*[-:]\\s*`), "")
    .trim();
}

function truncateLabel(value, maxLength) {
  const characters = Array.from(String(value || "").trim());
  if (characters.length <= maxLength) {
    return characters.join("");
  }

  return `${characters.slice(0, Math.max(1, maxLength - 2)).join("")}..`;
}

function round(value) {
  return Number(value.toFixed(2));
}

async function main() {
  const endpoint = new URL("/api/companies", apiBase);
  endpoint.searchParams.set("sort", "market_cap_desc");
  endpoint.searchParams.set("limit", String(limit));
  endpoint.searchParams.set("offset", "0");

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${endpoint.toString()}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    throw new Error("API returned no companies for homepage company cloud data.");
  }

  const companies = items.slice(0, limit).map((item, index) => {
    const ticker = String(item.ticker || "").trim();
    const companyName = cleanInlineText(item.company_name);
    const reportTitle = cleanReportTitle(item.title, ticker);
    const title = companyName || reportTitle || ticker;

    return {
      rank: index + 1,
      ticker,
      title,
      companyName: companyName || reportTitle || title,
      sector: String(item.sector_folder || item.metadata_sector || "Other").trim() || "Other",
      marketCapText: String(item.market_cap_text || "").trim(),
      reportId: String(item.report_id || "").trim(),
    };
  });

  const sectors = Array.from(new Set(companies.map((company) => company.sector)));
  const sectorColor = d3.scaleOrdinal(sectors, nodeColors);
  const root = d3
    .hierarchy({
      id: "root",
      children: companies.map((company) => ({
        id: company.ticker,
        company,
      })),
    })
    .sum((item) => {
      if (!item.company) {
        return 0;
      }

      return Math.max(16, 118 - item.company.rank);
    })
    .sort((left, right) => (right.value || 0) - (left.value || 0));

  const packedRoot = d3
    .pack()
    .size([viewBoxSize, viewBoxSize])
    .padding((node) => (node.depth === 0 ? 16 : 5))(root);

  const nodes = packedRoot.leaves().map((leaf) => {
    const company = leaf.data.company;
    const showTitle = leaf.r >= 28;
    const titleLabel = truncateLabel(company.title, leaf.r >= 42 ? 7 : 5);
    const tickerFontSize = Math.max(11, Math.min(30, leaf.r * 0.42));
    const titleFontSize = Math.max(8, Math.min(16, leaf.r * 0.2));

    return {
      ...company,
      x: round(leaf.x),
      y: round(leaf.y),
      r: round(leaf.r),
      color: sectorColor(company.sector),
      fillOpacity: round(company.rank <= 12 ? 0.24 : 0.16),
      strokeOpacity: round(company.rank <= 12 ? 0.86 : 0.56),
      tickerFontSize: round(tickerFontSize),
      titleFontSize: round(titleFontSize),
      titleLabel,
      showTitle,
    };
  });

  const output = {
    generatedAt: new Date().toISOString(),
    source: `${endpoint.pathname}${endpoint.search}`,
    layout: {
      type: "static-circle-pack",
      viewBoxSize,
      boundary: {
        cx: viewBoxSize / 2,
        cy: viewBoxSize / 2,
        r: round(packedRoot.r),
      },
    },
    count: nodes.length,
    nodes,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${nodes.length} homepage company cloud nodes to ${path.relative(
      process.cwd(),
      outputPath,
    )}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
