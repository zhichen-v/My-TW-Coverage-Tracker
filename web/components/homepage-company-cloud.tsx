"use client";

import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";

export type HomepageCompanyCloudNode = {
  rank: number;
  ticker: string;
  title: string;
  companyName: string;
  sector: string;
  marketCapText: string;
  reportId: string;
  x: number;
  y: number;
  r: number;
  color: string;
  fillOpacity: number;
  strokeOpacity: number;
  tickerFontSize: number;
  titleFontSize: number;
  titleLabel: string;
  showTitle: boolean;
};

type ZoomView = [number, number, number];

const VIEWBOX_SIZE = 1000;
const OVERVIEW: ZoomView = [500, 500, 1040];
const TOUR_RANKS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

function getNodeView(node: HomepageCompanyCloudNode): ZoomView {
  return [node.x, node.y, Math.max(80, node.r * 4.8)];
}

export function HomepageCompanyCloud({ companies }: { companies: HomepageCompanyCloudNode[] }) {
  const countLabel = companies.length.toLocaleString("en-US");
  const groupRef = useRef<SVGGElement | null>(null);
  const currentViewRef = useRef<ZoomView>(OVERVIEW);
  const tourNodes = useMemo(() => {
    const byRank = new Map(companies.map((company) => [company.rank, company]));
    const featured = TOUR_RANKS.map((rank) => byRank.get(rank)).filter(
      (company): company is HomepageCompanyCloudNode => Boolean(company),
    );
    const remaining = companies.filter((company) => !TOUR_RANKS.includes(company.rank));

    return [...featured, ...remaining];
  }, [companies]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || !tourNodes.length) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timeoutId = 0;
    let index = 0;
    const selection = d3.select(group);

    function zoomTo(view: ZoomView) {
      currentViewRef.current = view;
      const scale = VIEWBOX_SIZE / view[2];
      selection.attr(
        "transform",
        `translate(${VIEWBOX_SIZE / 2 - view[0] * scale} ${VIEWBOX_SIZE / 2 - view[1] * scale}) scale(${scale})`,
      );
    }

    function scheduleNext(delay = 650) {
      if (reduceMotion) {
        return;
      }

      timeoutId = window.setTimeout(() => {
        const nextNode = tourNodes[index % tourNodes.length];
        index += 1;
        const nextView = index % 7 === 0 ? OVERVIEW : getNodeView(nextNode);
        const interpolator = d3.interpolateZoom(currentViewRef.current, nextView);
        const duration = Math.max(2500, Math.min(6000, interpolator.duration * 1.5));

        selection
          .transition("homepage-company-cloud-zoom")
          .duration(duration)
          .ease(d3.easeCubicInOut)
          .tween("zoom", () => (time) => {
            zoomTo(interpolator(time) as ZoomView);
          })
          .on("end", () => scheduleNext(nextView === OVERVIEW ? 950 : 620));
      }, delay);
    }

    zoomTo(OVERVIEW);
    scheduleNext(800);

    return () => {
      window.clearTimeout(timeoutId);
      selection.interrupt("homepage-company-cloud-zoom");
    };
  }, [tourNodes]);

  return (
    <div className="pointer-events-none relative w-[580px] h-[480px] justify-self-end overflow-hidden max-[1180px]:justify-self-center max-[640px]:w-full max-[640px]:h-auto max-[640px]:aspect-[580/480] /* 新增內容 */ rounded-[96px] [mask-image:radial-gradient(black_25%,transparent_100%)]">
      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full"
        role="img"
        aria-label={`Top ${countLabel} company static node cloud`}
      >
        <rect width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} fill="transparent" />
        <g ref={groupRef}>
          {companies.map((company) => (
            <g key={company.ticker} transform={`translate(${company.x} ${company.y})`}>
              <circle
                r={company.r}
                fill={company.color}
                fillOpacity={company.fillOpacity}
                stroke={company.color}
                strokeOpacity={company.strokeOpacity}
                strokeWidth={company.rank <= 12 ? 2.4 : 1.55}
              />
              <text
                y={company.showTitle ? -company.r * 0.12 : 0}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={company.rank <= 12 ? "var(--accent)" : "rgba(250,255,105,0.9)"}
                fontFamily="var(--font-mono)"
                fontSize={company.tickerFontSize}
                fontWeight={900}
              >
                {company.ticker}
              </text>
              {company.showTitle ? (
                <text
                  y={company.r * 0.26}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(255,255,255,0.82)"
                  fontFamily="var(--font-sans)"
                  fontSize={company.titleFontSize}
                  fontWeight={750}
                >
                  {company.titleLabel}
                </text>
              ) : null}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
