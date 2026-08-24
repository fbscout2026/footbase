"use client";

import { Heart, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/I18nProvider";
import { useTournamentFavorites } from "@/lib/favorites/TournamentFavoritesProvider";

// Session 57 — same plain-toggle pattern as ClubFavoriteButton.tsx.
export function TournamentFavoriteButton({ torneioId, compact = false }: { torneioId: string; compact?: boolean }) {
  const { t } = useT();
  const { isTournamentFavorited, toggleTournamentFavorite, savingTorneioId } = useTournamentFavorites();
  const favorited = isTournamentFavorited(torneioId);
  const isSaving = savingTorneioId === torneioId;

  return (
    <button
      type="button"
      disabled={savingTorneioId !== null}
      onClick={(event) => {
        event.stopPropagation();
        void toggleTournamentFavorite(torneioId);
      }}
      aria-label={favorited ? t("favorites.removeTournament") : t("favorites.addTournament")}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border transition-colors focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait disabled:opacity-60",
        compact ? "h-11 w-11" : "px-3 py-2 text-sm font-semibold",
        favorited
          ? "border-brand/40 bg-brand/15 text-brand hover:bg-brand/25"
          : "border-border bg-background text-muted hover:border-brand/50 hover:text-brand"
      )}
    >
      {isSaving ? (
        <LoaderCircle size={compact ? 15 : 16} className="animate-spin" />
      ) : (
        <Heart size={compact ? 15 : 16} fill={favorited ? "currentColor" : "none"} />
      )}
      {!compact && (favorited ? t("favorites.removeTournament") : t("favorites.addTournament"))}
    </button>
  );
}
