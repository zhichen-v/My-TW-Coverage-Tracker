import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "My TW Coverage",
  description: "Public browsing interface for Taiwan-listed company coverage reports.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>
        <div className="site-shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <span className="brand-mark">Taiwan Equity Coverage</span>
              <span className="brand-title">My TW Coverage</span>
            </Link>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
