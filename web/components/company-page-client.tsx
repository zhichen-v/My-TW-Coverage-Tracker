"use client";

import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import type {
  CompanyDetail,
  StructuredContentBlock,
  StructuredInlineSegment,
  StructuredContentSection,
} from "@/lib/api";
import {
  getFinancialTermDescription,
  translateFinancialText,
} from "@/lib/financial-markdown";
import { translateSectorName, type SupportedLanguage } from "@/lib/i18n";
import { useLanguage } from "@/components/language-provider";
import { ShellHeader } from "@/components/shell-header";

type CompanyPageClientProps = {
  primary: CompanyDetail;
  count: number;
  ticker: string;
};

function renderInlineSegments(
  segments: StructuredInlineSegment[],
  transformText?: (text: string) => string,
): ReactNode {
  return segments.map((segment, segmentIndex) => {
    const content = transformText ? transformText(segment.text) : segment.text;
    const lines = content.split("\n");

    return (
      <Fragment key={`segment-${segmentIndex}`}>
        {lines.map((line, lineIndex) => {
          const renderedLine =
            segment.type === "strong" ? <strong>{line}</strong> : line;

          return (
            <Fragment key={`line-${segmentIndex}-${lineIndex}`}>
              {renderedLine}
              {lineIndex < lines.length - 1 ? <br /> : null}
            </Fragment>
          );
        })}
      </Fragment>
    );
  });
}

type SnapshotValueKind = "sector" | "industry" | "marketCap" | "enterpriseValue";

function translateSnapshotValue(
  value: string,
  kind: SnapshotValueKind,
  language: SupportedLanguage,
) {
  if (!value) {
    return value;
  }

  if (kind === "sector" || kind === "industry") {
    return translateSectorName(language, value);
  }

  return translateFinancialText(value, language);
}

function FinancialTerm({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({
    left: 0,
    top: 0,
    visibility: "hidden",
  });

  useEffect(() => {
    if (!isTooltipOpen) {
      return;
    }

    function updateTooltipPosition() {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;

      if (!trigger || !tooltip) {
        return;
      }

      const viewportPadding = 16;
      const tooltipOffset = 10;
      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      const nextLeft = Math.min(
        Math.max(triggerRect.left, viewportPadding),
        Math.max(viewportPadding, window.innerWidth - tooltipRect.width - viewportPadding),
      );

      const fitsBelow =
        triggerRect.bottom + tooltipOffset + tooltipRect.height + viewportPadding <=
        window.innerHeight;
      const nextTop = fitsBelow
        ? triggerRect.bottom + tooltipOffset
        : Math.max(viewportPadding, triggerRect.top - tooltipRect.height - tooltipOffset);

      setTooltipStyle({
        left: nextLeft,
        top: nextTop,
        visibility: "visible",
      });
    }

    updateTooltipPosition();

    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);

    return () => {
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [description, isTooltipOpen]);

  return (
    <span
      ref={triggerRef}
      className="financial-term"
      tabIndex={0}
      aria-describedby={isTooltipOpen ? tooltipId : undefined}
      onMouseEnter={() => setIsTooltipOpen(true)}
      onMouseLeave={() => setIsTooltipOpen(false)}
      onFocus={() => setIsTooltipOpen(true)}
      onBlur={() => setIsTooltipOpen(false)}
    >
      <span className="financial-term-label">{label}</span>
      {isTooltipOpen && typeof document !== "undefined"
        ? createPortal(
            <span
              id={tooltipId}
              ref={tooltipRef}
              className="financial-term-tooltip financial-term-tooltip-visible"
              role="tooltip"
              style={tooltipStyle}
            >
              {description}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

function DetailBlock({
  index,
  title,
  section,
  isFinancial = false,
}: {
  index: number;
  title: string;
  section?: StructuredContentSection;
  isFinancial?: boolean;
}) {
  const { t, language } = useLanguage();
  const hasStructuredContent = Boolean(
    section && (section.blocks.length > 0 || section.groups.length > 0),
  );

  function translateText(text: string) {
    return isFinancial ? translateFinancialText(text, language) : text;
  }

  function renderSegments(segments: StructuredInlineSegment[]) {
    return renderInlineSegments(segments, translateText);
  }

  function renderFinancialTerm(value: string) {
    const text = value.trim();
    const description = getFinancialTermDescription(text, language);

    if (!description) {
      return text || "\u00A0";
    }

    return <FinancialTerm label={text} description={description} />;
  }

  function renderBlock(block: StructuredContentBlock, blockIndex: number) {
    if (block.type === "paragraph" && block.segments?.length) {
      return (
        <p className="structured-paragraph" key={`paragraph-${blockIndex}`}>
          {renderSegments(block.segments)}
        </p>
      );
    }

    if (block.type === "list" && block.items?.length) {
      return (
        <ul className="structured-list" key={`list-${blockIndex}`}>
          {block.items.map((item, itemIndex) => (
            <li className="structured-list-item" key={`item-${itemIndex}`}>
              {renderSegments(item.segments)}
            </li>
          ))}
        </ul>
      );
    }

    if (block.type === "table" && block.columns?.length) {
      const columns = block.columns.map((column) => translateText(column).trim());
      const rows = (block.rows ?? []).map((row) =>
        row.map((cell) => translateText(cell).trim()),
      );

      return (
        <div className="structured-table-wrap" key={`table-${blockIndex}`}>
          <table className="structured-table">
            <thead>
              <tr>
                {columns.map((column, columnIndex) => (
                  <th key={`column-${columnIndex}`}>{renderFinancialTerm(column)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`cell-${rowIndex}-${cellIndex}`}>
                      {renderFinancialTerm(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return null;
  }

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] px-6 py-6 shadow-[var(--shadow-soft)] max-[780px]:px-5 max-[780px]:py-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="font-mono text-[0.78rem] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
          {String(index).padStart(2, "0")}
        </span>
        <h2 className="m-0 font-[var(--font-display)] text-[1.24rem] font-extrabold tracking-[-0.03em] text-[var(--text-strong)]">
          {title}
        </h2>
      </div>
      <div className="structured-body">
        {hasStructuredContent ? (
          <>
            {section?.blocks.map((block, blockIndex) => renderBlock(block, blockIndex))}
            {section?.groups.map((group, groupIndex) => (
              <div className="structured-group" key={`${group.title}-${groupIndex}`}>
                <h3 className="structured-group-title">{translateText(group.title)}</h3>
                {group.blocks.map((block, blockIndex) =>
                  renderBlock(block, groupIndex * 100 + blockIndex),
                )}
              </div>
            ))}
          </>
        ) : (
          <p className="structured-empty">{t("noData")}</p>
        )}
      </div>
    </section>
  );
}

function CompanyPageContent({ primary, count, ticker }: CompanyPageClientProps) {
  const { t, language } = useLanguage();
  const snapshotItems = [
    {
      label: t("sector"),
      value:
        translateSnapshotValue(primary.metadata_sector, "sector", language) ||
        t("notAvailable"),
    },
    {
      label: t("industry"),
      value:
        translateSnapshotValue(primary.metadata_industry, "industry", language) ||
        t("notAvailable"),
    },
    {
      label: t("marketCap"),
      value:
        translateSnapshotValue(primary.market_cap_text, "marketCap", language) ||
        t("notAvailable"),
    },
    {
      label: t("enterpriseValue"),
      value:
        translateSnapshotValue(primary.enterprise_value_text, "enterpriseValue", language) ||
        t("notAvailable"),
    },
  ];
  const sections = [
    {
      title: t("businessOverview"),
      section: primary.structured_content?.sections.overview,
    },
    {
      title: t("supplyChain"),
      section: primary.structured_content?.sections.supply_chain,
    },
    {
      title: t("customersAndSuppliers"),
      section: primary.structured_content?.sections.customer_supplier,
    },
    {
      title: t("financialTables"),
      section: primary.structured_content?.sections.financials,
      isFinancial: true,
    },
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ShellHeader />

      <div className="flex items-center justify-start">
        <Link
          className="inline-flex items-center gap-2 font-mono text-[0.88rem] font-bold uppercase tracking-[0.12em] text-[var(--muted-strong)] transition hover:text-[var(--accent)]"
          href="/app"
        >
          <span className="text-[var(--accent)]">&lt;</span>
          BACK TO APP
        </Link>
      </div>

      {count > 1 ? (
        <section className="relative mb-5 w-full overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] px-6 py-5 text-[var(--muted-strong)] shadow-[var(--shadow-soft)] max-[780px]:px-5 max-[780px]:py-4">
          {t("multipleReports")} ({ticker})
        </section>
      ) : null}

      <div className="grid gap-[18px]">
        <aside className="relative self-start overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface)] px-6 py-6 shadow-[var(--shadow-soft)] max-[780px]:px-5 max-[780px]:py-5">
          <div className="mb-[18px] flex items-center justify-between gap-3">
            <p className="m-0 text-[0.82rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              {t("companySnapshot")}
            </p>
          </div>
          <div className="mb-[22px] grid justify-items-start gap-[14px] [grid-template-areas:'ticker''title'] max-[640px]:grid-cols-[max-content_max-content] max-[640px]:grid-rows-[auto] max-[640px]:items-end max-[640px]:justify-start max-[640px]:gap-x-[14px] max-[640px]:gap-y-0 max-[640px]:[grid-template-areas:'title_ticker']">
            <h1 className="[grid-area:title] m-0 font-[var(--font-display)] text-[clamp(2.4rem,5vw,4.4rem)] font-black leading-[0.92] tracking-[-0.08em] text-[var(--text-strong)] max-[640px]:text-left max-[640px]:text-[clamp(2.7rem,11vw,3.45rem)]">
              {primary.company_name}
            </h1>
            <span className="[grid-area:ticker] inline-flex min-w-0 items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[rgba(22,22,0,0.55)] px-3 py-[7px] font-mono text-[0.74rem] font-bold uppercase tracking-[0.08em] text-[var(--accent-strong)] before:content-['>'] before:text-[var(--accent)] max-[640px]:justify-self-start max-[640px]:self-end max-[640px]:border-0 max-[640px]:bg-transparent max-[640px]:p-0 max-[640px]:font-[var(--font-display)] max-[640px]:text-[clamp(2.15rem,8.8vw,2.95rem)] max-[640px]:font-black max-[640px]:normal-case max-[640px]:leading-[0.88] max-[640px]:tracking-[-0.08em] max-[640px]:before:content-none">
              {primary.ticker}
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
            {snapshotItems.map((item) => (
              <div
                className="flex flex-col items-start gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-[14px]"
                key={item.label}
              >
                <span className="text-[0.8rem] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {item.label}
                </span>
                <span className="break-words text-[0.98rem] font-semibold leading-[1.45] text-[var(--text-strong)]">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </aside>

        <main className="grid gap-4">
          {sections.map((section, index) => (
            <DetailBlock
              key={section.title}
              index={index + 1}
              title={section.title}
              section={section.section}
              isFinancial={section.isFinancial}
            />
          ))}
        </main>
      </div>
    </div>
  );
}

export function CompanyPageClient(props: CompanyPageClientProps) {
  return <CompanyPageContent {...props} />;
}
