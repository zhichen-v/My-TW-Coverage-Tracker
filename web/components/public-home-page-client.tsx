"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  HomepageCompanyCloud,
  type HomepageCompanyCloudNode,
} from "@/components/homepage-company-cloud";
import { useLanguage } from "@/components/language-provider";
import { ShellHeader } from "@/components/shell-header";
import type { CompanyListItem, Sector } from "@/lib/api";
import {
  translateHomepage,
  translateSectorName,
  type HomepageTranslationKey,
} from "@/lib/i18n";
import { getAppHref, isExternalHref } from "@/lib/routes";

type HealthSnapshot = {
  status: string;
  latest_import?: {
    imported_at: string;
    company_count: number;
    wikilink_count: number;
  } | null;
};

type PublicHomePageClientProps = {
  health: HealthSnapshot;
  sectors: Sector[];
  popularCompanies: CompanyListItem[];
  cloudCompanies: HomepageCompanyCloudNode[];
};

function formatNumber(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function AnimatedStatValue({
  value,
  suffix = "",
  fallback = "N/A",
}: {
  value?: number | null;
  suffix?: string;
  fallback?: string;
}) {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;
  const [displayValue, setDisplayValue] = useState(() => {
    if (safeValue === null) {
      return null;
    }

    return safeValue > 24 ? Math.round(safeValue * 0.08) : 0;
  });

  useEffect(() => {
    if (safeValue === null) {
      setDisplayValue(null);
      return;
    }

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayValue(safeValue);
      return;
    }

    const durationMs = 2000;
    const startValue = safeValue > 24 ? Math.round(safeValue * 0.08) : 0;
    const wobbleAmplitude = Math.max(1, Math.round(safeValue * 0.018));
    let frameId = 0;
    let startTime = 0;

    setDisplayValue(startValue);

    const updateValue = (timestamp: number) => {
      if (!startTime) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const easedProgress =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - ((-2 * progress + 2) ** 3) / 2;
      const baseValue = startValue + (safeValue - startValue) * easedProgress;
      const wobble = Math.sin(progress * Math.PI * 6) * wobbleAmplitude * (1 - progress) * 0.9;
      const nextValue =
        progress >= 1
          ? safeValue
          : Math.max(0, Math.min(safeValue + wobbleAmplitude, Math.round(baseValue + wobble)));

      setDisplayValue(nextValue);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(updateValue);
      }
    };

    frameId = window.requestAnimationFrame(updateValue);

    return () => window.cancelAnimationFrame(frameId);
  }, [safeValue]);

  if (safeValue === null || displayValue === null) {
    return <>{fallback}</>;
  }

  return (
    <>
      {formatNumber(displayValue)}
      {suffix}
    </>
  );
}

function SectorStatValue({ value }: { value: string }) {
  const shouldScroll = value.length > 10;

  if (!shouldScroll) {
    return <span>{value}</span>;
  }

  return (
    <span className="homepage-stat-marquee" title={value}>
      <span className="homepage-stat-marquee-track">
        <span>{value}</span>
        <span aria-hidden="true">{value}</span>
      </span>
    </span>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
}

function StatIcon({ type }: { type: "companies" | "wikilinks" | "sector" | "themes" }) {
  if (type === "companies") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20V9h5v11" />
        <path d="M9 20V4h6v16" />
        <path d="M15 20v-8h5v8" />
        <path d="M2.5 20h19" />
        <path d="M11 8h2M11 12h2M6 13h1M17 16h1" />
      </svg>
    );
  }

  if (type === "wikilinks") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v5h5" />
        <path d="M10 12h6M10 16h5" />
      </svg>
    );
  }

  if (type === "sector") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v9h9" />
        <path d="M21 12a9 9 0 1 1-9-9" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="18" r="1.8" />
      <circle cx="12" cy="7" r="1.8" />
      <circle cx="19" cy="16" r="1.8" />
      <path d="M6 16.5 11 8.8M13.4 8.4l4.2 6.2" />
    </svg>
  );
}

function QuickAccessIcon({ type }: { type: "company" | "graph" | "market" }) {
  if (type === "company") {
    return <SearchIcon />;
  }

  if (type === "graph") {
    return <StatIcon type="themes" />;
  }

  return <StatIcon type="wikilinks" />;
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function PublicHomePageClient({
  health,
  sectors,
  popularCompanies,
  cloudCompanies,
}: PublicHomePageClientProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const homeT = (key: HomepageTranslationKey) => translateHomepage(language, key);
  const [query, setQuery] = useState("");
  const topCompany = popularCompanies[0] ?? null;
  const topSector = topCompany
    ? translateSectorName(language, topCompany.sector_folder)
    : sectors[0]
      ? translateSectorName(language, sectors[0].name)
      : homeT("notAvailable");
  const popularSearches = popularCompanies.slice(0, 5);
  const quickAccessItems = [
    {
      id: "company-list",
      title: homeT("companyListTitle"),
      description: homeT("companyListDescription"),
      href: getAppHref("/"),
      icon: "company" as const,
    },
    {
      id: "themes-graph",
      title: homeT("themesGraphTitle"),
      description: homeT("themesGraphDescription"),
      href: getAppHref("/graph"),
      icon: "graph" as const,
    },
    {
      id: "market-overview",
      title: homeT("marketOverviewTitle"),
      description: homeT("marketOverviewDescription"),
      href: getAppHref("/"),
      icon: "market" as const,
    },
  ];
  const stats = [
    {
      id: "covered-companies",
      label: homeT("coveredCompanies"),
      numericValue: health.latest_import?.company_count,
      icon: "companies" as const,
    },
    {
      id: "sector-groups",
      label: homeT("sectorGroups"),
      numericValue: sectors.length,
      icon: "themes" as const,
    },
    {
      id: "wikilinks",
      label: homeT("wikilinks"),
      numericValue: health.latest_import?.wikilink_count,
      icon: "wikilinks" as const,
    },
    {
      id: "top-sector",
      label: homeT("topSector"),
      value: topSector,
      icon: "sector" as const,
    },
  ];

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    const queryString = trimmedQuery ? `q=${encodeURIComponent(trimmedQuery)}` : undefined;
    const targetHref = getAppHref("/", queryString);

    if (isExternalHref(targetHref)) {
      window.location.assign(targetHref);
      return;
    }

    router.push(targetHref);
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <ShellHeader />

      <main className="flex flex-col gap-5 sm:gap-6">
        <section
          className="relative grid min-h-[560px] grid-cols-[minmax(0,1fr)_minmax(520px,640px)] items-center gap-8 max-[1280px]:min-h-0 max-[1280px]:grid-cols-1 max-[640px]:gap-5"
          aria-label={homeT("heroSectionAria")}
        >
          <div className="relative z-[2] grid max-w-[760px] gap-8 pt-6 max-[640px]:max-w-none max-[640px]:gap-5 max-[640px]:pt-2">
            <div className="grid items-stretch gap-5 max-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-[640px]:gap-2.5">
              <div className="min-w-0">
                <h1
                  className="m-0 text-[clamp(2.6rem,4.4vw,4.6rem)] font-black leading-[1.04] tracking-[0] text-[var(--text-strong)] max-[640px]:text-[1.64rem] max-[640px]:leading-[1.08] min-[390px]:max-[640px]:text-[1.64rem]"
                  style={{ fontFamily: "var(--font-display)", fontWeight: 950 }}
                >
                  <span className="block">Discover.</span>
                  <span className="block">Analyze.</span>
                  <span className="block">Track.</span>
                  <span className="block text-[var(--accent)]">Taiwan Stocks.</span>
                </h1>
                <p className="mt-6 max-w-[700px] text-[clamp(1.05rem,1.45vw,1.34rem)] leading-[1.78] text-[var(--muted-strong)] max-[640px]:mt-2.5 max-[640px]:max-w-none max-[640px]:text-[0.74rem] max-[640px]:leading-[1.38] min-[390px]:max-[640px]:text-[0.8rem]">
                  {homeT("heroDescription")}
                </p>
              </div>
              <HomepageCompanyCloud
                companies={cloudCompanies}
                className="hidden h-full w-full self-stretch rounded-[32px] [mask-image:radial-gradient(black_22%,transparent_100%)] max-[640px]:block"
              />
            </div>

            <div className="grid gap-5 max-[640px]:gap-5" aria-label={homeT("searchSectionAria")}>
              <form
                className="grid min-h-[62px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center overflow-hidden rounded-[16px] border border-[var(--line)] bg-[rgba(10,10,10,0.94)] shadow-[var(--shadow-soft)] max-[640px]:min-h-[56px] max-[640px]:grid-cols-[auto_minmax(0,1fr)_minmax(112px,0.34fr)]"
                onSubmit={submitSearch}
              >
                <span className="inline-flex w-16 items-center justify-center text-[var(--muted-strong)] max-[640px]:w-[44px] [&_svg]:h-[30px] [&_svg]:w-[30px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.6] max-[640px]:[&_svg]:h-5 max-[640px]:[&_svg]:w-5">
                  <SearchIcon />
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={homeT("searchPlaceholder")}
                  aria-label={homeT("searchInputAria")}
                  className="h-full min-w-0 border-0 bg-transparent text-base text-[var(--text)] outline-none placeholder:text-[var(--muted)] max-[640px]:pr-1.5 max-[640px]:text-[0.68rem] max-[640px]:leading-[1.25]"
                />
                <button
                  className="m-2 inline-flex min-w-[165px] items-center justify-center self-stretch whitespace-nowrap rounded-[14px] border border-[var(--accent)] bg-[var(--accent)] px-4 font-mono text-[0.9rem] font-black uppercase tracking-[0.14em] text-[#151515] hover:bg-[var(--surface-active)] hover:text-[var(--accent)] max-[640px]:m-1 max-[640px]:min-w-0 max-[640px]:px-1.5 max-[640px]:text-[0.62rem] max-[640px]:tracking-[0.04em]"
                  type="submit"
                >
                  <span className="max-[640px]:hidden">{homeT("exploreNow")}</span>
                  <span className="hidden max-[640px]:inline">{homeT("exploreShort")}</span>
                </button>
              </form>

              <div
                className="flex flex-wrap items-center gap-[18px] max-[640px]:flex-col max-[640px]:items-start max-[640px]:gap-4"
                aria-label={homeT("popularSearches")}
              >
                <span className="m-0 font-mono text-[0.88rem] font-extrabold uppercase tracking-[0.14em] text-[var(--text-strong)] max-[640px]:text-[0.78rem] max-[640px]:tracking-[0.2em]">
                  {homeT("popularSearches")}
                </span>
                <div className="flex flex-wrap gap-3 w-full max-[640px]:flex-nowrap max-[640px]:gap-1.5">
                  {popularSearches.map((company) => (
                    <Link
                      key={company.report_id}
                      href={getAppHref("/", `q=${encodeURIComponent(company.ticker)}`)}
                      title={company.company_name}
                      className="
                        inline-flex min-h-[34px] min-w-[76px] items-center justify-center 
                        rounded-full border border-[var(--line-strong)] bg-[rgba(16,16,0,0.34)] px-5 
                        font-mono text-[0.78rem] font-black uppercase tracking-[0.08em] text-[var(--accent)] 
                        hover:border-[var(--accent)] hover:bg-[rgba(250,255,105,0.1)] 
                        
                        max-[640px]:flex-1 
                        max-[640px]:min-h-[34px] 
                        max-[640px]:min-w-0 
                        max-[640px]:px-0 
                        max-[640px]:text-[0.84rem]
                      "
                    >
                      {company.ticker}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-[1] min-w-0 max-[640px]:hidden">
            <HomepageCompanyCloud companies={cloudCompanies} />
          </div>
        </section>

        <section
          className="grid grid-cols-4 gap-2 max-[1100px]:grid-cols-2 max-[640px]:gap-2.5"
          aria-label={homeT("marketSummaryAria")}
        >
          {stats.map((stat) => (
            <article
              className="grid h-[132px] grid-cols-[70px_minmax(0,1fr)] items-center gap-5 rounded-[24px] border border-[var(--line)] bg-[rgba(10,10,10,0.92)] p-5 shadow-[var(--shadow-soft)] max-[640px]:h-[84px] max-[640px]:grid-cols-[44px_minmax(0,1fr)] max-[640px]:gap-2.5 max-[640px]:p-3.5"
              key={stat.id}
            >
              <div className="inline-flex h-[62px] w-[62px] items-center justify-center rounded-[18px] border border-[var(--line-strong)] bg-[rgba(250,255,105,0.04)] text-[var(--accent)] max-[640px]:h-[44px] max-[640px]:w-[44px] max-[640px]:rounded-[14px] [&_svg]:h-8 [&_svg]:w-8 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.45] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] max-[640px]:[&_svg]:h-6 max-[640px]:[&_svg]:w-6">
                <StatIcon type={stat.icon} />
              </div>
              <div className="flex min-w-0 items-center">
                <div className="grid min-w-0 gap-3.5 max-[640px]:gap-2.5">
                  <p className="m-0 font-mono text-[0.88rem] font-black uppercase leading-[1.12] tracking-[0.13em] text-[var(--muted-strong)] max-[640px]:text-[0.7rem] max-[640px]:leading-[1.12] max-[640px]:tracking-[0.08em]">
                    {stat.label}
                  </p>
                  <strong
                    className={`block min-w-0 overflow-hidden leading-[1.08] ${
                      stat.icon === "sector"
                        ? "whitespace-nowrap text-[clamp(1.65rem,2.05vw,2.3rem)] leading-[1.02] tracking-[0.01em] text-[var(--accent)] max-[640px]:text-[1.42rem]"
                        : "text-[clamp(1.65rem,2.2vw,2.45rem)] tracking-[0.03em] text-[var(--accent)] max-[640px]:text-[1.52rem]"
                    }`}
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 950,
                    }}
                  >
                    {"numericValue" in stat ? (
                      <AnimatedStatValue
                        value={stat.numericValue}
                        fallback={homeT("notAvailable")}
                      />
                    ) : (
                      <SectorStatValue value={stat.value} />
                    )}
                  </strong>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section
          className="grid gap-[22px] p-0 max-[640px]:gap-5"
          aria-label={homeT("quickAccessAria")}
        >
          <p className="m-0 font-mono text-[0.88rem] font-extrabold uppercase tracking-[0.14em] text-[var(--text-strong)] max-[640px]:text-[0.86rem] max-[640px]:tracking-[0.2em]">
            {homeT("quickAccess")}
          </p>
          <div className="grid grid-cols-3 gap-2 max-[900px]:grid-cols-1 max-[640px]:gap-2.5">
            {quickAccessItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="grid min-h-[84px] grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 rounded-[24px] border border-[var(--line)] bg-[rgba(10,10,10,0.78)] px-5 text-[var(--text-strong)] hover:border-[var(--accent)] max-[640px]:min-h-[84px] max-[640px]:grid-cols-[46px_minmax(0,1fr)_auto] max-[640px]:gap-2.5 max-[640px]:px-3.5"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-[rgba(250,255,105,0.05)] text-[var(--accent)] max-[640px]:h-[46px] max-[640px]:w-[46px] max-[640px]:rounded-[14px] [&_svg]:h-7 [&_svg]:w-7 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.7] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] max-[640px]:[&_svg]:h-6 max-[640px]:[&_svg]:w-6">
                  <QuickAccessIcon type={item.icon} />
                </span>
                <span className="min-w-0">
                  <strong className="block text-[1rem] font-black leading-tight max-[640px]:text-[0.98rem]">
                    {item.title}
                  </strong>
                  <span className="mt-1.5 block text-[0.86rem] leading-snug text-[var(--muted-strong)] max-[640px]:mt-1 max-[640px]:text-[0.82rem]">
                    {item.description}
                  </span>
                </span>
                <span className="text-[var(--text-strong)] [&_svg]:h-6 [&_svg]:w-6 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[2] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]">
                  <ChevronRightIcon />
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
