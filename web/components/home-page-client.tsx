"use client";

import Link from "next/link";
import type { CompaniesResponse, Sector } from "@/lib/api";
import { LanguageProvider, useLanguage } from "@/components/language-provider";
import { translateSectorName } from "@/lib/i18n";

type HealthSnapshot = {
  status: string;
  latest_import?: {
    imported_at: string;
    company_count: number;
    wikilink_count: number;
  } | null;
};

type HomePageClientProps = {
  health: HealthSnapshot;
  sectors: Sector[];
  companies: CompaniesResponse;
  initialQuery: string;
  initialSector: string;
};

function HomePageContent({
  health,
  sectors,
  companies,
  initialQuery,
  initialSector,
}: HomePageClientProps) {
  const { t, language, switchLanguage } = useLanguage();
  const featuredSectors = sectors.slice(0, 4);
  const remainingSectorCount = Math.max(sectors.length - featuredSectors.length, 0);
  const stats = [
    {
      label: t("apiStatus"),
      value: health.status,
    },
    {
      label: t("companies"),
      value: String(health.latest_import?.company_count ?? "N/A"),
    },
    {
      label: t("wikilinks"),
      value: String(health.latest_import?.wikilink_count ?? "N/A"),
    },
    {
      label: t("topSector"),
      value: featuredSectors[0]
        ? translateSectorName(language, featuredSectors[0].name)
        : "N/A",
    },
  ];

  return (
    <>
      <div className="page-actions home-actions">
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

      <section className="hero">
        <div className="panel hero-copy">
          <div className="panel-header">
            <p className="eyebrow">{t("homeEyebrow")}</p>
          </div>
          <h1 className="hero-title">{t("homeTitle")}</h1>
          <p className="hero-desc">{t("homeDescription")}</p>
          <div className="hero-tags" aria-hidden="true">
            {featuredSectors.map((sector) => (
              <span key={sector.name} className="terminal-tag">
                {translateSectorName(language, sector.name)}
              </span>
            ))}
            {remainingSectorCount > 0 ? (
              <span className="terminal-tag">{`${remainingSectorCount} more...`}</span>
            ) : null}
          </div>
        </div>
        <div className="panel hero-stats">
          <div className="panel-header">
            <p className="eyebrow">{t("snapshot")}</p>
          </div>
          <div className="stat-list">
            {stats.map((stat) => (
              <div className="stat-row" key={stat.label}>
                <span className="stat-label">{stat.label}</span>
                <span className="stat-value">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="content-panel">
        <form className="toolbar" action="/" method="get">
          <input
            className="search-input"
            type="search"
            name="q"
            placeholder={t("searchPlaceholder")}
            defaultValue={initialQuery}
          />
          <select className="select-input" name="sector" defaultValue={initialSector}>
            <option value="">{t("allSectors")}</option>
            {sectors.map((sector) => (
              <option key={sector.name} value={sector.name}>
                {translateSectorName(language, sector.name)} ({sector.company_count})
              </option>
            ))}
          </select>
          <button className="action-button" type="submit">
            {t("applyFilters")}
          </button>
        </form>

        {companies.items.length === 0 ? (
          <div className="empty-state">{t("noCompaniesMatched")}</div>
        ) : (
          <div className="company-list">
            {companies.items.map((company) => (
              <Link
                key={company.report_id}
                href={`/companies/${encodeURIComponent(company.ticker)}`}
                className="company-row"
              >
                <div className="company-primary">
                  <span className="ticker-chip">{company.ticker}</span>
                  <div className="company-title-stack">
                    <h2 className="company-name">{company.company_name}</h2>
                  </div>
                </div>
                <div className="metric-cell">
                  <span className="metric-label">{t("sector")}</span>
                  <span className="metric-value">
                    {translateSectorName(language, company.sector_folder)}
                  </span>
                </div>
                <div className="metric-cell">
                  <span className="metric-label">{t("marketCap")}</span>
                  <span className="metric-value">
                    {company.market_cap_text || t("notAvailable")}
                  </span>
                </div>
                <div className="metric-cell">
                  <span className="metric-label">{t("enterpriseValue")}</span>
                  <span className="metric-value">
                    {company.enterprise_value_text || t("notAvailable")}
                  </span>
                </div>
                <div className="metric-cell">
                  <span className="metric-label">{t("wikilinks")}</span>
                  <span className="metric-value">{company.wikilink_count}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function HomePageClient(props: HomePageClientProps) {
  return (
    <LanguageProvider>
      <HomePageContent {...props} />
    </LanguageProvider>
  );
}
