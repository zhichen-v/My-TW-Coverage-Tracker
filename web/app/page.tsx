import { PublicHomePageClient } from "@/components/public-home-page-client";
import { getCompanies, getHealth, getSectors, getThemeGraphData } from "@/lib/api";

export const revalidate = 60;

export default async function Home() {
  const [health, sectors, popularCompanies, graphData] = await Promise.all([
    getHealth(),
    getSectors(),
    getCompanies({ sort: "market_cap_desc", limit: 5 }),
    getThemeGraphData(),
  ]);

  return (
    <PublicHomePageClient
      health={health}
      sectors={sectors}
      popularCompanies={popularCompanies.items}
      graphData={graphData}
    />
  );
}
