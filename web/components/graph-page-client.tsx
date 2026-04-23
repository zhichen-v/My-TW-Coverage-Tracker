"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import {
  getThemeGraphData,
  type GraphCompany,
  type GraphCompanyRole,
  type GraphLink,
  type GraphNode,
  type GraphResponse,
} from "@/lib/api";
import styles from "./graph-page-client.module.css";

type RenderNode = GraphNode &
  d3.SimulationNodeDatum & {
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
  };

type RenderLink = Omit<GraphLink, "source" | "target"> &
  d3.SimulationLinkDatum<RenderNode> & {
    source: string | RenderNode;
    target: string | RenderNode;
  };

type RendererHandle = {
  destroy: () => void;
  clearSelection: () => void;
  selectNodeById: (nodeId: string) => void;
};

const ROLE_ORDER: GraphCompanyRole[] = ["upstream", "midstream", "downstream", "related"];
const OVERLAY_PANEL_CLASS =
  "absolute z-[2] rounded-lg border border-[rgba(65,65,65,0.8)] bg-[rgba(10,10,10,0.94)] backdrop-blur-[12px] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_18px_48px_rgba(0,0,0,0.42),inset_0_4px_24px_rgba(0,0,0,0.18)]";
const OVERLAY_TITLE_CLASS =
  "mb-[10px] text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]";
const MUTED_CLASS = "text-[var(--muted)]";
const SECTION_CLASS = "mt-[18px] border-t border-[rgba(65,65,65,0.8)] pt-4";
const SECTION_TITLE_CLASS = "mb-3 text-sm font-bold uppercase tracking-[0.16em] text-[#f4f692]";

function getNodeId(node: string | RenderNode) {
  return typeof node === "string" ? node : node.id;
}

function getRenderedNode(node: string | RenderNode) {
  return typeof node === "string" ? null : node;
}

function buildRenderer(args: {
  graph: GraphResponse["graph"];
  svgElement: SVGSVGElement;
  onSelectionChange: (nodeId: string | null) => void;
}): RendererHandle {
  const { graph, svgElement, onSelectionChange } = args;
  const svg = d3.select(svgElement);
  svg.selectAll("*").remove();

  const width = svgElement.clientWidth || window.innerWidth;
  const height = svgElement.clientHeight || Math.max(window.innerHeight - 220, 760);

  const root = svg.append("g");
  const linkLayer = root.append("g");
  const nodeLayer = root.append("g");
  const labelLayer = root.append("g");

  const colors: Record<string, string> = {
    theme: "#faff69",
    supplemental_theme: "#166534",
    wikilink: "#d9d9d9",
  };

  const nodes: RenderNode[] = graph.nodes.map((node) => ({ ...node }));
  const links: RenderLink[] = graph.links.map((link) => ({ ...link }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let selectedNodeId: string | null = null;

  const neighborMap = new Map<string, Set<string>>();
  nodes.forEach((node) => neighborMap.set(node.id, new Set([node.id])));
  links.forEach((link) => {
    const sourceId = getNodeId(link.source);
    const targetId = getNodeId(link.target);
    neighborMap.get(sourceId)?.add(targetId);
    neighborMap.get(targetId)?.add(sourceId);
  });

  const radius = d3
    .scaleSqrt<number, number>()
    .domain([0, d3.max(nodes, (node) => node.degree) || 1])
    .range([7, 34]);

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 3.5])
    .on("zoom", (event) => {
      root.attr("transform", event.transform);
    });

  svg.call(zoom).on("click", (event) => {
    if (event.target === svg.node()) {
      clearSelection();
    }
  });

  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink<RenderNode, RenderLink>(links)
        .id((node) => node.id)
        .distance((link) => (link.target_is_theme ? 164 : 124))
        .strength(0.55),
    )
    .force(
      "charge",
      d3.forceManyBody<RenderNode>().strength((node) => (node.is_theme_page ? -480 : -310)),
    )
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide<RenderNode>().radius((node) => radius(node.degree) + 3))
    .force("x", d3.forceX(width / 2).strength(0.06))
    .force("y", d3.forceY(height / 2).strength(0.06));

  const linkSelection = linkLayer
    .selectAll<SVGLineElement, RenderLink>("line")
    .data(links)
    .join("line")
    .attr("stroke", "rgba(255, 255, 255, 0.38)")
    .attr("stroke-opacity", (link) => (link.target_type === "wikilink" ? 0.7 : 0.5))
    .attr("stroke-width", (link) =>
      link.target_type === "wikilink" ? 1.8 + link.weight * 0.85 : 1.2 + link.weight * 0.65,
    );

  const nodeSelection = nodeLayer
    .selectAll<SVGCircleElement, RenderNode>("circle")
    .data(nodes)
    .join("circle")
    .attr("r", (node) => Math.max(node.radius_hint, radius(node.degree)))
    .attr("fill", (node) => colors[node.type] || "#cccccc")
    .attr("opacity", 0.95)
    .attr("stroke", "rgba(0, 0, 0, 0.92)")
    .attr("stroke-width", 1.5)
    .style("cursor", "grab")
    .call(
      d3
        .drag<SVGCircleElement, RenderNode>()
        .on("start", (event, node) => {
          if (!event.active) {
            simulation.alphaTarget(0.3).restart();
          }
          node.fx = node.x;
          node.fy = node.y;
        })
        .on("drag", (event, node) => {
          node.fx = event.x;
          node.fy = event.y;
        })
        .on("end", (event, node) => {
          if (!event.active) {
            simulation.alphaTarget(0);
          }
          node.fx = null;
          node.fy = null;
        }),
    )
    .on("click", (event, node) => {
      event.stopPropagation();
      if (selectedNodeId === node.id) {
        clearSelection();
        return;
      }
      applySelection(node.id, true);
    });

  const labelSelection = labelLayer
    .selectAll<SVGTextElement, RenderNode>("text")
    .data(nodes.filter((node) => node.is_theme_page || node.degree >= 2))
    .join("text")
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(255, 255, 255, 0.92)")
    .attr("font-size", 12)
    .attr("font-weight", 600)
    .attr("letter-spacing", "0.02em")
    .style("pointer-events", "none")
    .text((node) => node.label);

  simulation.on("tick", () => {
    linkSelection
      .attr("x1", (link) => getRenderedNode(link.source)?.x ?? 0)
      .attr("y1", (link) => getRenderedNode(link.source)?.y ?? 0)
      .attr("x2", (link) => getRenderedNode(link.target)?.x ?? 0)
      .attr("y2", (link) => getRenderedNode(link.target)?.y ?? 0);

    nodeSelection.attr("cx", (node) => node.x ?? 0).attr("cy", (node) => node.y ?? 0);

    labelSelection
      .attr("x", (node) => node.x ?? 0)
      .attr("y", (node) => (node.y ?? 0) + radius(node.degree) + 14);
  });

  function focusNode(targetNode: RenderNode) {
    if (typeof targetNode.x !== "number" || typeof targetNode.y !== "number") {
      return;
    }

    const scale = 1.78;
    const viewportWidth = svgElement.clientWidth || window.innerWidth;
    const viewportHeight = svgElement.clientHeight || window.innerHeight;
    const transform = d3.zoomIdentity
      .translate(viewportWidth / 2, viewportHeight / 2)
      .scale(scale)
      .translate(-targetNode.x, -targetNode.y);

    svg.interrupt();
    svg.transition().duration(360).ease(d3.easeCubicOut).call(zoom.transform, transform);
  }

  function clearSelection() {
    selectedNodeId = null;
    nodeSelection.attr("opacity", 0.95);
    labelSelection.attr("opacity", 1);
    linkSelection.attr("stroke-opacity", (link) => (link.target_type === "wikilink" ? 0.7 : 0.5));
    onSelectionChange(null);
  }

  function applySelection(nodeId: string, focus: boolean) {
    const selectedNode = nodeById.get(nodeId);
    if (!selectedNode) {
      clearSelection();
      return;
    }

    selectedNodeId = nodeId;
    const neighbors = neighborMap.get(nodeId) || new Set([nodeId]);

    nodeSelection.attr("opacity", (node) => (neighbors.has(node.id) ? 0.98 : 0.12));
    labelSelection.attr("opacity", (node) => (neighbors.has(node.id) ? 1 : 0.18));
    linkSelection.attr("stroke-opacity", (link) => {
      const sourceId = getNodeId(link.source);
      const targetId = getNodeId(link.target);
      const isAdjacent = sourceId === nodeId || targetId === nodeId;
      if (isAdjacent) {
        return link.target_type === "wikilink" ? 0.88 : 0.68;
      }
      return 0.08;
    });

    onSelectionChange(nodeId);

    if (focus) {
      focusNode(selectedNode);
    }
  }

  svg.call(
    zoom.transform,
    d3.zoomIdentity.translate(width / 2, height / 2).scale(1.22).translate(-width / 2, -height / 2),
  );

  clearSelection();

  return {
    destroy() {
      simulation.stop();
      svg.interrupt();
      svg.on(".zoom", null);
      svg.selectAll("*").remove();
    },
    clearSelection,
    selectNodeById(nodeId: string) {
      if (selectedNodeId === nodeId) {
        clearSelection();
        return;
      }
      applySelection(nodeId, true);
    },
  };
}

function getRelatedThemes(selectedNode: GraphNode, links: GraphLink[], nodeById: Map<string, GraphNode>) {
  const explicitRelated = Array.isArray(selectedNode.related_themes)
    ? selectedNode.related_themes.filter((item) => item && item.id && item.is_theme_page)
    : [];

  if (explicitRelated.length) {
    return explicitRelated;
  }

  const relatedItems: Array<{ id: string; label: string; is_theme_page: boolean }> = [];
  const seen = new Set<string>();

  links.forEach((link) => {
    if (link.source !== selectedNode.id && link.target !== selectedNode.id) {
      return;
    }

    const otherId = link.source === selectedNode.id ? link.target : link.source;
    if (!otherId || otherId === selectedNode.id || seen.has(otherId)) {
      return;
    }

    const otherNode = nodeById.get(otherId);
    if (!otherNode?.is_theme_page) {
      return;
    }

    seen.add(otherId);
    relatedItems.push({
      id: otherNode.id,
      label: otherNode.label,
      is_theme_page: true,
    });
  });

  return relatedItems;
}

function GraphCompanyCard({
  company,
  companyBasePath,
}: {
  company: GraphCompany;
  companyBasePath: "/companies" | "/app/companies";
}) {
  const companyHref = company.ticker
    ? (`${companyBasePath}/${encodeURIComponent(company.ticker)}` as Route)
    : null;

  return (
    <article className="rounded-lg border border-[rgba(65,65,65,0.8)] bg-[rgba(20,20,20,0.96)] px-3 pb-3 pt-2.5 shadow-[inset_0_4px_14px_rgba(0,0,0,0.16)]">
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[10px]">
        <span className="inline-flex min-w-[52px] items-center justify-center rounded-full border border-[rgba(250,255,105,0.28)] bg-[rgba(250,255,105,0.06)] px-2 py-1 font-mono text-sm font-bold leading-[1.2] text-[var(--accent)]">
          {company.ticker || "-"}
        </span>
        <div className="min-w-0 break-words text-base font-semibold leading-[1.45]">
          {company.company_name || ""}
        </div>
        {companyHref ? (
          <Link
            href={companyHref}
            prefetch={false}
            aria-label={`Open ${company.ticker} ${company.company_name} company page`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(250,255,105,0.24)] bg-[rgba(250,255,105,0.03)] font-mono text-lg font-bold leading-none text-[var(--accent)] transition-[transform,border-color,background-color,color] duration-150 hover:-translate-y-px hover:border-[var(--accent)] hover:bg-[rgba(250,255,105,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(20,20,20,0.96)]"
            title={`Open ${company.ticker}`}
          >
            &gt;
          </Link>
        ) : (
          <span className="block h-9 w-9" aria-hidden="true" />
        )}
      </div>
    </article>
  );
}

export function GraphPageClient() {
  const pathname = usePathname();
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rendererRef = useRef<RendererHandle | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("graph-route-locked");
    document.body.classList.add("graph-route-locked");

    return () => {
      document.documentElement.classList.remove("graph-route-locked");
      document.body.classList.remove("graph-route-locked");
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGraph() {
      setIsLoading(true);
      setError(null);
      try {
        const nextGraphData = await getThemeGraphData({ signal: controller.signal });
        setGraphData(nextGraphData);
      } catch (loadError) {
        if ((loadError as Error).name !== "AbortError") {
          setError((loadError as Error).message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadGraph();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!graphData || !svgRef.current) {
      return;
    }

    rendererRef.current?.destroy();
    rendererRef.current = buildRenderer({
      graph: graphData.graph,
      svgElement: svgRef.current,
      onSelectionChange: setSelectedNodeId,
    });

    return () => {
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [graphData]);

  const nodeById = new Map((graphData?.graph.nodes || []).map((node) => [node.id, node]));
  const companyThemeById = new Map(
    (graphData?.company_map.themes || []).map((theme) => [theme.id, theme]),
  );
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) || null : null;
  const selectedCompanyTheme = selectedNodeId ? companyThemeById.get(selectedNodeId) || null : null;
  const relatedThemes =
    selectedNode && graphData ? getRelatedThemes(selectedNode, graphData.graph.links, nodeById) : [];
  const isAppRoute = pathname === "/app/graph" || pathname.startsWith("/app/");
  const companyBasePath = isAppRoute ? "/app/companies" : "/companies";

  return (
    <div className={styles.page}>
      <section className={styles.viewport}>
        <aside className="absolute left-4 top-10 z-[2] grid w-[min(400px,calc(100vw-72px))] gap-3 bg-transparent p-0 max-[960px]:w-[min(340px,calc(100vw-48px))] max-[660px]:right-4 max-[660px]:w-auto">
          <Link className="back-link justify-self-start" href="/">
            BACK TO HOME
          </Link>
          <h1 className="m-0 text-[30px] font-black leading-none tracking-[-0.04em]">
            Theme Graph
          </h1>
          <p className="m-0 text-[13px] leading-[1.65] text-[var(--muted)] max-[660px]:hidden">
            Explore theme relationships and the related-company clusters derived from the existing
            graph JSON assets.
          </p>
        </aside>

        <aside
          className={`${OVERLAY_PANEL_CLASS} right-4 top-4 min-w-[248px] p-[14px_16px_16px] max-[960px]:w-[min(340px,calc(100vw-48px))] max-[660px]:hidden`}
        >
          <h2 className={OVERLAY_TITLE_CLASS}>Stats</h2>
          <div className="grid gap-[10px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs leading-[1.4] text-[var(--muted)]">Nodes</span>
              <span className="font-mono text-sm font-bold text-[var(--accent)]">
                {graphData?.graph.node_counts.total ?? "-"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs leading-[1.4] text-[var(--muted)]">Themes</span>
              <span className="font-mono text-sm font-bold text-[var(--accent)]">
                {graphData?.graph.node_counts.themes ?? "-"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs leading-[1.4] text-[var(--muted)]">Supplemental</span>
              <span className="font-mono text-sm font-bold text-[var(--accent)]">
                {graphData?.graph.node_counts.supplemental_themes ?? "-"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs leading-[1.4] text-[var(--muted)]">Links</span>
              <span className="font-mono text-sm font-bold text-[var(--accent)]">
                {graphData?.graph.links.length ?? "-"}
              </span>
            </div>
          </div>
        </aside>

        {error ? (
          <aside
            className={`${OVERLAY_PANEL_CLASS} left-1/2 top-4 w-[min(520px,calc(100vw-72px))] -translate-x-1/2 p-[14px_16px] text-[var(--danger)] max-[660px]:left-4 max-[660px]:right-4 max-[660px]:top-[120px] max-[660px]:w-auto max-[660px]:translate-x-0`}
          >
            Failed to load graph data: {error}
          </aside>
        ) : null}

        <svg ref={svgRef} className={styles.canvas} aria-label="theme graph" />

        <aside
          className={`${OVERLAY_PANEL_CLASS} ${styles.scrollPanel} bottom-4 left-4 w-[min(560px,calc(100vw-72px))] max-h-[min(64vh,660px)] overflow-auto p-[14px_14px_18px] max-[960px]:w-[min(500px,calc(100vw-48px))] max-[660px]:left-4 max-[660px]:right-4 max-[660px]:w-auto max-[660px]:max-h-[calc(100vh/3)]`}
        >
          <h2 className={OVERLAY_TITLE_CLASS}>Related Companies</h2>
          {isLoading ? (
            <div className={MUTED_CLASS}>Loading graph data...</div>
          ) : selectedNode ? (
            <>
              <h3 className="m-0 text-[20px] font-extrabold leading-[1.2]">{selectedNode.label}</h3>
              {selectedCompanyTheme ? (
                ROLE_ORDER.map((role) => {
                  const roleGroup = selectedCompanyTheme.companies_by_role[role];
                  if (!roleGroup?.companies.length) {
                    return null;
                  }

                  return (
                    <section className={SECTION_CLASS} key={role}>
                      <h4 className={SECTION_TITLE_CLASS}>{roleGroup.label_en}</h4>
                      <div className="grid grid-cols-2 gap-[10px] max-[660px]:grid-cols-1">
                        {roleGroup.companies.map((company) => (
                          <GraphCompanyCard
                            key={`${role}-${company.ticker}-${company.company_name}`}
                            company={company}
                            companyBasePath={companyBasePath}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })
              ) : (
                <div className={SECTION_CLASS}>
                  <div className={MUTED_CLASS}>No company mapping is available for this theme.</div>
                </div>
              )}
            </>
          ) : (
            <div className={MUTED_CLASS}>Select a node to inspect its related companies.</div>
          )}
        </aside>

        <aside
          className={`${OVERLAY_PANEL_CLASS} ${styles.scrollPanel} bottom-4 right-4 w-[min(380px,calc(100vw-72px))] max-h-[min(52vh,420px)] overflow-auto p-[14px_16px_16px] max-[660px]:hidden`}
        >
          <h2 className={OVERLAY_TITLE_CLASS}>Details</h2>
          {isLoading ? (
            <div className={MUTED_CLASS}>Loading graph data...</div>
          ) : selectedNode ? (
            <>
              <h3 className="mb-[6px] mt-0 text-[19px] font-extrabold leading-[1.35]">
                {selectedNode.label}
              </h3>
              {selectedNode.note ? (
                <div className="mt-[14px] border border-[rgba(250,255,105,0.22)] border-l-[3px] border-l-[var(--accent)] bg-[rgba(20,20,20,0.96)] px-[14px] py-3 text-sm leading-[1.75] text-[var(--text)] shadow-[inset_0_4px_18px_rgba(0,0,0,0.18)]">
                  {selectedNode.note}
                </div>
              ) : (
                <div className={MUTED_CLASS}>No note is available for this node.</div>
              )}

              <section className={SECTION_CLASS}>
                <h4 className={SECTION_TITLE_CLASS}>Related Themes</h4>
                {relatedThemes.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {relatedThemes.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        className="rounded-full border border-[rgba(65,65,65,0.8)] bg-[rgba(20,20,20,0.96)] px-3 py-2 text-xs text-[var(--text)] transition-[border-color,color,background-color,transform] duration-150 hover:-translate-y-px hover:border-[var(--accent)] hover:bg-[rgba(250,255,105,0.06)] hover:text-[var(--accent)]"
                        onClick={() => rendererRef.current?.selectNodeById(theme.id)}
                      >
                        {theme.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={MUTED_CLASS}>No related themes are available for this node.</div>
                )}
              </section>
            </>
          ) : (
            <div className={MUTED_CLASS}>Select a node to inspect its note and related themes.</div>
          )}
        </aside>
      </section>
    </div>
  );
}
