// FOOTBASE — escudo oficial do clube via CDN da CBF (download + compressão webp).
//
// A CBF serve o escudo de cada clube numa URL previsível, chaveada pelo id numérico
// do próprio clube: `https://conteudo.cbf.com.br/clubes/{id}/escudo.jpg` — o mesmo
// CDN das súmulas em PDF e do campo `clube_escudo` do endpoint de registro de
// atletas (confirmado ao vivo, Sessions 44/52). Sem Cloudflare/bot-detection nesse
// host, então `fetch` puro basta.

import { fetchCrestWebpFromUrl } from "./crest-fetch.ts";

export function cbfCrestUrl(clubeIdCbf: number): string {
  return `https://conteudo.cbf.com.br/clubes/${clubeIdCbf}/escudo.jpg`;
}

/**
 * Baixa e comprime o escudo oficial de um clube pelo id numérico da CBF. Retorna
 * `null` quando o clube ainda não tem escudo publicado (404 — comum em clubes
 * menores/amadores) ou qualquer outra falha de fetch/decodificação.
 */
export async function fetchCbfCrestWebp(clubeIdCbf: number): Promise<Uint8Array | null> {
  return fetchCrestWebpFromUrl(cbfCrestUrl(clubeIdCbf));
}
