"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/language-provider";

export function SiteHeader() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const themesGraphLabel =
    language === "zh-Hant" ? "\u79d1\u6280\u6982\u5ff5\u5716\u8b5c" : "Themes Graph";

  if (pathname === "/graph") {
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
          {themesGraphLabel}
        </Link>
      </nav>
    </header>
  );
}
