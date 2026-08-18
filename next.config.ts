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
};

export default nextConfig;
