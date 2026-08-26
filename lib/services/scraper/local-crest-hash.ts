// FOOTBASE — shared "hash a club's already-stored local crest file" helper.
// Factored out of `scan-club-duplicates.ts` (Session 55) so `resolve-club-identity`'s
// DB-facing wiring (Session 57) can reuse the exact same hashing logic instead of a
// second, potentially-drifting copy. `clubes.webp_crest_url` is always a local
// `/crests/...` path written by `ingest.ts`'s `ensureClubCrest` — never a remote
// URL — so this is a local file read, no network, no timeout to worry about.

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

// Confirmed live (Session 57): FERJ falls back to a generic gray "no crest
// available" shield icon for clubs it has no real badge for — 4 completely
// unrelated real clubs shared this exact file, which a naive crest-hash-alone
// comparison flags as "the same club" (false positive — a shared PLACEHOLDER,
// not a shared identity). Same principle as `isLegacyMockBid` in
// scan-athlete-duplicates.ts: a signal that LOOKS strong but is structurally
// meaningless must never confirm a match — neither in the duplicate scanner NOR
// in `resolve-club-identity.ts`'s automatic crest-hash tier (which would
// otherwise risk auto-merging two different real clubs that both happen to lack
// a real crest from the same source). Add a hash here the moment a source's own
// "no crest" fallback image is identified — never guess a match that traces
// back to one.
export const KNOWN_PLACEHOLDER_CREST_HASHES = new Set<string>([
  "cd33628187b0aeb85fd9b511375badcc7873a56c1b6a9d62221121f481564714", // FERJ generic gray shield fallback
]);

export function localCrestHash(webpCrestUrl: string | null | undefined): string | null {
  if (!webpCrestUrl || !webpCrestUrl.startsWith("/crests/")) return null;
  const path = `public${webpCrestUrl}`;
  if (!existsSync(path)) return null;
  try {
    const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
    return KNOWN_PLACEHOLDER_CREST_HASHES.has(hash) ? null : hash;
  } catch {
    return null;
  }
}
