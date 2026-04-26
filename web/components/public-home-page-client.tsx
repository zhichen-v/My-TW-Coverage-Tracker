"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ShellHeader } from "@/components/shell-header";
import type { CompanyListItem, GraphLink, GraphResponse, Sector } from "@/lib/api";
import { translateSectorName } from "@/lib/i18n";

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
  graphData: GraphResponse;
};

type HeroGraphNode = {
  id: string;
  label: string;
  type: "company" | "theme";
  radius: number;
};

type HeroGraphLink = {
  source: string;
  target: string;
};

type HeroGraphPosition = {
  x: number;
  y: number;
};

const CENTER_NODE_ID = "tsmc";
const HERO_GRAPH_WIDTH = 720;
const HERO_GRAPH_HEIGHT = 430;
const HERO_GRAPH_CENTER: HeroGraphPosition = { x: 432, y: 210 };
const HERO_GRAPH_THEME_POSITIONS: HeroGraphPosition[] = [
  { x: 296, y: 112 },
  { x: 280, y: 260 },
  { x: 466, y: 84 },
  { x: 548, y: 128 },
  { x: 522, y: 228 },
  { x: 480, y: 318 },
  { x: 320, y: 346 },
  { x: 618, y: 190 },
];

function formatNumber(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function AnimatedStatValue({
  value,
  suffix = "",
}: {
  value?: number | null;
  suffix?: string;
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
    return <>N/A</>;
  }

  return (
    <>
      {formatNumber(displayValue)}
      {suffix}
    </>
  );
}

function buildTsmcHeroGraph(graphData: GraphResponse) {
  const tsmcThemeIds = new Set<string>();

  graphData.company_map.themes.forEach((theme) => {
    const hasTsmc = theme.all_companies.some(
      (company) => company.ticker === "2330" || company.company_name.includes("台積電"),
    );
    if (hasTsmc) {
      tsmcThemeIds.add(theme.id);
    }
  });

  const graphNodeById = new Map(graphData.graph.nodes.map((node) => [node.id, node]));
  const weightedThemeIds = Array.from(tsmcThemeIds)
    .map((id) => {
      const node = graphNodeById.get(id);
      return {
        id,
        degree: node?.degree ?? 0,
        label: node?.label ?? id,
      };
    })
    .sort((left, right) => right.degree - left.degree || left.label.localeCompare(right.label))
    .slice(0, 8);

  const themeIds = new Set(weightedThemeIds.map((theme) => theme.id));
  const nodes: HeroGraphNode[] = [
    {
      id: CENTER_NODE_ID,
      label: "台積電\n2330",
      type: "company",
      radius: 34,
    },
    ...weightedThemeIds.map((theme, index) => ({
      id: theme.id,
      label: theme.label,
      type: "theme" as const,
      radius: index < 4 ? 22 : 18,
    })),
  ];

  const links: HeroGraphLink[] = weightedThemeIds.map((theme) => ({
    source: CENTER_NODE_ID,
    target: theme.id,
  }));

  graphData.graph.links.forEach((link: GraphLink) => {
    if (themeIds.has(link.source) && themeIds.has(link.target)) {
      links.push({ source: link.source, target: link.target });
    }
  });

  return { nodes, links };
}

function HeroGraph({ graphData }: { graphData: GraphResponse }) {
  const graph = buildTsmcHeroGraph(graphData);
  const positionedNodes = graph.nodes.map((node, index) => ({
    ...node,
    position:
      node.id === CENTER_NODE_ID
        ? HERO_GRAPH_CENTER
        : HERO_GRAPH_THEME_POSITIONS[(index - 1) % HERO_GRAPH_THEME_POSITIONS.length],
  }));
  const nodePositions = new Map(positionedNodes.map((node) => [node.id, node.position]));

  return (
    <div
      className="relative z-[1] min-h-[430px] overflow-hidden rounded-[var(--radius-lg)] before:absolute before:in-[8%_5%_2%_6%] before:rounded-full before:bg-[radial-gradient(circle,rgba(250,255,105,0.16),transparent_58%)] before:blur-[18px] max-[1100px]:min-h-[370px] max-[640px]:ml-[28%] max-[640px]:mr-[-14px] max-[640px]:mt-[-36px] max-[640px]:min-h-[360px]"
      aria-label="TSMC related theme graph preview"
    >
      <svg
        role="img"
        aria-label="TSMC related theme graph"
        viewBox={`0 0 ${HERO_GRAPH_WIDTH} ${HERO_GRAPH_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="relative block h-[430px] w-full max-[1100px]:h-[400px] max-[640px]:h-[360px] max-[640px]:min-w-[460px]"
      >
        <defs>
          <filter id="hero-graph-glow">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g>
          {graph.links.map((link, index) => {
            const source = nodePositions.get(link.source);
            const target = nodePositions.get(link.target);
            if (!source || !target) {
              return null;
            }

            return (
              <line
                key={`link-${link.source}-${link.target}-${index}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="1.2"
              />
            );
          })}
        </g>

        <g>
          {positionedNodes.map((node) => (
            <circle
              key={node.id}
              cx={node.position.x}
              cy={node.position.y}
              r={node.radius}
              fill={node.type === "company" ? "var(--accent)" : "#166534"}
              stroke={node.type === "company" ? "#f4f692" : "rgba(250,255,105,0.18)"}
              strokeWidth="1.2"
              filter={node.type === "company" ? "url(#hero-graph-glow)" : undefined}
            />
          ))}
        </g>

        <g>
          {positionedNodes.map((node) => (
            <text
              key={`label-${node.id}`}
              x={node.position.x}
              y={node.position.y + node.radius + 18}
              textAnchor="middle"
              fill="var(--text-strong)"
              fontFamily="var(--font-sans)"
              fontSize={node.type === "company" ? 14 : 12}
              fontWeight="800"
              paintOrder="stroke"
              stroke="rgba(0,0,0,0.72)"
              strokeWidth="4"
            >
              {node.label.split("\n").map((line, index) => (
                <tspan key={`${node.id}-${index}`} x={node.position.x} dy={index === 0 ? 0 : 18}>
                  {line}
                </tspan>
              ))}
            </text>
          ))}
        </g>
      </svg>
    </div>
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

export function PublicHomePageClient({
  health,
  sectors,
  popularCompanies,
  graphData,
}: PublicHomePageClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const topCompany = popularCompanies[0] ?? null;
  const topSector = topCompany
    ? translateSectorName("en", topCompany.sector_folder)
    : sectors[0]
      ? translateSectorName("en", sectors[0].name)
      : "N/A";
  const popularSearches = popularCompanies.slice(0, 5);
  const stats = [
    {
      label: "Covered Companies",
      numericValue: health.latest_import?.company_count,
      detail: "Taiwan-listed",
      icon: "companies" as const,
    },
    {
      label: "Wikilinks",
      numericValue: health.latest_import?.wikilink_count,
      detail: "Data Points",
      icon: "wikilinks" as const,
    },
    {
      label: "Top Sector",
      value: topSector,
      detail: "Leading by market cap",
      icon: "sector" as const,
    },
    {
      label: "Themes",
      numericValue: graphData.meta.theme_count,
      suffix: "+",
      detail: "Industry Themes",
      icon: "themes" as const,
    },
  ];

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    router.push(trimmedQuery ? `/app?q=${encodeURIComponent(trimmedQuery)}` : "/app");
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <ShellHeader />

      <main className="flex flex-col gap-5 sm:gap-6">
        <section
          className="relative grid min-h-[520px] grid-cols-[minmax(0,760px)_minmax(320px,1fr)] items-center gap-6 max-[1100px]:min-h-0 max-[1100px]:grid-cols-1 max-[640px]:block"
          aria-label="Homepage introduction"
        >
          <div className="relative z-[2] grid gap-8 pt-6 max-[640px]:gap-7 max-[640px]:pt-4">
            <div>
            <h1
              className="m-0 text-[clamp(2.6rem,4.4vw,4.6rem)] font-black leading-[1.16] tracking-[-0.07em] text-[var(--text-strong)] max-[640px]:text-[clamp(2.25rem,9.6vw,3.35rem)] max-[640px]:leading-[1.05]"
              style={{ fontFamily: "var(--font-display)", fontWeight: 950 }}
            >
              Discover.
              <br />
              Analyze.
              <br />
              <span className="whitespace-nowrap">
                Track <span className="text-[var(--accent)]">Taiwan Stocks.</span>
              </span>
            </h1>
            <p className="mt-6 max-w-[700px] text-[clamp(1.05rem,1.45vw,1.34rem)] leading-[1.78] text-[var(--muted-strong)] max-[640px]:mt-[22px] max-[640px]:max-w-[34ch] max-[640px]:text-[1.05rem] max-[640px]:leading-[1.7]">
              Explore Taiwan-listed companies, uncover industry connections, and access key
              financial data — all in one place.
            </p>
            </div>

            <div className="grid gap-5" aria-label="Company search">
              <form
                className="grid min-h-[62px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[rgba(10,10,10,0.94)] shadow-[var(--shadow-soft)] max-[640px]:min-h-[76px] max-[640px]:grid-cols-[auto_minmax(0,1fr)] max-[640px]:overflow-visible max-[640px]:rounded-2xl"
                onSubmit={submitSearch}
              >
                <span className="inline-flex w-16 items-center justify-center text-[var(--muted-strong)] max-[640px]:w-[58px] [&_svg]:h-[30px] [&_svg]:w-[30px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.6]">
                  <SearchIcon />
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by ticker, company name, sector, or key terms"
                  aria-label="Search companies"
                  className="h-full min-w-0 border-0 bg-transparent text-base text-[var(--text)] outline-none placeholder:text-[var(--muted)] max-[640px]:pr-3.5 max-[640px]:text-[0.98rem]"
                />
                <button
                  className="m-2 min-w-[165px] self-stretch rounded-[var(--radius-lg)] border border-[var(--accent)] bg-[var(--accent)] font-mono text-[0.9rem] font-black uppercase tracking-[0.14em] text-[#151515] hover:bg-[var(--surface-active)] hover:text-[var(--accent)] max-[640px]:col-span-full max-[640px]:mt-3 max-[640px]:min-h-16 max-[640px]:rounded-2xl"
                  type="submit"
                >
                  Explore Now
                </button>
              </form>

              <div
                className="flex flex-wrap items-center gap-[18px] max-[640px]:flex-col max-[640px]:items-start max-[640px]:gap-3.5"
                aria-label="Popular searches"
              >
                <span className="m-0 font-mono text-[0.88rem] font-extrabold uppercase tracking-[0.14em] text-[var(--text-strong)] max-[640px]:text-[0.86rem] max-[640px]:tracking-[0.2em]">
                  Popular Searches
                </span>
                <div className="flex flex-wrap gap-3">
                  {popularSearches.map((company) => (
                    <Link
                      key={company.report_id}
                      href={`/app?q=${encodeURIComponent(company.ticker)}` as Route}
                      title={company.company_name}
                      className="inline-flex min-h-[34px] min-w-[76px] items-center justify-center rounded-full border border-[var(--line-strong)] bg-[rgba(16,16,0,0.34)] font-mono text-[0.78rem] font-black uppercase tracking-[0.08em] text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[rgba(250,255,105,0.1)] max-[640px]:min-h-12 max-[640px]:min-w-[108px] max-[640px]:text-[0.88rem]"
                    >
                      {company.ticker}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="w-full max-w-[620px] justify-self-end max-[1100px]:max-w-none max-[1100px]:justify-self-stretch">
            <HeroGraph graphData={graphData} />
          </div>
        </section>

        <section
          className="grid grid-cols-4 gap-2 max-[1100px]:grid-cols-2"
          aria-label="Market data summary"
        >
          {stats.map((stat) => (
            <article
              className="grid h-[142px] grid-cols-[76px_minmax(0,1fr)] items-center gap-[22px] rounded-[var(--radius-lg)] border border-[var(--line)] bg-[rgba(10,10,10,0.92)] p-[26px] shadow-[var(--shadow-soft)] max-[640px]:h-[182px] max-[640px]:grid-cols-1 max-[640px]:content-start max-[640px]:gap-4 max-[640px]:p-6"
              key={stat.label}
            >
              <div className="inline-flex h-[66px] w-[66px] items-center justify-center rounded-[18px] border border-[var(--line-strong)] bg-[rgba(250,255,105,0.04)] text-[var(--accent)] max-[640px]:h-[76px] max-[640px]:w-[76px] [&_svg]:h-9 [&_svg]:w-9 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.45] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]">
                <StatIcon type={stat.icon} />
              </div>
              <div className="min-w-0">
                <p className="mb-2.5 mt-0 flex h-4 items-start font-mono text-[0.78rem] font-black uppercase tracking-[0.18em] text-[var(--muted-strong)]">
                  {stat.label}
                </p>
                <strong
                  className={`block leading-[1.08] ${
                    stat.icon === "sector"
                      ? "whitespace-nowrap text-[1.28rem] leading-none tracking-normal text-[var(--accent)] max-[640px]:text-[1.42rem]"
                      : "text-[clamp(1.65rem,2.2vw,2.45rem)] tracking-[0.03em] text-[var(--accent)] max-[640px]:text-[clamp(1.8rem,8vw,2.55rem)]"
                  }`}
                  style={{
                    fontFamily: stat.icon === "sector" ? "var(--font-sans)" : "var(--font-display)",
                    fontWeight: stat.icon === "sector" ? 900 : 950,
                  }}
                >
                  {"numericValue" in stat ? (
                    <AnimatedStatValue value={stat.numericValue} suffix={stat.suffix} />
                  ) : (
                    stat.value
                  )}
                </strong>
                <span className="mt-2 flex h-[1.45rem] items-start whitespace-nowrap text-[0.98rem] leading-[1.45] text-[var(--text-strong)] max-[640px]:whitespace-normal">
                  {stat.detail}
                </span>
              </div>
            </article>
          ))}
        </section>

        <section
          className="grid min-h-40 gap-[22px] rounded-[var(--radius-lg)] border border-[var(--line)] bg-[rgba(10,10,10,0.92)] p-7 shadow-[var(--shadow-soft)] max-[640px]:min-h-[190px] max-[640px]:border-0 max-[640px]:bg-transparent max-[640px]:p-0 max-[640px]:shadow-none"
          aria-label="Quick access"
        >
          <p className="m-0 font-mono text-[0.88rem] font-extrabold uppercase tracking-[0.14em] text-[var(--text-strong)] max-[640px]:text-[0.86rem] max-[640px]:tracking-[0.2em]">
            Quick Access
          </p>
          <div className="min-h-[74px] rounded-[var(--radius-lg)] border border-dashed border-[rgba(65,65,65,0.72)] bg-[rgba(20,20,20,0.42)]" />
        </section>
      </main>
    </div>
  );
}
