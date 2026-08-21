"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { AdminDuplicateCandidate, DuplicateCandidateAthlete } from "@/lib/services/admin-athlete-duplicates";
import { Users2 } from "lucide-react";

// Session 55: candidates come from scan-athlete-duplicates.ts --write, already
// filtered to the only two tiers that scan ever treats as a real merge signal
// (identical full name + same birth_date, or identical full name + same current
// club) — see that script's module doc for why tolerant name matching is never
// trusted here. This UI never guesses which profile to keep: an admin always picks
// the winner explicitly before a merge is possible.
export function AdminDuplicates({ candidates }: { candidates: AdminDuplicateCandidate[] | null }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(candidateId: string, action: "merge" | "dismiss", winnerBid?: number) {
    setBusy(candidateId);
    setError(null);
    try {
      const res = await fetch("/api/admin/athlete-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, action, winnerBid }),
      });
      const body = await res.json();
      if (!res.ok || body.outcome === "write-failed" || body.outcome === "match-collision" || body.outcome === "already-claimed") {
        setError(body.error ?? body.outcome ?? t("admin.duplicates.error"));
        return;
      }
      router.refresh();
    } catch {
      setError(t("admin.duplicates.error"));
    } finally {
      setBusy(null);
    }
  }

  if (candidates === null) {
    return <section className="matchday-surface p-10 text-center"><p className="text-sm text-danger">{t("admin.duplicates.loadError")}</p></section>;
  }

  return <div className="space-y-5">
    <section className="matchday-surface p-5">
      <h2 className="matchday-heading flex items-center gap-2 text-xl"><Users2 size={19} className="text-brand" />{t("admin.duplicates.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("admin.duplicates.desc")}</p>
    </section>

    {candidates.length === 0
      ? <section className="matchday-surface p-8 text-center text-sm text-muted">{t("admin.duplicates.empty")}</section>
      : <div className="space-y-4">{candidates.map((c) => (
          <CandidateCard key={c.id} candidate={c} busy={busy === c.id} onResolve={resolve} />
        ))}</div>}

    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </div>;
}

function CandidateCard({ candidate: c, busy, onResolve }: {
  candidate: AdminDuplicateCandidate;
  busy: boolean;
  onResolve: (candidateId: string, action: "merge" | "dismiss", winnerBid?: number) => void;
}) {
  const { t } = useT();
  return <section className="matchday-surface p-5">
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={c.tier === "forte" ? "brand" : "neutral"}>{t(`admin.duplicates.tier.${c.tier === "forte" ? "forte" : "clubeNome"}`)}</Badge>
      <span className="text-xs text-muted">{new Date(c.detectedAt).toLocaleDateString()}</span>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <AthleteChoice athlete={c.a} busy={busy} onPick={() => onResolve(c.id, "merge", c.a.bid)} />
      <AthleteChoice athlete={c.b} busy={busy} onPick={() => onResolve(c.id, "merge", c.b.bid)} />
    </div>
    <p className="mt-2 text-xs text-muted">{t("admin.duplicates.pickHint")}</p>

    <div className="mt-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => onResolve(c.id, "dismiss")}
        className="min-h-9 border border-border px-3 text-xs font-extrabold uppercase tracking-wide text-muted hover:border-danger/40 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
      >
        {t("admin.duplicates.dismiss")}
      </button>
    </div>
  </section>;
}

function AthleteChoice({ athlete: a, busy, onPick }: { athlete: DuplicateCandidateAthlete; busy: boolean; onPick: () => void }) {
  const { t } = useT();
  return <div className="border border-border bg-background p-4">
    <p className="font-semibold">{a.name}</p>
    <p className="mt-1 text-xs text-muted">
      BID {a.bid} · {a.currentCategory ?? "—"} · {a.currentClubName ?? "—"} · {a.totalMatches} {t("admin.duplicates.matches")}
    </p>
    {a.birthDate && <p className="text-xs text-muted">{t("admin.duplicates.birth")}: {a.birthDate}</p>}
    <Button type="button" disabled={busy} onClick={onPick} className="mt-3 w-full">
      {t("admin.duplicates.keepThis")}
    </Button>
  </div>;
}
