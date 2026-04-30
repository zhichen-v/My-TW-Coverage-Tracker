"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import { translateHomepage } from "@/lib/i18n";
import { getAppHref, getPublicHref } from "@/lib/routes";

export function ShellHeader() {
  const { t, language, switchLanguage } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const marketOverviewLabel = translateHomepage(language, "marketOverviewTitle");
  const menuButtonLabel =
    language === "zh-Hant"
      ? isMobileMenuOpen
        ? "關閉導覽選單"
        : "開啟導覽選單"
      : isMobileMenuOpen
        ? "Close navigation menu"
        : "Open navigation menu";

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [language]);

  return (
    <header className="px-1 py-2 sm:px-0 sm:py-3">
      <div className="flex items-center gap-3 md:hidden">
        <button
          type="button"
          aria-label={menuButtonLabel}
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((current) => !current)}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] text-[var(--text-strong)]"
        >
          <span className="sr-only">{menuButtonLabel}</span>
          <span className="flex flex-col gap-[4px]">
            <span
              className={`block h-[2px] w-5 rounded-full bg-[var(--accent)] transition-transform duration-250 ease-out motion-reduce:transition-none ${
                isMobileMenuOpen ? "translate-y-[6px] rotate-45" : ""
              }`}
            />
            <span
              className={`block h-[2px] w-5 rounded-full bg-[var(--accent)] transition-opacity duration-200 ease-out motion-reduce:transition-none ${
                isMobileMenuOpen ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block h-[2px] w-5 rounded-full bg-[var(--accent)] transition-transform duration-250 ease-out motion-reduce:transition-none ${
                isMobileMenuOpen ? "-translate-y-[6px] -rotate-45" : ""
              }`}
            />
          </span>
        </button>

        <Link href={getPublicHref("/")} className="min-w-0 flex-1">
          <span className="brand-mark text-[0.62rem]">
            Taiwan Equity Coverage
          </span>
          <span
            className="mt-1.5 block truncate text-[1.28rem] font-black leading-none tracking-[-0.08em] text-[var(--text-strong)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Stocks Tracker
          </span>
        </Link>

        <div
          className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--bg-elevated)] p-1"
          aria-label={t("language")}
        >
          <button
            type="button"
            onClick={() => switchLanguage("zh-Hant")}
            className={`min-w-[52px] rounded-full px-3 py-2 text-[0.72rem] font-bold uppercase tracking-[0.1em] ${
              language === "zh-Hant"
                ? "border border-[var(--accent)] bg-[var(--accent)] text-[#151515]"
                : "border border-transparent text-[var(--muted)]"
            }`}
          >
            繁中
          </button>
          <button
            type="button"
            onClick={() => switchLanguage("en")}
            className={`min-w-[52px] rounded-full px-3 py-2 text-[0.72rem] font-bold uppercase tracking-[0.1em] ${
              language === "en"
                ? "border border-[var(--accent)] bg-[var(--accent)] text-[#151515]"
                : "border border-transparent text-[var(--muted)]"
            }`}
          >
            EN
          </button>
        </div>
      </div>

      <div
        aria-hidden={!isMobileMenuOpen}
        className={`grid overflow-hidden transition-[grid-template-rows,opacity,transform,margin] duration-300 ease-out motion-reduce:transition-none md:hidden ${
          isMobileMenuOpen
            ? "mt-4 translate-y-0 opacity-100 [grid-template-rows:1fr]"
            : "mt-0 -translate-y-2 opacity-0 [grid-template-rows:0fr] pointer-events-none"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-[var(--line)] pt-4">
            <nav aria-label="Primary" className="grid gap-2">
              <Link
                href={getAppHref("/")}
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-3 text-sm font-semibold text-[var(--text-strong)]"
              >
                <span>{marketOverviewLabel}</span>
                <span className="font-mono text-[var(--accent)]">&gt;</span>
              </Link>
              <Link
                href={getAppHref("/graph")}
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-3 text-sm font-semibold text-[var(--text-strong)]"
              >
                <span>{t("themesGraph")}</span>
                <span className="font-mono text-[var(--accent)]">&gt;</span>
              </Link>
            </nav>
          </div>
        </div>
      </div>

      <div className="hidden items-end justify-between gap-6 md:flex">
        <div className="flex min-w-0 items-end gap-8 lg:gap-24">
          <Link href={getPublicHref("/")} className="min-w-0">
            <span className="brand-mark text-[0.7rem]">
              Taiwan Equity Coverage
            </span>
            <span
              className="mt-2 block text-[clamp(1.95rem,2.4vw,2.7rem)] font-black leading-[0.94] tracking-[-0.08em] text-[var(--text-strong)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Stocks Tracker
            </span>
          </Link>

          <nav aria-label="Primary" className="topbar-nav pb-1">
            <Link href={getAppHref("/")} className="topbar-link">
              {marketOverviewLabel}
            </Link>
            <Link href={getAppHref("/graph")} className="topbar-link">
              {t("themesGraph")}
            </Link>
          </nav>
        </div>

        <div
          className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--bg-elevated)] p-1"
          aria-label={t("language")}
        >
          <button
            type="button"
            onClick={() => switchLanguage("zh-Hant")}
            className={`min-w-[68px] rounded-full px-4 py-2 text-[0.74rem] font-bold uppercase tracking-[0.1em] ${
              language === "zh-Hant"
                ? "border border-[var(--accent)] bg-[var(--accent)] text-[#151515]"
                : "border border-transparent text-[var(--muted)] hover:text-[var(--accent)]"
            }`}
          >
            繁中
          </button>
          <button
            type="button"
            onClick={() => switchLanguage("en")}
            className={`min-w-[68px] rounded-full px-4 py-2 text-[0.74rem] font-bold uppercase tracking-[0.1em] ${
              language === "en"
                ? "border border-[var(--accent)] bg-[var(--accent)] text-[#151515]"
                : "border border-transparent text-[var(--muted)] hover:text-[var(--accent)]"
            }`}
          >
            EN
          </button>
        </div>
      </div>
    </header>
  );
}
