import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production build (server.js + only the deps actually needed at
  // runtime) — the deploy target is a persistent Contabo VPS (`pm2` running
  // `node .next/standalone/server.js`), not a serverless/edge platform that already
  // handles this. Without it, `pm2` would need to run `next start` against the full
  // dev-plus-prod `node_modules`, which is slower to restart and heavier on disk.
  output: "standalone",
  images: {
    formats: ["image/webp"],
  },
  // Session 55: every route under `app/(app)` reads cookies (auth session,
  // favorites), which makes Next.js treat them as fully dynamic — by default
  // that gives the client Router Cache a staleTime of 0, so switching between
  // main nav tabs (Início/Atletas/Prancheta/...) re-ran the ENTIRE shared
  // layout (session lookup + favorites query) on every single click, even
  // when the user had visited that tab moments ago. Restoring a real
  // staleTime lets the router reuse a just-rendered tab's output instead of
  // re-fetching it — this only affects client-side navigation caching, not
  // auth security (the middleware's `auth.getUser()` token refresh is
  // unaffected, and a hard reload/new tab always re-validates fresh).
  experimental: {
    staleTimes: {
      dynamic: 60,
    },
  },
  // Baseline security headers on every response. HSTS only bites once a request
  // actually arrives over HTTPS (the VPS reverse proxy owns the HTTP→HTTPS
  // redirect itself, outside this repo) — it's harmless to send unconditionally
  // since browsers only honor it on secure origins in the first place.
  //
  // The CSP allows 'unsafe-inline' for script/style: Next.js App Router injects
  // inline hydration data and Tailwind/component libraries rely on inline
  // style attributes, and wiring a nonce through every Server Component render
  // is a bigger change than this pass. It still blocks the actual threat model
  // (a third-party script/stylesheet domain), just not an inline-injection XSS
  // — a stricter nonce-based policy is a valid future hardening step.
  // connect-src includes the Supabase project origin (REST + realtime) since
  // that's the only external API this app calls from the browser.
  async headers() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseOrigin = supabaseUrl ?? "";
    const supabaseWs = supabaseUrl ? supabaseUrl.replace(/^https:/, "wss:") : "";
    // Dev-only additions, never shipped to production: React's dev mode needs
    // eval() to reconstruct cross-environment callstacks (never used in prod
    // builds), and Turbopack's HMR client needs a same-origin ws:// connection
    // for hot reload.
    const isDev = process.env.NODE_ENV !== "production";
    const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
    const connectSrc = isDev
      ? `connect-src 'self' ${supabaseOrigin} ${supabaseWs} ws://localhost:* ws://127.0.0.1:*`
      : `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`;
    const csp = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      connectSrc,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
