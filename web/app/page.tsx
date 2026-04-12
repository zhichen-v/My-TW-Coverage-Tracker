import { getCompanies, getHealth, getSectors } from "@/lib/api";
import { HomePageClient } from "@/components/home-page-client";

type HomeProps = {
  searchParams?: Promise<{
    q?: string;
    sector?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const [health, sectors, companies] = await Promise.all([
    getHealth(),
    getSectors(),
    getCompanies({
      q: resolvedSearchParams.q,
      sector: resolvedSearchParams.sector,
      limit: 60,
    }),
  ]);

  return (
    <HomePageClient
      health={health}
      sectors={sectors}
      companies={companies}
      initialQuery={resolvedSearchParams.q ?? ""}
      initialSector={resolvedSearchParams.sector ?? ""}
    />
  );
}
