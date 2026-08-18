"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/auth/SessionProvider";
import {
  removeFavorite as removeFavoriteRequest,
  upsertFavorite,
  type FavoriteRecord,
} from "@/lib/services/favorites";

interface FavoritesContextValue {
  favorites: FavoriteRecord[];
  getFavorite: (bid: number) => FavoriteRecord | undefined;
  saveFavorite: (bid: number, rating: number, notes: string | null) => Promise<void>;
  removeFavorite: (bid: number) => Promise<void>;
  savingBid: number | null;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({
  initialFavorites,
  children,
}: {
  initialFavorites: FavoriteRecord[];
  children: React.ReactNode;
}) {
  const { userId } = useSession();
  const client = useMemo(() => createClient(), []);
  const [favorites, setFavorites] = useState(initialFavorites);
  const [savingBid, setSavingBid] = useState<number | null>(null);
  const mutationInFlight = useRef(false);

  function getFavorite(bid: number) {
    return favorites.find((favorite) => favorite.bid === bid);
  }

  async function saveFavorite(bid: number, rating: number, notes: string | null) {
    if (mutationInFlight.current) throw new Error("favorite-mutation-in-progress");
    mutationInFlight.current = true;
    const previous = favorites;
    const current = getFavorite(bid);
    const optimistic: FavoriteRecord = {
      id: current?.id ?? `optimistic-${bid}`,
      userId,
      bid,
      rating: Math.max(0, Math.min(100, Math.round(rating))),
      notes: notes?.trim() || null,
    };
    setSavingBid(bid);
    setFavorites((items) => [optimistic, ...items.filter((item) => item.bid !== bid)]);
    try {
      const saved = await upsertFavorite(client, { userId, bid, rating, notes });
      setFavorites((items) => [saved, ...items.filter((item) => item.bid !== bid)]);
    } catch (error) {
      setFavorites(previous);
      throw error;
    } finally {
      setSavingBid(null);
      mutationInFlight.current = false;
    }
  }

  async function removeFavorite(bid: number) {
    if (mutationInFlight.current) throw new Error("favorite-mutation-in-progress");
    mutationInFlight.current = true;
    const previous = favorites;
    setSavingBid(bid);
    setFavorites((items) => items.filter((item) => item.bid !== bid));
    try {
      await removeFavoriteRequest(client, bid);
    } catch (error) {
      setFavorites(previous);
      throw error;
    } finally {
      setSavingBid(null);
      mutationInFlight.current = false;
    }
  }

  return (
    <FavoritesContext.Provider value={{ favorites, getFavorite, saveFavorite, removeFavorite, savingBid }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error("useFavorites must be used within <FavoritesProvider>");
  return context;
}
