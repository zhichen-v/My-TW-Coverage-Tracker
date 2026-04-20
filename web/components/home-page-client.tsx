"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import Link from "next/link";
import { getCompanies, type CompaniesResponse, type Sector } from "@/lib/api";
import { useLanguage } from "@/components/language-provider";
import { translateFinancialText } from "@/lib/financial-markdown";
import { translateSectorName } from "@/lib/i18n";
import { ShellHeader } from "@/components/shell-header";
import { DotsSpinner } from "@/src/spinners/dots";

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
const panelStyle = { boxShadow: "var(--shadow-soft)" } as const;
const rowStyle = { boxShadow: "var(--shadow-soft)" } as const;

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
  const { t, language } = useLanguage();
  const toolbarRef = useRef<HTMLFormElement | null>(null);
  const pendingPageScroll = useRef(false);
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [sectorInput, setSectorInput] = useState(initialSector);
  const [appliedQuery, setAppliedQuery] = useState(initialQuery);
  const [appliedSector, setAppliedSector] = useState(initialSector);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [companyData, setCompanyData] = useState(companies);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const [pendingInputReset, setPendingInputReset] = useState(false);
  const pendingFilterRequestPhase = useRef<"idle" | "awaiting-load" | "loading">("idle");
  const pendingSpinnerStopTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    if (pendingFilterRequestPhase.current === "awaiting-load" && isLoadingCompanies) {
      if (pendingSpinnerStopTimeout.current) {
        clearTimeout(pendingSpinnerStopTimeout.current);
        pendingSpinnerStopTimeout.current = null;
      }
      pendingFilterRequestPhase.current = "loading";
      return;
    }

    if (pendingFilterRequestPhase.current === "loading" && !isLoadingCompanies) {
      pendingFilterRequestPhase.current = "idle";
      pendingSpinnerStopTimeout.current = setTimeout(() => {
        setIsFilterLoading(false);
        if (pendingInputReset) {
          setQueryInput("");
          setSectorInput("");
          setPendingInputReset(false);
        }
        pendingSpinnerStopTimeout.current = null;
      }, 1000);
    }
  }, [isLoadingCompanies, pendingInputReset]);

  useEffect(() => {
    return () => {
      if (pendingSpinnerStopTimeout.current) {
        clearTimeout(pendingSpinnerStopTimeout.current);
      }
    };
  }, []);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = queryInput.trim();
    const nextSector = sectorInput;
    const requestChanged =
      nextQuery !== appliedQuery || nextSector !== appliedSector || currentPage !== 1;

    setAppliedQuery(nextQuery);
    setAppliedSector(nextSector);
    setCurrentPage(1);

    if (!requestChanged) {
      setQueryInput("");
      setSectorInput("");
      return;
    }

    pendingFilterRequestPhase.current = "awaiting-load";
    if (pendingSpinnerStopTimeout.current) {
      clearTimeout(pendingSpinnerStopTimeout.current);
      pendingSpinnerStopTimeout.current = null;
    }
    setIsFilterLoading(true);
    setPendingInputReset(true);
  }

  function handlePageChange(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === currentPage) {
      return;
    }
    pendingPageScroll.current = true;
    setCurrentPage(nextPage);
  }

  function handlePaginationClick(event: MouseEvent<HTMLButtonElement>, nextPage: number) {
    event.currentTarget.blur();
    handlePageChange(nextPage);
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <ShellHeader />

      <section className="grid gap-4 md:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)] md:gap-[18px]">
        <div
          className="rounded-[28px] border border-[var(--line)] bg-[var(--surface)] px-5 py-6 sm:px-6 sm:py-7"
          style={panelStyle}
        >
          <div className="flex h-full flex-col justify-between gap-6">
            <div>
              <p className="mb-4 text-[0.78rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                {t("homeEyebrow")}
              </p>
              <h1
                className="max-w-[11ch] text-[2.9rem] font-black leading-[0.92] tracking-[-0.06em] text-[var(--text-strong)] sm:text-[4rem] lg:text-[5.3rem]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {t("homeTitle")}
              </h1>
              <p className="mt-4 max-w-[54ch] text-sm leading-7 text-[var(--muted-strong)] sm:text-base">
                {t("homeDescription")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5" aria-hidden="true">
              {featuredSectors.map((sector) => (
                <span
                  key={sector.name}
                  className="inline-flex items-center rounded-full border border-[var(--line-strong)] bg-[rgba(22,22,0,0.55)] px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[var(--accent-strong)]"
                >
                  {translateSectorName(language, sector.name)}
                </span>
              ))}
              {remainingSectorCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[var(--muted-strong)]">
                  + {remainingSectorCount}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div
          className="hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-6 md:block"
          style={panelStyle}
        >
          <p className="mb-4 text-[0.78rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            {t("snapshot")}
          </p>
          <div className="grid gap-2.5">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="grid grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-3"
              >
                <span className="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {stat.label}
                </span>
                <span className="text-sm font-semibold leading-6 text-[var(--text-strong)]">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <form ref={toolbarRef} onSubmit={handleFilterSubmit} className="p-0">
          <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1.45fr)_minmax(15rem,0.72fr)_auto] md:items-center">
            <div>
              <input
                type="search"
                name="q"
                aria-label={t("searchPlaceholder")}
                placeholder={t("searchPlaceholder")}
                value={queryInput}
                disabled={isFilterLoading}
                onChange={(event) => setQueryInput(event.target.value)}
                className="min-h-[52px] w-full rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] px-4 text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] disabled:cursor-wait disabled:opacity-80"
              />
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 md:contents">
              <select
                name="sector"
                aria-label={t("allSectors")}
                value={sectorInput}
                disabled={isFilterLoading}
                onChange={(event) => setSectorInput(event.target.value)}
                className="min-h-[52px] w-full rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] px-4 text-[var(--text)] outline-none focus:border-[var(--accent)] disabled:cursor-wait disabled:opacity-80"
              >
                <option value="">{t("allSectors")}</option>
                {sectors.map((sector) => (
                  <option key={sector.name} value={sector.name}>
                    {translateSectorName(language, sector.name)} ({sector.company_count})
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={isFilterLoading}
                className="inline-flex min-h-[52px] min-w-[12.5rem] items-center justify-center rounded-2xl border border-[var(--accent)] bg-[var(--accent)] px-5 text-[0.82rem] font-extrabold uppercase tracking-[0.12em] text-[#151515] transition hover:bg-[var(--surface-active)] hover:text-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-80"
              >
                {isFilterLoading ? (
                  <DotsSpinner
                    active
                    size={20}
                    color="#151515"
                    className="search-dots-spinner is-active"
                  />
                ) : (
                  <span>{t("applyFilters")}</span>
                )}
              </button>
            </div>
          </div>
        </form>

        {companyData.items.length === 0 ? (
          <div
            className="rounded-[24px] border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-6 text-[var(--muted-strong)]"
            style={panelStyle}
          >
            {t("noCompaniesMatched")}
          </div>
        ) : (
          <>
            <div
              className={`flex flex-col gap-3 ${
                isFilterLoading || isLoadingCompanies ? "opacity-80" : ""
              }`}
              aria-busy={isLoadingCompanies}
            >
              {companyData.items.map((company) => {
                const marketCap =
                  translateFinancialText(company.market_cap_text, language) || t("notAvailable");
                const enterpriseValue =
                  translateFinancialText(company.enterprise_value_text, language) || t("notAvailable");

                return (
                  <Link
                    key={company.report_id}
                    href={`/companies/${encodeURIComponent(company.ticker)}`}
                    prefetch={false}
                    className="group rounded-[24px] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 transition duration-150 hover:translate-x-[6px] hover:border-[var(--accent)] sm:px-5"
                    style={rowStyle}
                  >
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 md:hidden">
                      <span className="inline-flex items-center rounded-full border border-[var(--line-strong)] bg-[rgba(22,22,0,0.55)] px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-[var(--accent-strong)]">
                        {company.ticker}
                      </span>
                      <div className="min-w-0">
                        <h2
                          className="text-[0.98rem] font-extrabold leading-5 tracking-[-0.03em] text-[var(--text-strong)]"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {company.company_name}
                        </h2>
                      </div>
                      <div className="min-w-0 text-right">
                        <span className="block whitespace-nowrap font-mono text-[0.82rem] font-semibold text-[var(--accent-strong)]">
                          {marketCap}
                        </span>
                      </div>
                    </div>

                    <div className="hidden grid-cols-[minmax(18rem,1.15fr)_repeat(4,minmax(0,0.8fr))] gap-4 md:grid md:items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-4">
                          <span className="inline-flex items-center rounded-full border border-[var(--line-strong)] bg-[rgba(22,22,0,0.55)] px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[var(--accent-strong)]">
                            {company.ticker}
                          </span>
                          <div className="min-w-0">
                            <h2
                              className="text-[1.28rem] font-extrabold leading-[1.1] tracking-[-0.05em] text-[var(--text-strong)]"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              {company.company_name}
                            </h2>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2 py-1">
                        <span className="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                          {t("sector")}
                        </span>
                        <span className="text-sm font-semibold leading-6 text-[var(--text-strong)]">
                          {translateSectorName(language, company.sector_folder)}
                        </span>
                      </div>

                      <div className="grid gap-2 py-1">
                        <span className="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                          {t("marketCap")}
                        </span>
                        <span className="text-sm font-semibold leading-6 text-[var(--text-strong)]">
                          {marketCap}
                        </span>
                      </div>

                      <div className="grid gap-2 py-1">
                        <span className="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                          {t("enterpriseValue")}
                        </span>
                        <span className="text-sm font-semibold leading-6 text-[var(--text-strong)]">
                          {enterpriseValue}
                        </span>
                      </div>

                      <div className="grid gap-2 py-1">
                        <span className="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                          {t("wikilinks")}
                        </span>
                        <span className="text-sm font-semibold leading-6 text-[var(--text-strong)]">
                          {company.wikilink_count}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {totalPages > 1 ? (
              <nav
                className="flex flex-wrap items-center justify-center gap-2 pt-1"
                aria-label="Company list pages"
              >
                <button
                  type="button"
                  className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 font-mono text-[0.95rem] font-bold text-[var(--muted-strong)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[#151515] disabled:cursor-default disabled:opacity-45"
                  onClick={(event) => handlePaginationClick(event, currentPage - 1)}
                  disabled={currentPage === 1 || isLoadingCompanies}
                >
                  {"<"}
                </button>

                {paginationItems.map((item, index) =>
                  item === "ellipsis" ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="inline-flex h-11 min-w-11 items-center justify-center px-2 font-mono text-[0.95rem] font-bold text-[var(--muted)]"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      className={`inline-flex h-11 min-w-11 items-center justify-center rounded-full border px-4 font-mono text-[0.95rem] font-bold transition disabled:cursor-default disabled:opacity-45 ${
                        item === currentPage
                          ? "border-[var(--accent)] bg-[var(--accent)] text-[#151515]"
                          : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted-strong)] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[#151515]"
                      }`}
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
                  className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 font-mono text-[0.95rem] font-bold text-[var(--muted-strong)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[#151515] disabled:cursor-default disabled:opacity-45"
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
    </div>
  );
}

export function HomePageClient(props: HomePageClientProps) {
  return <HomePageContent {...props} />;
}
