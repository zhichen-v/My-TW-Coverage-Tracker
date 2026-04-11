import Link from "next/link";
import { getCompanyByTicker } from "@/lib/api";

type CompanyPageProps = {
  params: Promise<{
    ticker: string;
  }>;
};

function DetailBlock({ title, body }: { title: string; body: string }) {
  return (
    <section className="panel detail-block">
      <h2>{title}</h2>
      <div className="rich-text">{body || "No data available."}</div>
    </section>
  );
}

export default async function CompanyPage({ params }: CompanyPageProps) {
  const { ticker } = await params;
  const response = await getCompanyByTicker(ticker);
  const primary = response.items[0];

  return (
    <>
      <Link className="back-link" href="/">
        Back to company list
      </Link>

      {response.count > 1 ? (
        <section className="panel content-panel" style={{ marginBottom: 20 }}>
          Multiple reports share ticker {ticker}. This page is showing the first report in sorted order.
        </section>
      ) : null}

      <div className="detail-layout">
        <aside className="panel hero-stats sticky-panel">
          <p className="eyebrow">Company Snapshot</p>
          <div className="detail-header">
            <span className="ticker-chip">{primary.ticker}</span>
            <h1 className="detail-title">{primary.company_name}</h1>
          </div>
          <div className="detail-meta">
            <span>Sector folder: {primary.sector_folder}</span>
            <span>Sector: {primary.metadata_sector || "N/A"}</span>
            <span>Industry: {primary.metadata_industry || "N/A"}</span>
            <span>Market Cap: {primary.market_cap_text || "N/A"}</span>
            <span>Enterprise Value: {primary.enterprise_value_text || "N/A"}</span>
            <span>Wikilinks: {primary.wikilink_count}</span>
            <span>Source path: {primary.report_path}</span>
          </div>
        </aside>

        <main>
          <DetailBlock title="Business Overview" body={primary.overview_text} />
          <DetailBlock title="Supply Chain" body={primary.supply_chain_text} />
          <DetailBlock title="Customers and Suppliers" body={primary.customer_supplier_text} />
          <DetailBlock title="Financial Tables" body={primary.financials_text} />
        </main>
      </div>
    </>
  );
}
