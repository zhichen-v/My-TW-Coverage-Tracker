"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import * as d3 from "d3";
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

type RenderNode = HeroGraphNode &
  d3.SimulationNodeDatum & {
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
  };

type RenderLink = HeroGraphLink & d3.SimulationLinkDatum<RenderNode>;

const CENTER_NODE_ID = "tsmc";

function formatNumber(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US").format(value);
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
  const svgRef = useRef<SVGSVGElement | null>(null);
  const graph = useMemo(() => buildTsmcHeroGraph(graphData), [graphData]);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) {
      return;
    }

    const render = () => {
      const width = svgElement.clientWidth || 720;
      const height = svgElement.clientHeight || 420;
      const centerX = width * 0.58;
      const centerY = height * 0.52;
      const nodes: RenderNode[] = graph.nodes.map((node) => ({ ...node }));
      const links: RenderLink[] = graph.links.map((link) => ({ ...link }));
      const centerNode = nodes.find((node) => node.id === CENTER_NODE_ID);

      if (centerNode) {
        centerNode.fx = centerX;
        centerNode.fy = centerY;
      }

      const svg = d3.select(svgElement);
      svg.selectAll("*").remove();

      const defs = svg.append("defs");
      const glow = defs.append("filter").attr("id", "hero-graph-glow");
      glow.append("feGaussianBlur").attr("stdDeviation", 7).attr("result", "blur");
      const merge = glow.append("feMerge");
      merge.append("feMergeNode").attr("in", "blur");
      merge.append("feMergeNode").attr("in", "SourceGraphic");

      const root = svg.append("g");
      const linkLayer = root.append("g");
      const nodeLayer = root.append("g");
      const labelLayer = root.append("g");

      const simulation = d3
        .forceSimulation(nodes)
        .force(
          "link",
          d3
            .forceLink<RenderNode, RenderLink>(links)
            .id((node) => node.id)
            .distance((link) =>
              link.source === CENTER_NODE_ID || link.target === CENTER_NODE_ID ? 125 : 105,
            )
            .strength(0.42),
        )
        .force("charge", d3.forceManyBody().strength(-420))
        .force("center", d3.forceCenter(centerX, centerY))
        .force("collide", d3.forceCollide<RenderNode>().radius((node) => node.radius + 22))
        .alpha(0.95);

      const linkSelection = linkLayer
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", "rgba(255,255,255,0.22)")
        .attr("stroke-width", 1.2);

      const nodeSelection = nodeLayer
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("r", (node) => node.radius)
        .attr("fill", (node) => (node.type === "company" ? "var(--accent)" : "#166534"))
        .attr("stroke", (node) => (node.type === "company" ? "#f4f692" : "rgba(250,255,105,0.18)"))
        .attr("stroke-width", 1.2)
        .attr("filter", (node) => (node.type === "company" ? "url(#hero-graph-glow)" : null));

      const labelSelection = labelLayer
        .selectAll("text")
        .data(nodes)
        .join("text")
        .attr("text-anchor", "middle")
        .attr("fill", "var(--text-strong)")
        .attr("font-family", "var(--font-sans)")
        .attr("font-size", (node) => (node.type === "company" ? 14 : 12))
        .attr("font-weight", 800)
        .attr("paint-order", "stroke")
        .attr("stroke", "rgba(0,0,0,0.72)")
        .attr("stroke-width", 4)
        .selectAll("tspan")
        .data((node) =>
          node.label.split("\n").map((line, index) => ({
            node,
            line,
            index,
          })),
        )
        .join("tspan")
        .text((item) => item.line)
        .attr("x", 0)
        .attr("dy", (item) => (item.index === 0 ? 0 : 18));

      simulation.on("tick", () => {
        linkSelection
          .attr("x1", (link) => (link.source as RenderNode).x ?? 0)
          .attr("y1", (link) => (link.source as RenderNode).y ?? 0)
          .attr("x2", (link) => (link.target as RenderNode).x ?? 0)
          .attr("y2", (link) => (link.target as RenderNode).y ?? 0);

        nodeSelection.attr("cx", (node) => node.x ?? 0).attr("cy", (node) => node.y ?? 0);

        labelLayer
          .selectAll<SVGTextElement, RenderNode>("text")
          .attr("transform", (node) => `translate(${node.x ?? 0},${(node.y ?? 0) + node.radius + 18})`);
      });

      return () => {
        simulation.stop();
        svg.selectAll("*").remove();
      };
    };

    let cleanup = render();
    const resizeObserver = new ResizeObserver(() => {
      cleanup?.();
      cleanup = render();
    });
    resizeObserver.observe(svgElement);

    return () => {
      resizeObserver.disconnect();
      cleanup?.();
    };
  }, [graph]);

  return (
    <div
      className="relative z-[1] min-h-[430px] overflow-hidden rounded-[var(--radius-lg)] before:absolute before:in-[8%_5%_2%_6%] before:rounded-full before:bg-[radial-gradient(circle,rgba(250,255,105,0.16),transparent_58%)] before:blur-[18px] max-[1100px]:min-h-[370px] max-[640px]:ml-[28%] max-[640px]:mr-[-14px] max-[640px]:mt-[-36px] max-[640px]:min-h-[360px]"
      aria-label="TSMC related theme graph preview"
    >
      <svg
        ref={svgRef}
        role="img"
        aria-label="TSMC related theme graph"
        className="relative block h-[430px] w-full max-[1100px]:h-[400px] max-[640px]:h-[360px] max-[640px]:min-w-[460px]"
      />
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
      value: formatNumber(health.latest_import?.company_count),
      detail: "Taiwan-listed",
      icon: "companies" as const,
    },
    {
      label: "Wikilinks",
      value: formatNumber(health.latest_import?.wikilink_count),
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
      value: `${formatNumber(graphData.meta.theme_count)}+`,
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

      <main className="relative flex flex-col gap-5 before:pointer-events-none before:fixed before:inset-0 before:bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] before:bg-[position:center_top] before:bg-[size:32px_32px] before:opacity-70 before:[mask-image:radial-gradient(circle_at_68%_24%,black_0,rgba(0,0,0,0.78)_28%,transparent_62%)] sm:gap-6">
        <section
          className="relative grid min-h-[520px] grid-cols-[minmax(0,760px)_minmax(320px,1fr)] items-center gap-6 max-[1100px]:min-h-0 max-[1100px]:grid-cols-1 max-[640px]:block"
          aria-label="Homepage introduction"
        >
          <div className="relative z-[2] grid gap-8 pt-6 max-[640px]:gap-7 max-[640px]:pt-4">
            <div>
            <h1
              className="m-0 text-[clamp(2.4rem,4.2vw,4.4rem)] font-black leading-[1.16] tracking-[-0.07em] text-[var(--text-strong)] max-[640px]:text-[clamp(2.25rem,9.6vw,3.35rem)] max-[640px]:leading-[1.05]"
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
              className="grid min-h-[140px] grid-cols-[76px_minmax(0,1fr)] items-center gap-[22px] rounded-[var(--radius-lg)] border border-[var(--line)] bg-[rgba(10,10,10,0.92)] p-[26px] shadow-[var(--shadow-soft)] max-[640px]:min-h-[182px] max-[640px]:grid-cols-1 max-[640px]:content-start max-[640px]:gap-4 max-[640px]:p-6"
              key={stat.label}
            >
              <div className="inline-flex h-[66px] w-[66px] items-center justify-center rounded-[18px] border border-[var(--line-strong)] bg-[rgba(250,255,105,0.04)] text-[var(--accent)] max-[640px]:h-[76px] max-[640px]:w-[76px] [&_svg]:h-9 [&_svg]:w-9 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.45] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]">
                <StatIcon type={stat.icon} />
              </div>
              <div>
                <p className="mb-2.5 mt-0 font-mono text-[0.78rem] font-black uppercase tracking-[0.18em] text-[var(--muted-strong)]">
                  {stat.label}
                </p>
                <strong
                  className="block text-[clamp(1.65rem,2.2vw,2.45rem)] leading-[1.08] tracking-[0.03em] text-[var(--accent)] max-[640px]:text-[clamp(1.8rem,8vw,2.55rem)]"
                  style={{ fontFamily: "var(--font-display)", fontWeight: 950 }}
                >
                  {stat.value}
                </strong>
                <span className="mt-2 block text-[0.98rem] leading-[1.45] text-[var(--text-strong)]">
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
