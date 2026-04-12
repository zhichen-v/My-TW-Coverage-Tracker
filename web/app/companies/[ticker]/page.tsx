import { getCompanyByTicker } from "@/lib/api";
import { CompanyPageClient } from "@/components/company-page-client";
import { notFound } from "next/navigation";

type CompanyPageProps = {
  params: Promise<{
    ticker: string;
  }>;
};

export default async function CompanyPage({ params }: CompanyPageProps) {
  const { ticker } = await params;
  const response = await getCompanyByTicker(ticker);
  const primary = response.items[0];

  if (!primary) {
    notFound();
  }

  return <CompanyPageClient primary={primary} count={response.count} ticker={ticker} />;
}
