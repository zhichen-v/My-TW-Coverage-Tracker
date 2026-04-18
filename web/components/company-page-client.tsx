"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
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
  return (
    <span className="financial-term" tabIndex={0}>
      <span className="financial-term-label">{label}</span>
      <span className="financial-term-tooltip" role="tooltip">
        {description}
      </span>
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
    <section className="panel detail-block detail-panel-shell">
      <div className="section-header">
        <span className="section-index">{String(index).padStart(2, "0")}</span>
        <h2>{title}</h2>
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
        <Link className="back-link" href="/">
          {t("backToList")}
        </Link>
      </div>

      {count > 1 ? (
        <section className="panel content-panel detail-panel-shell" style={{ marginBottom: 20 }}>
          {t("multipleReports")} ({ticker})
        </section>
      ) : null}

      <div className="detail-layout">
        <aside className="panel detail-sidebar sticky-panel detail-panel-shell">
          <div className="panel-header">
            <p className="eyebrow">{t("companySnapshot")}</p>
          </div>
          <div className="detail-header detail-header-inline">
            <h1 className="detail-title">{primary.company_name}</h1>
            <span className="ticker-chip">{primary.ticker}</span>
          </div>
          <div className="detail-meta">
            {snapshotItems.map((item) => (
              <div className="meta-row" key={item.label}>
                <span className="meta-label">{item.label}</span>
                <span className="meta-value">{item.value}</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="detail-main">
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
