"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, GitCompareArrows } from "lucide-react";
import { AtletaCompareSelector } from "@/components/atletas/comparar/AtletaCompareSelector";
import { AtletaComparisonMatrix } from "@/components/atletas/comparar/AtletaComparisonMatrix";
import { useT } from "@/lib/i18n/I18nProvider";
import { getAtletaByBid } from "@/lib/mock-data";
import { serializeComparisonBids } from "@/lib/atleta-comparison";

export function ComparePageClient({ initialBids }: { initialBids: number[] }) {
  const { t } = useT();
  const router = useRouter();
  const atletas = initialBids.map(getAtletaByBid).filter((a) => a !== undefined);

  function updateBids(bids: number[]) {
    const serialized = serializeComparisonBids(bids);
    router.replace(serialized ? `/atletas/comparar?bids=${serialized}` : "/atletas/comparar", { scroll: false });
  }

  return (
    <div className="space-y-4">
      <Link href="/atletas" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ChevronLeft size={16} /> {t("compare.back")}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-brand">
            <GitCompareArrows size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">UC05</span>
          </div>
          <h1 className="text-2xl font-extrabold uppercase italic tracking-tight">{t("compare.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("compare.subtitle")}</p>
        </div>
      </div>

      <AtletaCompareSelector selectedBids={initialBids} onChange={updateBids} />
      <AtletaComparisonMatrix atletas={atletas} />
    </div>
  );
}
