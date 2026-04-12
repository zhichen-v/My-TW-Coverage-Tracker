"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CompanyDetail } from "@/lib/api";
import { translateFinancialMarkdown } from "@/lib/financial-markdown";
import { LanguageProvider, useLanguage } from "@/components/language-provider";

type CompanyPageClientProps = {
  primary: CompanyDetail;
  count: number;
  ticker: string;
};

function DetailBlock({
  index,
  title,
  body,
}: {
  index: number;
  title: string;
  body: string;
}) {
  const { t } = useLanguage();

  return (
    <section className="panel detail-block">
      <div className="section-header">
        <span className="section-index">{String(index).padStart(2, "0")}</span>
        <h2>{title}</h2>
      </div>
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
  const snapshotItems = [
    {
      label: t("sector"),
      value: primary.metadata_sector || t("notAvailable"),
    },
    {
      label: t("industry"),
      value: primary.metadata_industry || t("notAvailable"),
    },
    {
      label: t("marketCap"),
      value: primary.market_cap_text || t("notAvailable"),
    },
    {
      label: t("enterpriseValue"),
      value: primary.enterprise_value_text || t("notAvailable"),
    },
  ];
  const sections = [
    {
      title: t("businessOverview"),
      body: primary.overview_text,
    },
    {
      title: t("supplyChain"),
      body: primary.supply_chain_text,
    },
    {
      title: t("customersAndSuppliers"),
      body: primary.customer_supplier_text,
    },
    {
      title: t("financialTables"),
      body: translateFinancialMarkdown(primary.financials_text, language),
    },
  ];

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
        <aside className="panel detail-sidebar sticky-panel">
          <div className="panel-header">
            <p className="eyebrow">{t("companySnapshot")}</p>
          </div>
          <div className="detail-header">
            <span className="ticker-chip">{primary.ticker}</span>
            <h1 className="detail-title">{primary.company_name}</h1>
          </div>
          <div className="detail-meta">
            {snapshotItems.map((item) => (
              <div className="meta-row" key={item.label}>
                <span className="meta-label">{item.label}</span>
                <span className="meta-value">{item.value}</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="detail-main">
          {sections.map((section, index) => (
            <DetailBlock
              key={section.title}
              index={index + 1}
              title={section.title}
              body={section.body}
            />
          ))}
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
