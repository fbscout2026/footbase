import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Single active device (Session 57): every real login/password-reset claims a fresh
  // `active_session_id` on `profiles` and mirrors it into the `fb_session_id` cookie.
  // A logged-in request whose cookie no longer matches the DB value means a newer
  // device claimed the slot since — force a sign-out here so the stale device can't
  // keep reading data. Only enforced when the DB value is non-null: existing sessions
  // predating this feature have `active_session_id = NULL` and are never kicked until
  // their next real login, so shipping this never mass-logs-out the current userbase.
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_session_id")
      .eq("id", user.id)
      .single();

    const cookieSessionId = request.cookies.get("fb_session_id")?.value;
    const dbSessionId = profile?.active_session_id as string | null | undefined;

    if (dbSessionId && dbSessionId !== cookieSessionId) {
      await supabase.auth.signOut(); // reassigns `response` via `setAll` above, with cleared cookies on it

      const redirectResponse = NextResponse.redirect(new URL("/login?reason=other_device", request.url));
      // MUST copy the cookies signOut() just set onto THIS response — a bare
      // `NextResponse.redirect(...)` here would ship a brand new response object that
      // never received the cleared auth cookies, redirecting the browser to /login
      // while it still holds a valid session cookie.
      response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
