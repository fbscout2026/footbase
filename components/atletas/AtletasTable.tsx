"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { Badge } from "@/components/ui/Badge";
import { ClubeCrest } from "@/components/app/ClubeCrest";
import type { AtletaRecord } from "@/lib/services/atletas";
import { formatMonthYear } from "@/lib/format";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";

// The parent (`AtletasExplorer`) already hands this table exactly one page's
// worth of athletes (20, via real server-side pagination) — this component
// only sorts what it's given, no pagination of its own.

type SortKey =
  | "name" | "mainPosition" | "age" | "currentCategory" | "heightCm"
  | "dominantFoot" | "club" | "matches" | "goals" | "assists" | "contract";

const CONTRACT_TONE = {
  active: "neutral",
  expiring_soon: "warning",
  expired: "danger",
  free_agent: "brand",
} as const;

// Possibly-null fields sort as the largest value (a sentinel, never a real fbId/
// age/height) so unknowns land at the end on ascending sort — real scraped
// athletes are missing most biographic fields, and this is friendlier than
// having "—" rows scattered by JS's default (inconsistent) null ordering.
function sortValue(a: AtletaRecord, key: SortKey): string | number {
  switch (key) {
    case "name": return a.name;
    case "mainPosition": return a.mainPosition ?? "￿";
    case "age": return a.age ?? Number.MAX_SAFE_INTEGER;
    case "currentCategory": return a.currentCategory ?? "￿";
    case "heightCm": return a.heightCm ?? Number.MAX_SAFE_INTEGER;
    case "dominantFoot": return a.dominantFoot ?? "￿";
    case "club": return a.currentClubName ?? "￿";
    case "matches": return a.stats.totalMatches;
    case "goals": return a.stats.totalGoals;
    case "assists": return a.stats.totalAssists;
    case "contract": return a.contractEndDate ?? "9999-99"; // nulls (free) last asc
  }
}

export function AtletasTable({ atletas }: { atletas: AtletaRecord[] }) {
  const { t } = useT();
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("goals");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    const copy = [...atletas];
    copy.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [atletas, sortKey, sortDir]);

  const cols: { key: SortKey; labelKey: TranslationKey; align?: "right" | "center" }[] = [
    { key: "name", labelKey: "atletas.col.athlete" },
    { key: "mainPosition", labelKey: "atletas.col.pos", align: "center" },
    { key: "age", labelKey: "atletas.col.age", align: "center" },
    { key: "currentCategory", labelKey: "atletas.col.category", align: "center" },
    { key: "heightCm", labelKey: "atletas.col.height", align: "center" },
    { key: "dominantFoot", labelKey: "atletas.col.foot", align: "center" },
    { key: "club", labelKey: "atletas.col.club" },
    { key: "matches", labelKey: "atletas.col.matches", align: "center" },
    { key: "goals", labelKey: "atletas.col.goals", align: "center" },
    { key: "assists", labelKey: "atletas.col.assists", align: "center" },
    { key: "contract", labelKey: "atletas.col.contract", align: "right" },
  ];

  if (sorted.length === 0) {
    return (
      <div className="matchday-surface p-10 text-center text-sm text-muted">
        {t("atletas.empty")}
      </div>
    );
  }

  return (
    <div className="matchday-surface overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-brand/50 bg-background text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-2.5 text-left font-semibold">#</th>
            <th className="px-2 py-2.5 text-center font-semibold">{t("favorites.short")}</th>
            {cols.map((c) => (
              <th
                key={c.key}
                aria-sort={sortKey === c.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                className={`select-none px-1 py-1 font-semibold ${
                  c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(c.key)}
                  className={`inline-flex min-h-11 items-center gap-1 px-2 transition-colors hover:text-foreground ${c.align === "center" ? "justify-center" : ""}`}
                >
                  {t(c.labelKey)}
                  {sortKey === c.key &&
                    (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((a, i) => {
            return (
              <tr
                key={a.fbId}
                onClick={() => router.push(`/atletas/${a.fbId}`)}
                className="cursor-pointer border-b border-border/60 transition-colors hover:bg-surface-hover"
              >
                <td className="px-3 py-2 text-muted">{i + 1}</td>
                <td className="px-2 py-2 text-center">
                  <FavoriteButton fbId={a.fbId} athleteName={a.name} compact />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <ClubeCrest src={a.currentClubCrestUrl} name={a.currentClubName ?? "?"} size={22} />
                    <div className="min-w-0">
                      <Link
                        href={`/atletas/${a.fbId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="block truncate font-medium hover:text-brand"
                      >
                        {a.name}
                      </Link>
                      {a.apelido && <p className="truncate text-xs text-muted">{a.apelido}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-center">{a.mainPosition ?? "—"}</td>
                <td className="px-3 py-2 text-center">{a.age ?? "—"}</td>
                <td className="px-3 py-2 text-center">{a.currentCategory ?? "—"}</td>
                <td className="px-3 py-2 text-center">{a.heightCm ?? "—"}</td>
                <td className="px-3 py-2 text-center">{a.dominantFoot ? t(`foot.${a.dominantFoot}` as TranslationKey) : "—"}</td>
                <td className="px-3 py-2">
                  <span className="truncate text-muted">{a.currentClubName ?? "—"}</span>
                </td>
                <td className="px-3 py-2 text-center">{a.stats.totalMatches}</td>
                <td className="px-3 py-2 text-center font-semibold">{a.stats.totalGoals}</td>
                <td className="px-3 py-2 text-center">{a.stats.totalAssists}</td>
                <td className="px-3 py-2 text-right">
                  <Badge tone={CONTRACT_TONE[a.contractStatus]}>
                    {a.contractEndDate ? formatMonthYear(a.contractEndDate) : t("contract.free_agent")}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
