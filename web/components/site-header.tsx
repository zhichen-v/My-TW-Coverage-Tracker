"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/language-provider";

export function SiteHeader() {
  const pathname = usePathname();
  const { t } = useLanguage();

  if (pathname === "/" || pathname === "/graph" || pathname.startsWith("/companies/")) {
    return null;
  }

  return (
    <header className="topbar">
      <Link className="brand" href="/">
        <span className="brand-mark">Taiwan Equity Coverage</span>
        <span className="brand-title">Stocks Tracker</span>
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
