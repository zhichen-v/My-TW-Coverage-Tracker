"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/language-provider";

export function SiteHeader() {
  const pathname = usePathname();
  const { t } = useLanguage();

  if (
    pathname === "/" ||
    pathname === "/app" ||
    pathname === "/graph" ||
    pathname === "/app/graph" ||
    pathname.startsWith("/companies/") ||
    pathname.startsWith("/app/companies/")
  ) {
    return null;
  }

  return (
    <header className="mb-5 flex items-end justify-start gap-16 py-4 max-[640px]:flex-col max-[640px]:items-stretch">
      <Link className="inline-flex min-w-0 flex-col gap-1.5" href="/">
        <span className="brand-mark">Taiwan Equity Coverage</span>
        <span className="text-[clamp(1.9rem,2.2vw,2.4rem)] font-black leading-[0.94] tracking-[-0.08em] text-[var(--text-strong)]">
          Stocks Tracker
        </span>
      </Link>

      <nav className="topbar-nav" aria-label="Primary">
        <Link
          className={`topbar-link ${pathname === "/graph" ? "active" : ""}`}
          href="/graph"
        >
          {t("themesGraph")}
        </Link>
      </nav>
    </header>
  );
}
