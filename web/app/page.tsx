import { headers } from "next/headers";
import { AppMainPageClient } from "@/components/app-main-page-client";
import { PublicHomePageClient } from "@/components/public-home-page-client";
import { getCompanies, getHealth, getSectors } from "@/lib/api";
import homepageCompanyCloudData from "@/src/data/homepage-company-cloud-nodes.json";

export const revalidate = 60;

type HomePageProps = {
  searchParams?: Promise<{
    q?: string;
    sector?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 30;
const APP_HOST = "app.anonky.xyz";

function isAppHost(host: string | null) {
  return (host || "").split(":")[0].toLowerCase() === APP_HOST;
}

export default async function Home({ searchParams }: HomePageProps) {
  const requestHeaders = await headers();
  const resolvedSearchParams = (await searchParams) ?? {};

  if (isAppHost(requestHeaders.get("host"))) {
    const parsedPage = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
    const initialPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const [health, sectors, companies] = await Promise.all([
      getHealth(),
      getSectors(),
      getCompanies({
        q: resolvedSearchParams.q,
        sector: resolvedSearchParams.sector,
        limit: PAGE_SIZE,
        offset: (initialPage - 1) * PAGE_SIZE,
      }),
    ]);

    return (
      <AppMainPageClient
        health={health}
        sectors={sectors}
        companies={companies}
        initialQuery={resolvedSearchParams.q ?? ""}
        initialSector={resolvedSearchParams.sector ?? ""}
        initialPage={initialPage}
      />
    );
  }

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
