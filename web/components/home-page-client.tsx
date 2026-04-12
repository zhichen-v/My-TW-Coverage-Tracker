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

  return (
    <>
      <div className="page-actions home-actions">
        <div />
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
          <p className="eyebrow">{t("homeEyebrow")}</p>
          <h1 className="hero-title">{t("homeTitle")}</h1>
          <p className="hero-desc">{t("homeDescription")}</p>
        </div>
        <div className="panel hero-stats">
          <p className="eyebrow">{t("snapshot")}</p>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">{t("apiStatus")}</span>
              <span className="stat-value">{health.status}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t("companies")}</span>
              <span className="stat-value">{health.latest_import?.company_count ?? "N/A"}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t("wikilinks")}</span>
              <span className="stat-value">{health.latest_import?.wikilink_count ?? "N/A"}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t("topSector")}</span>
              <span className="stat-value">
                {featuredSectors[0] ? translateSectorName(language, featuredSectors[0].name) : "N/A"}
              </span>
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
          <button className="select-input" type="submit">
            {t("applyFilters")}
          </button>
        </form>

        {companies.items.length === 0 ? (
          <div className="empty-state">{t("noCompaniesMatched")}</div>
        ) : (
          <div className="company-grid">
            {companies.items.map((company) => (
              <Link
                key={company.report_id}
                href={`/companies/${encodeURIComponent(company.ticker)}`}
                className="company-card"
              >
                <div className="company-head">
                  <div>
                    <h2 className="company-name">{company.company_name}</h2>
                    <div className="company-meta">
                      <span>{translateSectorName(language, company.sector_folder)}</span>
                    </div>
                  </div>
                  <span className="ticker-chip">{company.ticker}</span>
                </div>
                <div className="company-meta">
                  <span>
                    {t("marketCap")}: {company.market_cap_text || t("notAvailable")}
                  </span>
                  <span>
                    {t("enterpriseValue")}:{" "}
                    {company.enterprise_value_text || t("notAvailable")}
                  </span>
                  <span>
                    {t("wikilinks")}: {company.wikilink_count}
                  </span>
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
