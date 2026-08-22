import { ComparePageClient } from "@/components/atletas/comparar/ComparePageClient";
import { parseComparisonBids } from "@/lib/atleta-comparison";
import { createClient } from "@/lib/supabase/server";
import { loadAtletasByBids } from "@/lib/services/atletas";

export default async function CompararAtletasPage({
  searchParams,
}: {
  searchParams: Promise<{ bids?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawBids = Array.isArray(params.bids) ? params.bids[0] : params.bids;
  const bids = parseComparisonBids(rawBids ?? null);

  const supabase = await createClient();
  const atletas = await loadAtletasByBids(supabase, bids).catch(() => []);
  // Preserve the requested order/slots even if a fbId didn't resolve to a real
  // athlete (bad query param) — drop it rather than guessing.
  const resolvedBids = bids.filter((b) => atletas.some((a) => a.fbId === b));

  return <ComparePageClient initialBids={resolvedBids} atletas={atletas} />;
}
