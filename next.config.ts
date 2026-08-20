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
};

export default nextConfig;
