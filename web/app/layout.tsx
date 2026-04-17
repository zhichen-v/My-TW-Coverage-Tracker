import { defaultLanguage } from "@/lib/i18n";
import { LanguageProvider } from "@/components/language-provider";
import { SiteHeader } from "@/components/site-header";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My TW Coverage",
  description: "Public browsing interface for Taiwan-listed company coverage reports.",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
    date: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={defaultLanguage}>
      <body>
        <LanguageProvider>
          <div className="site-shell">
            <SiteHeader />
            {children}
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
