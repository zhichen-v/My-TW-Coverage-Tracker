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

export type GraphNodeType = "theme" | "supplemental_theme" | "wikilink";

export type GraphRelatedTheme = {
  id: string;
  label: string;
  is_theme_page: boolean;
};

export type GraphNode = {
  id: string;
  label: string;
  type: GraphNodeType;
  title?: string;
  note?: string;
  file_name?: string;
  path?: string;
  related_themes?: GraphRelatedTheme[];
  group?: string;
  is_theme_page?: boolean;
  mentioned_by_count?: number;
  outgoing_count?: number;
  degree: number;
  radius_hint: number;
};

export type GraphLink = {
  source: string;
  target: string;
  type: string;
  count: number;
  sections: string[];
  occurrences: Array<{
    line: number;
    section: string;
    text: string;
  }>;
  value: number;
  weight: number;
  source_type: GraphNodeType;
  target_type: GraphNodeType;
  target_is_theme: boolean;
  primary_section: string;
};

export type GraphPayload = {
  generated_at: string;
  source_dir: string;
  graph_kind: string;
  node_counts: {
    total: number;
    themes: number;
    supplemental_themes: number;
    wikilinks: number;
    wikilink_targets: number;
    wikilink_mentions: number;
  };
  nodes: GraphNode[];
  links: GraphLink[];
};

export type GraphCompany = {
  ticker: string;
  company_name: string;
  sector_en: string;
  sector_zh: string;
};

export type GraphCompanyRole = "upstream" | "midstream" | "downstream" | "related";

export type GraphCompanyRoleGroup = {
  label_zh: string;
  label_en: string;
  count: number;
  companies: GraphCompany[];
};

export type GraphCompanyTheme = {
  id: string;
  title: string;
  note: string;
  type: GraphNodeType;
  path: string;
  related_themes: string[];
  company_count: number;
  counts_by_role: Record<GraphCompanyRole, number>;
  companies_by_role: Record<GraphCompanyRole, GraphCompanyRoleGroup>;
  all_companies: GraphCompany[];
};

export type GraphCompanyMapPayload = {
  generated_at: string;
  source_dir: string;
  payload_kind: string;
  theme_count: number;
  themes: GraphCompanyTheme[];
};

export type GraphMeta = {
  database_path: string;
  schema_version: number;
  built_at: string;
  graph_generated_at: string;
  company_map_generated_at: string;
  theme_count: number;
  node_count: number;
  link_count: number;
  unique_company_count: number;
  company_mapping_count: number;
};

export type GraphResponse = {
  graph: GraphPayload;
  company_map: GraphCompanyMapPayload;
  meta: GraphMeta;
};

export type CompaniesResponse = {
  items: CompanyListItem[];
  count: number;
  total_count: number;
  query: string | null;
  sector: string | null;
  sort?: string | null;
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
  sort?: "market_cap_desc";
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
  if (params?.sort) {
    searchParams.set("sort", params.sort);
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

export async function getThemeGraphData(params?: {
  signal?: AbortSignal;
}): Promise<GraphResponse> {
  const response = await fetch(`${getApiBase()}/api/graph`, {
    cache: "no-store",
    signal: params?.signal,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} /api/graph`);
  }

  return response.json() as Promise<GraphResponse>;
}
