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
};

export type CompanyDetail = CompanyListItem & {
  overview_text: string;
  supply_chain_text: string;
  customer_supplier_text: string;
  financials_text: string;
};

export type CompanyTickerResponse = {
  items: CompanyDetail[];
  count: number;
  ticker: string;
};

export type CompaniesResponse = {
  items: CompanyListItem[];
  count: number;
  query: string | null;
  sector: string | null;
};

const DEFAULT_API_BASE = "http://127.0.0.1:8000";

function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    next: { revalidate: 60 },
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
}): Promise<CompaniesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.q) {
    searchParams.set("q", params.q);
  }
  if (params?.sector) {
    searchParams.set("sector", params.sector);
  }
  searchParams.set("limit", String(params?.limit ?? 60));

  return fetchJson<CompaniesResponse>(`/api/companies?${searchParams.toString()}`);
}

export async function getCompanyByTicker(ticker: string): Promise<CompanyTickerResponse> {
  return fetchJson<CompanyTickerResponse>(`/api/companies/${encodeURIComponent(ticker)}`);
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
