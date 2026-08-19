"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import { WidgetCard } from "./WidgetCard";
import { FedCrest } from "@/components/app/FedCrest";
import type { TorneioRow } from "@/lib/services/dashboard";

export function TorneiosDestaque({ torneios }: { torneios: TorneioRow[] }) {
  const { t } = useT();

  return (
    <WidgetCard title={t("dashboard.tournaments.title")} icon={Trophy}>
      <ul className="scroll-brand max-h-[26rem] space-y-2 overflow-y-auto pr-1">
        {torneios.map((tr) => (
          <li key={tr.id}>
            <Link
              href={`/torneios/${tr.id}`}
              className="flex items-center gap-3 border border-border bg-background px-3 py-3 transition-colors hover:border-brand/50 hover:bg-surface-hover"
            >
              <FedCrest federation={tr.federationText} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold italic">{tr.name}</span>
                <span className="block text-xs text-muted">
                  {tr.category ?? "—"} · {tr.year}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
