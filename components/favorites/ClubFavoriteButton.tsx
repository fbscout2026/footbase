"use client";

import { Heart, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/I18nProvider";
import { useClubFavorites } from "@/lib/favorites/ClubFavoritesProvider";

// Session 57 — plain toggle, no rating/notes modal (unlike athlete FavoriteButton.tsx):
// favoriting a club is a boolean signal, nothing to edit after creation.
export function ClubFavoriteButton({ clubId, compact = false }: { clubId: string; compact?: boolean }) {
  const { t } = useT();
  const { isClubFavorited, toggleClubFavorite, savingClubId } = useClubFavorites();
  const favorited = isClubFavorited(clubId);
  const isSaving = savingClubId === clubId;

  return (
    <button
      type="button"
      disabled={savingClubId !== null}
      onClick={(event) => {
        event.stopPropagation();
        void toggleClubFavorite(clubId);
      }}
      aria-label={favorited ? t("favorites.removeClub") : t("favorites.addClub")}
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
      {!compact && (favorited ? t("favorites.removeClub") : t("favorites.addClub"))}
    </button>
  );
}
