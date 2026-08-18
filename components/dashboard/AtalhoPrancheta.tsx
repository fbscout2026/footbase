"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { WidgetCard } from "./WidgetCard";
import { mockPrancheta } from "@/lib/mock-data";

export function AtalhoPrancheta() {
  const { t } = useT();

  return (
    <WidgetCard
      title={t("dashboard.board.title")}
      subtitle={t("dashboard.board.subtitle")}
      icon={LayoutGrid}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <div className="text-center">
            <p className="text-2xl font-bold text-brand">{mockPrancheta.formation}</p>
          </div>
          <div className="flex gap-5 text-sm">
            <div>
              <p className="font-semibold">{mockPrancheta.starters.length}</p>
              <p className="text-xs text-muted">{t("dashboard.board.starters")}</p>
            </div>
            <div>
              <p className="font-semibold">{mockPrancheta.bench.length}</p>
              <p className="text-xs text-muted">{t("dashboard.board.bench")}</p>
            </div>
          </div>
        </div>

        <Link
          href="/prancheta"
          className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-brand-dim hover:text-white"
        >
          {t("dashboard.board.cta")}
        </Link>
      </div>
    </WidgetCard>
  );
}
