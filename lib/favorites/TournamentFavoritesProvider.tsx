"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/auth/SessionProvider";
import {
  listTournamentFavorites,
  addTournamentFavorite,
  removeTournamentFavorite,
  type TournamentFavoriteRecord,
} from "@/lib/services/tournament-favorites";

interface TournamentFavoritesContextValue {
  tournamentFavorites: TournamentFavoriteRecord[];
  isTournamentFavorited: (torneioId: string) => boolean;
  toggleTournamentFavorite: (torneioId: string) => Promise<void>;
  savingTorneioId: string | null;
  loaded: boolean;
}

const TournamentFavoritesContext = createContext<TournamentFavoritesContextValue | null>(null);

// Same pattern as ClubFavoritesProvider.tsx / FavoritesProvider.tsx.
export function TournamentFavoritesProvider({
  initial,
  children,
}: {
  initial: TournamentFavoriteRecord[] | null;
  children: React.ReactNode;
}) {
  const { userId } = useSession();
  const client = useMemo(() => createClient(), []);
  const [tournamentFavorites, setTournamentFavorites] = useState(initial ?? []);
  const [savingTorneioId, setSavingTorneioId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(initial !== null);
  const mutationInFlight = useRef(false);

  useEffect(() => {
    if (initial !== null) return;
    let cancelled = false;
    listTournamentFavorites(client, userId)
      .then((data) => {
        if (!cancelled) setTournamentFavorites(data);
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

  function isTournamentFavorited(torneioId: string) {
    return tournamentFavorites.some((f) => f.torneioId === torneioId);
  }

  async function toggleTournamentFavorite(torneioId: string) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    const previous = tournamentFavorites;
    const already = isTournamentFavorited(torneioId);
    setSavingTorneioId(torneioId);
    setTournamentFavorites((items) =>
      already
        ? items.filter((f) => f.torneioId !== torneioId)
        : [...items, { id: `optimistic-${torneioId}`, userId, torneioId }]
    );
    try {
      if (already) {
        await removeTournamentFavorite(client, userId, torneioId);
      } else {
        const saved = await addTournamentFavorite(client, userId, torneioId);
        setTournamentFavorites((items) => [...items.filter((f) => f.torneioId !== torneioId), saved]);
      }
    } catch (error) {
      setTournamentFavorites(previous);
      throw error;
    } finally {
      setSavingTorneioId(null);
      mutationInFlight.current = false;
    }
  }

  return (
    <TournamentFavoritesContext.Provider
      value={{ tournamentFavorites, isTournamentFavorited, toggleTournamentFavorite, savingTorneioId, loaded }}
    >
      {children}
    </TournamentFavoritesContext.Provider>
  );
}

export function useTournamentFavorites(): TournamentFavoritesContextValue {
  const context = useContext(TournamentFavoritesContext);
  if (!context) throw new Error("useTournamentFavorites must be used within <TournamentFavoritesProvider>");
  return context;
}
