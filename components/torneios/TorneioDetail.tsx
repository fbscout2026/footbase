"use client";

import Link from "next/link";
import { ArrowLeft, Trophy, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TorneioDetail as TorneioDetailData } from "@/lib/services/torneios";

export function TorneioDetail({ data }: { data: TorneioDetailData }) {
  const { t } = useT();
  const breadcrumb = [data.continente, data.paisNome, data.federacaoSigla].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      <Link href="/torneios" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-muted hover:text-brand">
        <ArrowLeft size={15} />{t("torneios.detail.back")}
      </Link>

      <section className="matchday-surface p-5 sm:p-7">
        <div className="mb-2 flex items-center gap-2 text-brand"><Trophy size={18} /><span className="text-xs font-extrabold uppercase tracking-widest">{breadcrumb || t("torneios.badge")}</span></div>
        <h1 className="matchday-heading text-3xl">{data.name}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="brand">{data.federacaoNome ?? data.federationText}</Badge>
          {data.category && <Badge tone="neutral">{data.category}</Badge>}
          <Badge tone="neutral">{data.year}</Badge>
        </div>
      </section>

      <section className="matchday-surface p-10 text-center">
        <ShieldQuestion size={28} className="mx-auto text-muted" />
        <p className="mt-3 text-sm text-muted">{t("torneios.detail.noMatches")}</p>
      </section>
    </div>
  );
}
