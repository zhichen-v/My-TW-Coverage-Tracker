import { getCompanies, getHealth, getSectors } from "@/lib/api";
import { HomePageClient } from "@/components/home-page-client";

type HomeProps = {
  searchParams?: Promise<{
    q?: string;
    sector?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 30;

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
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
    <HomePageClient
      health={health}
      sectors={sectors}
      companies={companies}
      initialQuery={resolvedSearchParams.q ?? ""}
      initialSector={resolvedSearchParams.sector ?? ""}
      initialPage={initialPage}
    />
  );
}
