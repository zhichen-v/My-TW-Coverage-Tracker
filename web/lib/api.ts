export type Sector = {
  name: string;
  company_count: number;
};

export type CompanyListItem = {
  report_id: string;
  ticker: string;
  company_name: string;
  title: string;
  sector_folder: string;
  metadata_sector: string;
  metadata_industry: string;
  market_cap_text: string;
  enterprise_value_text: string;
  wikilink_count: number;
  report_path: string;
  structured_summary?: StructuredSummary | null;
  structured_report_path?: string;
};

export type StructuredSummary = {
  overview_excerpt: string;
  supply_chain_groups: string[];
  customer_supplier_groups: string[];
  financial_groups: string[];
  top_wikilinks: string[];
};

export type StructuredInlineSegment = {
  type: "text" | "strong" | "wikilink";
  text: string;
};

export type StructuredListItem = {
  segments: StructuredInlineSegment[];
};

export type StructuredContentBlock = {
  type: "paragraph" | "list" | "table";
  segments?: StructuredInlineSegment[];
  items?: StructuredListItem[];
  columns?: string[];
  rows?: string[][];
};

export type StructuredContentGroup = {
  title: string;
  blocks: StructuredContentBlock[];
};

export type StructuredContentSection = {
  heading: string;
  blocks: StructuredContentBlock[];
  groups: StructuredContentGroup[];
};

export type StructuredReport = {
  report_id: string;
  source_path: string;
  json_path: string;
  ticker: string;
  company_name: string;
  title: string;
  sector_folder: string;
  metadata: {
    items: Array<{
      label: string;
      value: string;
    }>;
  };
  sections: {
    overview: StructuredContentSection;
    supply_chain: StructuredContentSection;
    customer_supplier: StructuredContentSection;
    financials: StructuredContentSection;
  };
  wikilinks: string[];
};

export type CompanyDetail = CompanyListItem & {
  structured_content?: StructuredReport | null;
};

export type CompanyTickerResponse = {
  items: CompanyDetail[];
  count: number;
  ticker: string;
};

export type CompaniesResponse = {
  items: CompanyListItem[];
  count: number;
  total_count: number;
  query: string | null;
  sector: string | null;
  limit: number;
  offset: number;
};

const DEFAULT_API_BASE = "http://127.0.0.1:8000";

function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    next: { revalidate: 60 },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${path}`);
  }

  return response.json() as Promise<T>;
}

export async function getSectors(): Promise<Sector[]> {
  const data = await fetchJson<{ items: Sector[] }>("/api/sectors");
  return data.items;
}

export async function getCompanies(params?: {
  q?: string;
  sector?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}): Promise<CompaniesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.q) {
    searchParams.set("q", params.q);
  }
  if (params?.sector) {
    searchParams.set("sector", params.sector);
  }
  searchParams.set("limit", String(params?.limit ?? 60));
  searchParams.set("offset", String(params?.offset ?? 0));

  return fetchJson<CompaniesResponse>(`/api/companies?${searchParams.toString()}`, {
    signal: params?.signal,
  });
}

export async function getCompanyByTicker(ticker: string): Promise<CompanyTickerResponse> {
  const response = await fetch(`${getApiBase()}/api/companies/${encodeURIComponent(ticker)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} /api/companies/${ticker}`);
  }

  return response.json() as Promise<CompanyTickerResponse>;
}

export async function getHealth() {
  return fetchJson<{
    status: string;
    latest_import?: {
      imported_at: string;
      company_count: number;
      wikilink_count: number;
    } | null;
  }>("/health");
}
