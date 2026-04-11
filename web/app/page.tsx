import Link from "next/link";
import { getCompanies, getHealth, getSectors } from "@/lib/api";

type HomeProps = {
  searchParams?: Promise<{
    q?: string;
    sector?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const [health, sectors, companies] = await Promise.all([
    getHealth(),
    getSectors(),
    getCompanies({
      q: resolvedSearchParams.q,
      sector: resolvedSearchParams.sector,
      limit: 60,
    }),
  ]);

  const featuredSectors = sectors.slice(0, 4);

  return (
    <>
      <section className="hero">
        <div className="panel hero-copy">
          <p className="eyebrow">Coverage Database</p>
          <h1 className="hero-title">Explore Taiwan-listed company research without opening raw markdown.</h1>
          <p className="hero-desc">
            This frontend reads from the repo-built API layer and focuses on public browsing:
            ticker lookup, sector filtering, and direct access to enriched supply chain coverage.
          </p>
        </div>
        <div className="panel hero-stats">
          <p className="eyebrow">Snapshot</p>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">API status</span>
              <span className="stat-value">{health.status}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Companies</span>
              <span className="stat-value">{health.latest_import?.company_count ?? "N/A"}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Wikilinks</span>
              <span className="stat-value">{health.latest_import?.wikilink_count ?? "N/A"}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Top sector</span>
              <span className="stat-value">{featuredSectors[0]?.name ?? "N/A"}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel content-panel">
        <form className="toolbar" action="/" method="get">
          <input
            className="search-input"
            type="search"
            name="q"
            placeholder="Search by ticker, company name, sector, or key terms"
            defaultValue={resolvedSearchParams.q ?? ""}
          />
          <select
            className="select-input"
            name="sector"
            defaultValue={resolvedSearchParams.sector ?? ""}
          >
            <option value="">All sectors</option>
            {sectors.map((sector) => (
              <option key={sector.name} value={sector.name}>
                {sector.name} ({sector.company_count})
              </option>
            ))}
          </select>
          <button className="select-input" type="submit">
            Apply filters
          </button>
        </form>

        {companies.items.length === 0 ? (
          <div className="empty-state">No companies matched the current filters.</div>
        ) : (
          <div className="company-grid">
            {companies.items.map((company) => (
              <Link
                key={`${company.report_id}`}
                href={`/companies/${encodeURIComponent(company.ticker)}`}
                className="company-card"
              >
                <div className="company-head">
                  <div>
                    <h2 className="company-name">{company.company_name}</h2>
                    <div className="company-meta">
                      <span>{company.sector_folder}</span>
                      <span>{company.metadata_industry || company.metadata_sector}</span>
                    </div>
                  </div>
                  <span className="ticker-chip">{company.ticker}</span>
                </div>
                <div className="company-meta">
                  <span>Market Cap: {company.market_cap_text || "N/A"}</span>
                  <span>Enterprise Value: {company.enterprise_value_text || "N/A"}</span>
                  <span>Wikilinks: {company.wikilink_count}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
