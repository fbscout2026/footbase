"use client";

import { useT } from "@/lib/i18n/I18nProvider";
import { ClubeCrest } from "@/components/app/ClubeCrest";
import { getHistoricoClubes } from "@/lib/atleta-extra";
import { getClubeById, type MockAtleta } from "@/lib/mock-data";

export function ClubHistory({ atleta }: { atleta: MockAtleta }) {
  const { t } = useT();
  const history = getHistoricoClubes(atleta);

  return (
    <ul className="space-y-2">
      {history.map((h, i) => {
        const club = h.clubId ? getClubeById(h.clubId) : undefined;
        return (
          <li key={i} className="flex items-center gap-3">
            <ClubeCrest src={club?.webpCrestUrl ?? null} name={h.clubName} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{h.clubName}</p>
              <p className="text-xs text-muted">
                {h.from} – {h.to ?? t("dossie.history.current")}
              </p>
            </div>
            {h.to === null && (
              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-brand">
                {t("dossie.history.current")}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
