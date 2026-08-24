"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/auth/SessionProvider";
import {
  listClubFavorites,
  addClubFavorite,
  removeClubFavorite,
  type ClubFavoriteRecord,
} from "@/lib/services/club-favorites";

interface ClubFavoritesContextValue {
  clubFavorites: ClubFavoriteRecord[];
  isClubFavorited: (clubId: string) => boolean;
  toggleClubFavorite: (clubId: string) => Promise<void>;
  savingClubId: string | null;
  loaded: boolean;
}

const ClubFavoritesContext = createContext<ClubFavoritesContextValue | null>(null);

// Same pattern as FavoritesProvider.tsx (athlete favorites) — client-side fetch off
// the critical path, optimistic toggle, `loaded` flag gates any consumer that derives
// state FROM this list (Session 57 already hit a real race-condition bug from a
// consumer trusting the transient empty array before this resolved).
export function ClubFavoritesProvider({
  initial,
  children,
}: {
  initial: ClubFavoriteRecord[] | null;
  children: React.ReactNode;
}) {
  const { userId } = useSession();
  const client = useMemo(() => createClient(), []);
  const [clubFavorites, setClubFavorites] = useState(initial ?? []);
  const [savingClubId, setSavingClubId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(initial !== null);
  const mutationInFlight = useRef(false);

  useEffect(() => {
    if (initial !== null) return;
    let cancelled = false;
    listClubFavorites(client, userId)
      .then((data) => {
        if (!cancelled) setClubFavorites(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, userId]);

  function isClubFavorited(clubId: string) {
    return clubFavorites.some((f) => f.clubId === clubId);
  }

  async function toggleClubFavorite(clubId: string) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    const previous = clubFavorites;
    const already = isClubFavorited(clubId);
    setSavingClubId(clubId);
    setClubFavorites((items) =>
      already ? items.filter((f) => f.clubId !== clubId) : [...items, { id: `optimistic-${clubId}`, userId, clubId }]
    );
    try {
      if (already) {
        await removeClubFavorite(client, userId, clubId);
      } else {
        const saved = await addClubFavorite(client, userId, clubId);
        setClubFavorites((items) => [...items.filter((f) => f.clubId !== clubId), saved]);
      }
    } catch (error) {
      setClubFavorites(previous);
      throw error;
    } finally {
      setSavingClubId(null);
      mutationInFlight.current = false;
    }
  }

  return (
    <ClubFavoritesContext.Provider value={{ clubFavorites, isClubFavorited, toggleClubFavorite, savingClubId, loaded }}>
      {children}
    </ClubFavoritesContext.Provider>
  );
}

export function useClubFavorites(): ClubFavoritesContextValue {
  const context = useContext(ClubFavoritesContext);
  if (!context) throw new Error("useClubFavorites must be used within <ClubFavoritesProvider>");
  return context;
}
