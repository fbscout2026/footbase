import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { SessionProvider } from "@/lib/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { AppNav } from "@/components/app/AppNav";
import { createClient } from "@/lib/supabase/server";
import { listFavorites, type FavoriteRecord } from "@/lib/services/favorites";
import { FavoritesProvider } from "@/lib/favorites/FavoritesProvider";
import { DataLoadNotice } from "@/components/app/DataLoadNotice";

// Server-side route guard for every authed page under (app).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();

  if (!session) redirect("/login");
  if (session.accountStatus !== "approved") redirect("/aguardando-aprovacao");

  const supabase = await createClient();
  let initialFavorites: FavoriteRecord[] = [];
  let favoritesLoadFailed = false;
  try {
    initialFavorites = await listFavorites(supabase, session.userId);
  } catch {
    favoritesLoadFailed = true;
  }

  return (
    <SessionProvider value={session}>
      {/* Keyed by userId: the (app) layout persists across client-side navigations
          (including login -> logout -> login-as-a-different-user without a hard
          reload), but FavoritesProvider seeds its state with `useState(initialFavorites)`
          — a plain initializer only runs on mount. Without this key, switching accounts
          in the same tab leaves the PREVIOUS user's favorites in client state, which the
          RPC then correctly rejects ("only favorited athletes may be selected") because
          they don't belong to the now-current auth.uid(). Same pattern already used for
          the admin panel's ?user= remount. */}
      <FavoritesProvider key={session.userId} initialFavorites={initialFavorites}>
        <div className="min-h-screen bg-background">
          <AppHeader
            fullName={session.fullName}
            email={session.email}
            role={session.role}
          />
          <AppNav />
          {favoritesLoadFailed && <DataLoadNotice />}
          <main id="main-content" className="w-full px-4 py-5 sm:px-6">{children}</main>
        </div>
      </FavoritesProvider>
    </SessionProvider>
  );
}
