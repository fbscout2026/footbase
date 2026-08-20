import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { SessionProvider } from "@/lib/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { AppNav } from "@/components/app/AppNav";
import { FavoritesProvider } from "@/lib/favorites/FavoritesProvider";
import { FavoritesLoadNotice } from "@/components/app/FavoritesLoadNotice";

// Server-side route guard for every authed page under (app). Favorites used
// to be fetched here too (`await listFavorites(...)`), adding a full extra
// round-trip that blocked EVERY navigation before anything could render —
// they're loaded client-side now instead (see FavoritesProvider), off this
// critical path.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();

  if (!session) redirect("/login");
  if (session.accountStatus !== "approved") redirect("/aguardando-aprovacao");

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
      <FavoritesProvider key={session.userId} initialFavorites={null}>
        <div className="min-h-screen bg-background">
          <AppHeader
            fullName={session.fullName}
            email={session.email}
            role={session.role}
          />
          <AppNav />
          <FavoritesLoadNotice />
          <main id="main-content" className="w-full px-4 py-5 sm:px-6">{children}</main>
        </div>
      </FavoritesProvider>
    </SessionProvider>
  );
}
