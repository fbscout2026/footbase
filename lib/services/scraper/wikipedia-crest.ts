// FOOTBASE — escudo de alta fidelidade via Wikipédia (fundo transparente de verdade),
// só pros clubes profissionais bem conhecidos listados em `curated-crest-sources.ts`.
//
// Por quê Wikipédia e não um link de imagem fixo: a API REST
// `page/summary/{título}` é consultada ao vivo (não é uma URL de imagem
// "adivinhada" por hash, que quebraria a qualquer redeploy de arquivo) e devolve a
// imagem de destaque do artigo — pra um clube de futebol tradicional, isso é quase
// sempre o próprio escudo em PNG/SVG com transparência real. Falha graciosamente
// (retorna null) se o título não existir ou não tiver imagem — cai no fallback do
// CDN oficial da CBF (`cbf-crest.ts`), que nunca falta mas não tem transparência.

import { fetchCrestWebpFromUrl } from "./crest-fetch.ts";

const USER_AGENT = "FootbaseBot/1.0 (footbasescout@gmail.com) scouting-platform-crest-fetch";

// See discovery/fmf-discover.ts's identical comment — confirmed live that an untimed
// `fetch()` can hang the whole executor forever on one stalled request.
const FETCH_TIMEOUT_MS = 30_000;

export async function fetchWikipediaCrestWebp(pageTitle: string): Promise<Uint8Array | null> {
  let thumbnailUrl: string | null = null;
  try {
    const summaryRes = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!summaryRes.ok) return null;
    const summary = (await summaryRes.json()) as { thumbnail?: { source?: string }; originalimage?: { source?: string } };
    thumbnailUrl = summary.originalimage?.source ?? summary.thumbnail?.source ?? null;
  } catch {
    return null;
  }
  if (!thumbnailUrl) return null;
  // No `.flatten()` inside the shared fetcher — keeps the source's alpha channel
  // (PNG/webp) intact; a JPEG (no alpha) would just have no transparency to
  // recover anyway, same limitation as the CBF fallback.
  return fetchCrestWebpFromUrl(thumbnailUrl);
}
