"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import Link from "next/link";
import { getCompanies, type CompaniesResponse, type Sector } from "@/lib/api";
import { useLanguage } from "@/components/language-provider";
import { translateFinancialText } from "@/lib/financial-markdown";
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
  initialPage: number;
};

const PAGE_SIZE = 30;

function buildPaginationItems(currentPage: number, totalPages: number) {
  const pages = new Set<number>([1, 2, 3, currentPage - 1, currentPage, currentPage + 1, totalPages]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);

  const items: Array<number | "ellipsis"> = [];

  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1];
    if (previousPage && page - previousPage > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  });

  return items;
}

function HomePageContent({
  health,
  sectors,
  companies,
  initialQuery,
  initialSector,
  initialPage,
}: HomePageClientProps) {
  const { t, language, switchLanguage } = useLanguage();
  const toolbarRef = useRef<HTMLFormElement | null>(null);
  const pendingPageScroll = useRef(false);
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [sectorInput, setSectorInput] = useState(initialSector);
  const [appliedQuery, setAppliedQuery] = useState(initialQuery);
  const [appliedSector, setAppliedSector] = useState(initialSector);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [companyData, setCompanyData] = useState(companies);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const initialRequestKey = useRef(`${initialQuery}::${initialSector}::${initialPage}`);
  const featuredSectors = sectors.slice(0, 4);
  const remainingSectorCount = Math.max(sectors.length - featuredSectors.length, 0);
  const totalPages = Math.max(Math.ceil(companyData.total_count / PAGE_SIZE), 1);
  const paginationItems = buildPaginationItems(currentPage, totalPages);
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

  function getCompanySubline(company: CompaniesResponse["items"][number]) {
    const sectorLabel = translateSectorName(language, company.sector_folder);
    const industryLabel = translateSectorName(language, company.metadata_industry);
    const normalizedSector = company.sector_folder.trim().toLowerCase();
    const normalizedIndustry = company.metadata_industry.trim().toLowerCase();

    if (!industryLabel || normalizedSector === normalizedIndustry) {
      return [sectorLabel];
    }

    return [sectorLabel, industryLabel];
  }

  useEffect(() => {
    const requestKey = `${appliedQuery}::${appliedSector}::${currentPage}`;
    if (initialRequestKey.current === requestKey) {
      initialRequestKey.current = "";
      return;
    }

    const controller = new AbortController();

    async function refreshCompanies() {
      setIsLoadingCompanies(true);
      try {
        const nextCompanies = await getCompanies({
          q: appliedQuery || undefined,
          sector: appliedSector || undefined,
          limit: PAGE_SIZE,
          offset: (currentPage - 1) * PAGE_SIZE,
          signal: controller.signal,
        });
        setCompanyData(nextCompanies);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Failed to refresh homepage companies", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingCompanies(false);
        }
      }
    }

    void refreshCompanies();

    return () => controller.abort();
  }, [appliedQuery, appliedSector, currentPage]);

  useEffect(() => {
    const searchParams = new URLSearchParams();
    if (appliedQuery) {
      searchParams.set("q", appliedQuery);
    }
    if (appliedSector) {
      searchParams.set("sector", appliedSector);
    }
    if (currentPage > 1) {
      searchParams.set("page", String(currentPage));
    }
    const queryString = searchParams.toString();
    const nextUrl = queryString ? `/?${queryString}` : "/";
    window.history.replaceState(null, "", nextUrl);
  }, [appliedQuery, appliedSector, currentPage]);

  useEffect(() => {
    if (initialRequestKey.current !== "" || !pendingPageScroll.current || isLoadingCompanies) {
      return;
    }
    pendingPageScroll.current = false;
    toolbarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [companyData, isLoadingCompanies]);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = queryInput.trim();
    setAppliedQuery(nextQuery);
    setAppliedSector(sectorInput);
    setCurrentPage(1);
  }

  function handlePageChange(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === currentPage) {
      return;
    }
    pendingPageScroll.current = true;
    setCurrentPage(nextPage);
  }

  function handlePaginationClick(
    event: MouseEvent<HTMLButtonElement>,
    nextPage: number,
  ) {
    event.currentTarget.blur();
    handlePageChange(nextPage);
  }

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
        <form ref={toolbarRef} className="toolbar" onSubmit={handleFilterSubmit}>
          <input
            className="search-input"
            type="search"
            name="q"
            placeholder={t("searchPlaceholder")}
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
          />
          <select
            className="select-input"
            name="sector"
            value={sectorInput}
            onChange={(event) => setSectorInput(event.target.value)}
          >
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

        {companyData.items.length === 0 ? (
          <div className="empty-state">{t("noCompaniesMatched")}</div>
        ) : (
          <>
            <div
              className={`company-list ${isLoadingCompanies ? "is-loading" : ""}`}
              aria-busy={isLoadingCompanies}
            >
              {companyData.items.map((company) => (
                <Link
                  key={company.report_id}
                  href={`/companies/${encodeURIComponent(company.ticker)}`}
                  prefetch={false}
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
                      {translateFinancialText(company.market_cap_text, language) ||
                        t("notAvailable")}
                    </span>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-label">{t("enterpriseValue")}</span>
                    <span className="metric-value">
                      {translateFinancialText(company.enterprise_value_text, language) ||
                        t("notAvailable")}
                    </span>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-label">{t("wikilinks")}</span>
                    <span className="metric-value">{company.wikilink_count}</span>
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 ? (
              <nav className="pagination-row" aria-label="Company list pages">
                <button
                  type="button"
                  className="pagination-button"
                  onClick={(event) => handlePaginationClick(event, currentPage - 1)}
                  disabled={currentPage === 1 || isLoadingCompanies}
                >
                  {"<"}
                </button>
                {paginationItems.map((item, index) =>
                  item === "ellipsis" ? (
                    <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      className={`pagination-button ${item === currentPage ? "active" : ""}`}
                      onClick={(event) => handlePaginationClick(event, item)}
                      disabled={isLoadingCompanies}
                      aria-current={item === currentPage ? "page" : undefined}
                    >
                      {item}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="pagination-button"
                  onClick={(event) => handlePaginationClick(event, currentPage + 1)}
                  disabled={currentPage === totalPages || isLoadingCompanies}
                >
                  {">"}
                </button>
              </nav>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

export function HomePageClient(props: HomePageClientProps) {
  return <HomePageContent {...props} />;
}
