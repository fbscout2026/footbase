"use client";

import { useT } from "@/lib/i18n/I18nProvider";
import { ClubeCrest } from "@/components/app/ClubeCrest";
import { getHistoricoClubes } from "@/lib/atleta-extra";
import type { AtletaRecord } from "@/lib/services/atletas";

export function ClubHistory({ atleta }: { atleta: AtletaRecord }) {
  const { t } = useT();
  const history = getHistoricoClubes(atleta);

  if (history.length === 0) {
    return <p className="text-sm text-muted">{t("dossie.history.empty")}</p>;
  }

  return (
    <ul className="space-y-2">
      {history.map((h, i) => (
        <li key={i} className="flex items-center gap-3">
          <ClubeCrest src={h.crestUrl ?? null} name={h.clubName} size={28} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium uppercase">{h.clubName}</p>
            <p className="text-xs text-muted">
              {h.from ?? "—"} – {h.to ?? t("dossie.history.current")}
            </p>
          </div>
          {h.to === null && (
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-brand">
              {t("dossie.history.current")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
