"use client";

import { useEffect, useState } from "react";
import { Heart, LoaderCircle, Star, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/I18nProvider";
import { useFavorites } from "@/lib/favorites/FavoritesProvider";
import { Button } from "@/components/ui/Button";

export function FavoriteButton({
  fbId,
  athleteName,
  compact = false,
}: {
  fbId: number;
  athleteName: string;
  compact?: boolean;
}) {
  const { t } = useT();
  const { getFavorite, saveFavorite, removeFavorite, savingBid } = useFavorites();
  const favorite = getFavorite(fbId);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(favorite?.rating ?? 50);
  const [notes, setNotes] = useState(favorite?.notes ?? "");
  const [error, setError] = useState(false);
  const isSaving = savingBid === fbId;
  const mutationsLocked = savingBid !== null;

  useEffect(() => {
    if (!open) return;
    setRating(favorite?.rating ?? 50);
    setNotes(favorite?.notes ?? "");
    setError(false);
  }, [open, favorite?.rating, favorite?.notes]);

  async function handleSave() {
    setError(false);
    try {
      await saveFavorite(fbId, rating, notes);
      setOpen(false);
    } catch {
      setError(true);
    }
  }

  async function handleRemove() {
    setError(false);
    try {
      await removeFavorite(fbId);
      setOpen(false);
    } catch {
      setError(true);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={mutationsLocked}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label={favorite ? t("favorites.edit") : t("favorites.add")}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border transition-colors focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait disabled:opacity-60",
          compact ? "h-11 w-11" : "px-3 py-2 text-sm font-semibold",
          favorite
            ? "border-brand/40 bg-brand/15 text-brand hover:bg-brand/25"
            : "border-border bg-background text-muted hover:border-brand/50 hover:text-brand"
        )}
      >
        {isSaving ? (
          <LoaderCircle size={compact ? 15 : 16} className="animate-spin" />
        ) : (
          <Heart size={compact ? 15 : 16} fill={favorite ? "currentColor" : "none"} />
        )}
        {!compact && (favorite ? `${favorite.rating}/100` : t("favorites.add"))}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`favorite-title-${fbId}`}
            className="w-full max-w-md rounded-sm border border-border bg-surface p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand">{t("favorites.shortlist")}</p>
                <h2 id={`favorite-title-${fbId}`} className="mt-1 text-lg font-bold">{athleteName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("common.cancel")}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <label htmlFor={`favorite-rating-${fbId}`} className="mt-5 block text-sm font-medium text-muted">
              {t("favorites.rating")}: <strong className="text-brand">{rating}/100</strong>
            </label>
            <div className="mt-2 flex items-center gap-3">
              <Star size={18} className="text-brand" />
              <input
                id={`favorite-rating-${fbId}`}
                type="range"
                min="0"
                max="100"
                step="1"
                value={rating}
                onChange={(event) => setRating(Number(event.target.value))}
                className="w-full accent-[rgb(var(--brand))]"
              />
            </div>

            <label htmlFor={`favorite-notes-${fbId}`} className="mt-5 block text-sm font-medium text-muted">
              {t("favorites.notes")}
            </label>
            <textarea
              id={`favorite-notes-${fbId}`}
              rows={4}
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("favorites.notesPlaceholder")}
              className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-brand"
            />

            {error && <p className="mt-3 text-sm text-danger">{t("favorites.error")}</p>}

            <div className="mt-5 flex flex-wrap justify-between gap-3">
              {favorite ? (
                <Button variant="ghost" onClick={handleRemove} disabled={isSaving} className="text-danger">
                  <Trash2 size={15} /> {t("favorites.remove")}
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={isSaving}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving && <LoaderCircle size={15} className="animate-spin" />}
                  {t("common.save")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
