"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CompanyDetail } from "@/lib/api";
import { translateFinancialMarkdown } from "@/lib/financial-markdown";
import { LanguageProvider, useLanguage } from "@/components/language-provider";
import type { SupportedLanguage } from "@/lib/i18n";

type CompanyPageClientProps = {
  primary: CompanyDetail;
  count: number;
  ticker: string;
};

function DetailBlock({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  const { t } = useLanguage();

  return (
    <section className="panel detail-block">
      <h2>{title}</h2>
      <div className="rich-text markdown-body">
        {body ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        ) : (
          t("noData")
        )}
      </div>
    </section>
  );
}

function CompanyPageContent({ primary, count, ticker }: CompanyPageClientProps) {
  const { t, language, switchLanguage } = useLanguage();

  return (
    <>
      <div className="page-actions">
        <Link className="back-link" href="/">
          {t("backToList")}
        </Link>

        <div className="language-switcher" aria-label={t("language")}>
          <button
            type="button"
            className={`language-button ${language === "zh-Hant" ? "active" : ""}`}
            onClick={() => switchLanguage("zh-Hant")}
          >
            {t("chinese")}
          </button>
          <button
            type="button"
            className={`language-button ${language === "en" ? "active" : ""}`}
            onClick={() => switchLanguage("en")}
          >
            {t("english")}
          </button>
        </div>
      </div>

      {count > 1 ? (
        <section className="panel content-panel" style={{ marginBottom: 20 }}>
          {t("multipleReports")} ({ticker})
        </section>
      ) : null}

      <div className="detail-layout">
        <aside className="panel hero-stats sticky-panel">
          <p className="eyebrow">{t("companySnapshot")}</p>
          <div className="detail-header">
            <span className="ticker-chip">{primary.ticker}</span>
            <h1 className="detail-title">{primary.company_name}</h1>
          </div>
          <div className="detail-meta">
            {/* <span>
              {t("sectorFolder")}: {primary.sector_folder}
            </span> */}
            <span>
              {t("sector")}: {primary.metadata_sector || t("notAvailable")}
            </span>
            <span>
              {t("industry")}: {primary.metadata_industry || t("notAvailable")}
            </span>
            <span>
              {t("marketCap")}: {primary.market_cap_text || t("notAvailable")}
            </span>
            <span>
              {t("enterpriseValue")}:{" "}
              {primary.enterprise_value_text || t("notAvailable")}
            </span>
            <span>
              {t("wikilinks")}: {primary.wikilink_count}
            </span>
            {/* <span>
              {t("sourcePath")}: {primary.report_path}
            </span> */}
          </div>
        </aside>

        <main>
          <DetailBlock title={t("businessOverview")} body={primary.overview_text} />
          <DetailBlock title={t("supplyChain")} body={primary.supply_chain_text} />
          <DetailBlock
            title={t("customersAndSuppliers")}
            body={primary.customer_supplier_text}
          />
          <DetailBlock
            title={t("financialTables")}
            body={translateFinancialMarkdown(primary.financials_text, language)}
          />
        </main>
      </div>
    </>
  );
}

export function CompanyPageClient(props: CompanyPageClientProps) {
  return (
    <LanguageProvider>
      <CompanyPageContent {...props} />
    </LanguageProvider>
  );
}
