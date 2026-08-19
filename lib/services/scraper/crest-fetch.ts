// FOOTBASE — shared "download an arbitrary image URL and compress to webp"
// helper, factored out once a 3rd crest source (FERJ, direct URL from its own
// match-page HTML) needed the exact same fetch+convert logic already written
// twice (`cbf-crest.ts`'s formula-based CDN fetch, `wikipedia-crest.ts`'s
// article-summary fetch).

import sharp from "sharp";
import { crestWebpQualityCandidates, detectCrestSourceType } from "../../club-crest.ts";
import { CLUB_CREST_RULES } from "../../club-panel-rules.ts";

export const CREST_FETCH_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Confirmed live (Session 54): this fetch hung the ENTIRE executor indefinitely on a
// new club's crest host stalling mid-request — directly contradicting the "never
// allowed to block ingestion" intent below, since a plain `fetch()` with no timeout
// blocks forever on a dropped connection and a bare try/catch never sees a promise
// that simply never resolves. Same fix as `extract-pdf-text.ts`/`fmf-discover.ts`.
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Downloads and compresses whatever image is at `url`. Returns `null` on any
 * failure (network, non-image response, or too big even at the lowest
 * quality) — a crest is a visual nicety, never allowed to block ingestion.
 */
export async function fetchCrestWebpFromUrl(url: string): Promise<Uint8Array | null> {
  let bytes: Uint8Array;
  try {
    const res = await fetch(url, { headers: { "User-Agent": CREST_FETCH_USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
  if (!detectCrestSourceType(bytes)) return null;

  for (const quality of crestWebpQualityCandidates()) {
    const webp = await sharp(Buffer.from(bytes))
      .resize(CLUB_CREST_RULES.maxDimension, CLUB_CREST_RULES.maxDimension, { fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    if (webp.byteLength <= CLUB_CREST_RULES.maxOutputBytes) return new Uint8Array(webp);
  }
  return null;
}
