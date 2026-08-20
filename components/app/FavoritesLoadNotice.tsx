"use client";

import { useFavorites } from "@/lib/favorites/FavoritesProvider";
import { DataLoadNotice } from "@/components/app/DataLoadNotice";

// Favorites now load client-side (off the layout's critical render path —
// see FavoritesProvider) so this failure notice has to be client-driven too,
// instead of the layout deciding it server-side before the fetch even ran.
export function FavoritesLoadNotice() {
  const { loadFailed } = useFavorites();
  if (!loadFailed) return null;
  return <DataLoadNotice />;
}
