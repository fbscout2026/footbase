"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/auth/SessionProvider";
import {
  listFavorites,
  removeFavorite as removeFavoriteRequest,
  upsertFavorite,
  type FavoriteRecord,
} from "@/lib/services/favorites";

interface FavoritesContextValue {
  favorites: FavoriteRecord[];
  getFavorite: (fbId: number) => FavoriteRecord | undefined;
  saveFavorite: (fbId: number, rating: number, notes: string | null) => Promise<void>;
  removeFavorite: (fbId: number) => Promise<void>;
  savingBid: number | null;
  loadFailed: boolean;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({
  initialFavorites,
  children,
}: {
  initialFavorites: FavoriteRecord[] | null;
  children: React.ReactNode;
}) {
  const { userId } = useSession();
  const client = useMemo(() => createClient(), []);
  const [favorites, setFavorites] = useState(initialFavorites ?? []);
  const [savingBid, setSavingBid] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const mutationInFlight = useRef(false);

  // `initialFavorites === null` means the layout didn't fetch this server-side
  // (Session 55: it used to `await listFavorites(...)` before rendering
  // ANYTHING, adding a full extra round-trip to every cold navigation) — fetch
  // it here instead, off the critical path. The nav/page render immediately
  // with an empty favorites state (hearts briefly show "not favorited"), then
  // fill in a moment later once this resolves.
  useEffect(() => {
    if (initialFavorites !== null) return;
    let cancelled = false;
    listFavorites(client, userId)
      .then((data) => {
        if (!cancelled) setFavorites(data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // Only ever runs once per mount (per `key={session.userId}` on the
    // provider) — `initialFavorites` is a stable prop, not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, userId]);

  function getFavorite(fbId: number) {
    return favorites.find((favorite) => favorite.fbId === fbId);
  }

  async function saveFavorite(fbId: number, rating: number, notes: string | null) {
    if (mutationInFlight.current) throw new Error("favorite-mutation-in-progress");
    mutationInFlight.current = true;
    const previous = favorites;
    const current = getFavorite(fbId);
    const optimistic: FavoriteRecord = {
      id: current?.id ?? `optimistic-${fbId}`,
      userId,
      fbId,
      rating: Math.max(0, Math.min(100, Math.round(rating))),
      notes: notes?.trim() || null,
    };
    setSavingBid(fbId);
    setFavorites((items) => [optimistic, ...items.filter((item) => item.fbId !== fbId)]);
    try {
      const saved = await upsertFavorite(client, { userId, fbId, rating, notes });
      setFavorites((items) => [saved, ...items.filter((item) => item.fbId !== fbId)]);
    } catch (error) {
      setFavorites(previous);
      throw error;
    } finally {
      setSavingBid(null);
      mutationInFlight.current = false;
    }
  }

  async function removeFavorite(fbId: number) {
    if (mutationInFlight.current) throw new Error("favorite-mutation-in-progress");
    mutationInFlight.current = true;
    const previous = favorites;
    setSavingBid(fbId);
    setFavorites((items) => items.filter((item) => item.fbId !== fbId));
    try {
      await removeFavoriteRequest(client, fbId);
    } catch (error) {
      setFavorites(previous);
      throw error;
    } finally {
      setSavingBid(null);
      mutationInFlight.current = false;
    }
  }

  return (
    <FavoritesContext.Provider value={{ favorites, getFavorite, saveFavorite, removeFavorite, savingBid, loadFailed }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error("useFavorites must be used within <FavoritesProvider>");
  return context;
}
