// FOOTBASE Session 55 — one-off historical backfill for `atuacoes_sumula.club_id` +
// `atuacao_cartoes`.
//
// The parsers only just started capturing card reasons and per-appearance club_id
// (see parse-*-events.ts and ingest.ts). Súmula PDFs are discarded after processing
// (CLAUDE.md's PDF-discard policy — only `partidas_sumula.source_url` survives), so
// the ~1,300 matches already ingested before this change have neither field. This
// re-fetches each match's súmula from its still-live `source_url`, re-parses it with
// the NOW-updated parsers, and fills in ONLY those two fields for the appearances
// that already exist — it never touches goals/minutes/cards counts/anything else,
// and never calls `ingestMatch` (that would re-upsert clubs/athletes/torneios, a much
// bigger blast radius than this backfill actually needs).
//
// Dry-run by default (fetches + parses + reports counts, writes nothing) — pass
// --confirm to actually write. Optional --source=CBF|FGF|FMF|FERJ and --limit=N to
// run a scoped/chunked pass (useful for a first real-write sample before the full run,
// per CLAUDE.md's "amostra de uma súmula real" release gate).
//
// Run: node --experimental-strip-types lib/services/scraper/backfill-card-reasons.ts [--confirm] [--source=CBF] [--limit=20]

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fetchSumulaText } from "./extract-pdf-text.ts";
import { parseCbfSumula } from "./parse-cbf-sumula.ts";
import { parseFmfSumula } from "./parse-fmf-sumula.ts";
import { parseFerjSumulaPdf } from "./parse-ferj-sumula.ts";
import { buildFerjSumula } from "./parse-ferj-events.ts";
import { buildParsedMatchFromFerj } from "./ferj-to-parsed-match.ts";
import { fetchFerjMatchPage } from "./discovery/ferj-discover.ts";
import { forEachRateLimited } from "./rate-limit.ts";

function loadEnvLocal(): void {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

interface ReparsedAppearance {
  bid: number;
  side: "home" | "away";
  yellowCardReasons?: (string | null)[];
  redCardReasons?: (string | null)[];
}

interface Partida {
  id: string;
  federation: string;
  source_url: string;
  home_club_id: string | null;
  away_club_id: string | null;
}

async function reparseCbfLike(sourceUrl: string, federation: "CBF" | "FGF"): Promise<ReparsedAppearance[]> {
  const text = await fetchSumulaText(sourceUrl);
  const { match } = parseCbfSumula(text, {
    sourceUrl,
    federation: federation === "FGF" ? "FGF" : undefined,
    clubFederacao: federation === "FGF" ? "FGF" : undefined,
  });
  return match.appearances
    .filter((a): a is typeof a & { side: "home" | "away" } => a.side != null)
    .map((a) => ({ bid: a.bid, side: a.side, yellowCardReasons: a.yellowCardReasons, redCardReasons: a.redCardReasons }));
}

async function reparseFmf(sourceUrl: string): Promise<ReparsedAppearance[]> {
  const text = await fetchSumulaText(sourceUrl);
  const { match } = parseFmfSumula(text, { sourceUrl });
  return match.appearances
    .filter((a): a is typeof a & { side: "home" | "away" } => a.side != null)
    .map((a) => ({ bid: a.bid, side: a.side, yellowCardReasons: a.yellowCardReasons, redCardReasons: a.redCardReasons }));
}

async function reparseFerj(admin: SupabaseClient, sourceUrl: string, matchIdByUrl: Map<string, number>): Promise<ReparsedAppearance[]> {
  const matchId = matchIdByUrl.get(sourceUrl);
  if (matchId == null) throw new Error(`no scraping_jobs FERJ ref found for source_url ${sourceUrl}`);
  const { html, sumulaPdfUrl } = await fetchFerjMatchPage(matchId);
  if (!sumulaPdfUrl) throw new Error(`FERJ match ${matchId} no longer has a súmula link`);
  const pdfText = await fetchSumulaText(sumulaPdfUrl);
  const pdf = parseFerjSumulaPdf(pdfText);
  const { match: ferjMatch } = buildFerjSumula(pdf, html, { sourceUrl: sumulaPdfUrl });
  const { match } = await buildParsedMatchFromFerj(admin, ferjMatch);
  return match.appearances
    .filter((a): a is typeof a & { side: "home" | "away" } => a.side != null)
    .map((a) => ({ bid: a.bid, side: a.side, yellowCardReasons: a.yellowCardReasons, redCardReasons: a.redCardReasons }));
}

interface MatchSummary {
  partidaId: string;
  federation: string;
  clubIdsFilled: number;
  cardRowsInserted: number;
  error?: string;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");
  const sourceArg = args.find((a) => a.startsWith("--source="))?.split("=")[1];
  const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = limitArg ? Number(limitArg) : undefined;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key);

  console.log(`[backfill] modo: ${confirm ? "LIVE (vai escrever)" : "DRY-RUN (nenhuma escrita)"}${sourceArg ? `, fonte=${sourceArg}` : ""}${limit ? `, limit=${limit}` : ""}`);

  // --- Load every torneio's federation, then every partida with a source_url --------
  const { data: torneios, error: torneiosErr } = await admin.from("torneios").select("id, federation");
  if (torneiosErr) throw torneiosErr;
  const federationByTorneio = new Map((torneios ?? []).map((t) => [t.id as string, t.federation as string]));

  const partidas: Partida[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("partidas_sumula")
      .select("id, torneio_id, source_url, home_club_id, away_club_id")
      .not("source_url", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const p of data) {
      const federation = federationByTorneio.get(p.torneio_id as string);
      if (!federation || !p.source_url) continue;
      if (sourceArg && federation !== sourceArg) continue;
      partidas.push({ id: p.id as string, federation, source_url: p.source_url as string, home_club_id: p.home_club_id as string | null, away_club_id: p.away_club_id as string | null });
    }
    if (data.length < PAGE) break;
  }
  const scoped = limit ? partidas.slice(0, limit) : partidas;
  console.log(`[backfill] ${scoped.length} partida(s) para reprocessar (de ${partidas.length} candidatas)`);

  // --- FERJ needs its numeric matchId to re-fetch the HTML event page — recovered
  // from scraping_jobs (ref = matchId, payload.url = the súmula PDF url it wrote). ---
  const matchIdByUrl = new Map<string, number>();
  if (!sourceArg || sourceArg === "FERJ") {
    const { data: jobs, error: jobsErr } = await admin
      .from("scraping_jobs")
      .select("ref, payload")
      .eq("source", "FERJ")
      .eq("job_type", "sumula")
      .eq("status", "done");
    if (jobsErr) throw jobsErr;
    for (const j of jobs ?? []) {
      const payloadUrl = (j.payload as { url?: string } | null)?.url;
      if (payloadUrl) matchIdByUrl.set(payloadUrl, Number(j.ref));
    }
  }

  const summaries: MatchSummary[] = [];

  const outcomes = await forEachRateLimited(
    scoped,
    async (p) => {
      let appearances: ReparsedAppearance[];
      if (p.federation === "CBF" || p.federation === "FGF") appearances = await reparseCbfLike(p.source_url, p.federation);
      else if (p.federation === "FMF") appearances = await reparseFmf(p.source_url);
      else if (p.federation === "FERJ") appearances = await reparseFerj(admin, p.source_url, matchIdByUrl);
      else throw new Error(`fonte sem reprocessador: ${p.federation}`);

      // Only appearances that already exist in atuacoes_sumula for this match — this
      // backfill never creates/removes appearances, only fills the two new fields.
      const { data: existing, error: exErr } = await admin.from("atuacoes_sumula").select("id, bid_atleta").eq("partida_id", p.id);
      if (exErr) throw exErr;
      const atuacaoIdByBid = new Map((existing ?? []).map((r) => [Number(r.bid_atleta), r.id as string]));

      const clubUpdates: { id: string; club_id: string }[] = [];
      const cardRows: { atuacao_id: string; card_type: "yellow" | "red"; reason: string }[] = [];
      const affectedAtuacaoIds: string[] = [];

      for (const a of appearances) {
        const atuacaoId = atuacaoIdByBid.get(a.bid);
        if (!atuacaoId) continue; // player unresolved at ingestion time — nothing to backfill
        const clubId = a.side === "home" ? p.home_club_id : p.away_club_id;
        if (clubId) clubUpdates.push({ id: atuacaoId, club_id: clubId });
        let hadCards = false;
        for (const reason of a.yellowCardReasons ?? []) {
          if (reason) { cardRows.push({ atuacao_id: atuacaoId, card_type: "yellow", reason }); hadCards = true; }
        }
        for (const reason of a.redCardReasons ?? []) {
          if (reason) { cardRows.push({ atuacao_id: atuacaoId, card_type: "red", reason }); hadCards = true; }
        }
        if (hadCards) affectedAtuacaoIds.push(atuacaoId);
      }

      if (confirm) {
        if (clubUpdates.length > 0) {
          // NOT a bulk `.upsert()` — with only {id, club_id} supplied, supabase-js still
          // builds a full-row INSERT for the ON CONFLICT path, so every column absent
          // from the object (partida_id, bid_atleta, ...) comes through as NULL and
          // trips their NOT NULL constraints (confirmed live: 23502 on partida_id).
          // Targeted per-row UPDATEs are the only way to touch just this one column.
          // Parallelized within the match (all independent single-row updates to
          // different ids, bounded by roster size — no shared state, safe to race).
          const results = await Promise.all(clubUpdates.map((u) => admin.from("atuacoes_sumula").update({ club_id: u.club_id }).eq("id", u.id)));
          const failed = results.find((r) => r.error);
          if (failed?.error) throw failed.error;
        }
        if (affectedAtuacaoIds.length > 0) {
          const del = await admin.from("atuacao_cartoes").delete().in("atuacao_id", affectedAtuacaoIds);
          if (del.error) throw del.error;
        }
        if (cardRows.length > 0) {
          const ins = await admin.from("atuacao_cartoes").insert(cardRows);
          if (ins.error) throw ins.error;
        }
      }

      return { partidaId: p.id, federation: p.federation, clubIdsFilled: clubUpdates.length, cardRowsInserted: cardRows.length } satisfies MatchSummary;
    },
    { minDelayMs: 900, jitterMs: 400 },
  );

  for (let i = 0; i < scoped.length; i++) {
    const o = outcomes[i]!;
    if (o.error) summaries.push({ partidaId: scoped[i]!.id, federation: scoped[i]!.federation, clubIdsFilled: 0, cardRowsInserted: 0, error: o.error });
    else summaries.push(o.result!);
  }

  const byFed = new Map<string, { matches: number; ok: number; errors: number; clubIds: number; cards: number }>();
  for (const s of summaries) {
    const bucket = byFed.get(s.federation) ?? { matches: 0, ok: 0, errors: 0, clubIds: 0, cards: 0 };
    bucket.matches++;
    if (s.error) bucket.errors++;
    else bucket.ok++;
    bucket.clubIds += s.clubIdsFilled;
    bucket.cards += s.cardRowsInserted;
    byFed.set(s.federation, bucket);
  }

  console.log(`\n[backfill] resumo (${confirm ? "LIVE" : "DRY-RUN"}):`);
  for (const [fed, b] of byFed) {
    console.log(`  ${fed}: ${b.matches} partida(s) — ${b.ok} ok, ${b.errors} erro(s) — club_id preenchido em ${b.clubIds} atuação(ões), ${b.cards} cartão(ões) com motivo`);
  }
  const errors = summaries.filter((s) => s.error);
  if (errors.length > 0) {
    console.log(`\n[backfill] erros (${errors.length}):`);
    for (const e of errors.slice(0, 20)) console.log(`  ${e.federation} ${e.partidaId}: ${e.error}`);
    if (errors.length > 20) console.log(`  ... e mais ${errors.length - 20}`);
  }
}

main().catch((e) => {
  console.error("[backfill] falhou:", e);
  process.exit(1);
});
