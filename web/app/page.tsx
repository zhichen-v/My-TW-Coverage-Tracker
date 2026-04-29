import { PublicHomePageClient } from "@/components/public-home-page-client";
import { getCompanies, getHealth, getSectors } from "@/lib/api";
import homepageCompanyCloudData from "@/src/data/homepage-company-cloud-nodes.json";

export const revalidate = 60;

export default async function Home() {
  const [health, sectors, popularCompanies] = await Promise.all([
    getHealth(),
    getSectors(),
    getCompanies({ sort: "market_cap_desc", limit: 5 }),
  ]);

  return (
    <PublicHomePageClient
      health={health}
      sectors={sectors}
      popularCompanies={popularCompanies.items}
      cloudCompanies={homepageCompanyCloudData.nodes}
    />
  );
}
