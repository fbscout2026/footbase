import { ComparePageClient } from "@/components/atletas/comparar/ComparePageClient";
import { parseComparisonBids } from "@/lib/atleta-comparison";

export default async function CompararAtletasPage({
  searchParams,
}: {
  searchParams: Promise<{ bids?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawBids = Array.isArray(params.bids) ? params.bids[0] : params.bids;
  return <ComparePageClient initialBids={parseComparisonBids(rawBids ?? null)} />;
}
