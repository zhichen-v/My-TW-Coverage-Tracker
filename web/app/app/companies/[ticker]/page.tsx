import { CompanyPageClient } from "@/components/company-page-client";
import { getCompanyByTicker } from "@/lib/api";
import { notFound } from "next/navigation";

type AppCompanyPageProps = {
  params: Promise<{
    ticker: string;
  }>;
};

export default async function AppCompanyPage({ params }: AppCompanyPageProps) {
  const { ticker } = await params;
  const response = await getCompanyByTicker(ticker);
  const primary = response.items[0];

  if (!primary) {
    notFound();
  }

  return <CompanyPageClient primary={primary} count={response.count} ticker={ticker} />;
}
