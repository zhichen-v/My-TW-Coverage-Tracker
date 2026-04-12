import { getCompanyByTicker } from "@/lib/api";
import { CompanyPageClient } from "@/components/company-page-client";

type CompanyPageProps = {
  params: Promise<{
    ticker: string;
  }>;
};

export default async function CompanyPage({ params }: CompanyPageProps) {
  const { ticker } = await params;
  const response = await getCompanyByTicker(ticker);
  const primary = response.items[0];

  return <CompanyPageClient primary={primary} count={response.count} ticker={ticker} />;
}
