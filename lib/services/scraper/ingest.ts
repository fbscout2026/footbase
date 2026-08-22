import type { SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import type { IngestReport, ParsedMatch } from "./types.ts";
import { validateParsedMatch } from "./validate.ts";
import { reconcileParsedMatch } from "./reconciliation.ts";
import { assertLiveIngestionAllowed } from "./ingestion-gate.ts";
import { fetchCbfCrestWebp } from "./cbf-crest.ts";
import { fetchWikipediaCrestWebp } from "./wikipedia-crest.ts";
import { fetchCrestWebpFromUrl } from "./crest-fetch.ts";
import { CURATED_WIKIPEDIA_CREST_BY_CBF_SOURCE_KEY } from "./curated-crest-sources.ts";

// Only clubs seeded with a REAL numeric CBF club id (`cbf:{id}` — wired once the
// discovery layer supplies `idClubeMandante`/`idClubeVisitante`, Session 52) have a
// known escudo URL derivable by formula; provisional/other-source clubs are
// skipped, not guessed at.
const CBF_CLUB_SOURCE_KEY_RE = /^cbf:(\d+)$/;

/**
 * Baixa e grava o escudo oficial do clube pra um clube recém-upsertado, se ainda
 * não tiver um (nunca sobrescreve um `webp_crest_url` já existente — pode ter
 * sido curado manualmente). Nunca lança: escudo é melhoria visual, não pode
 * derrubar a ingestão da partida.
 *
 * Convenção fixada pelo usuário (Session 52) — vale pra QUALQUER fonte nova, não
 * só CBF: assim que uma federação é ligada, seu escudo já vem automático desde o
 * primeiro PR, nunca como retrabalho depois. Três estratégias, na ordem:
 *   1. `crestUrl` que a própria fonte já entrega (ex.: FERJ traz a URL real do
 *      escudo direto no HTML da súmula — não precisa nem sabe formular).
 *   2. Lista curada da Wikipédia (só CBF por ora — fundo transparente de
 *      verdade pros clubes profissionais bem conhecidos).
 *   3. CDN oficial da própria fonte por fórmula (só CBF por ora, `{id}/escudo.jpg`
 *      — sem transparência, mas nunca falta).
 */
async function ensureClubCrest(admin: SupabaseClient, clubId: string, sourceKey: string, currentCrestUrl: string | null, directCrestUrl: string | null | undefined, fileNamePrefix: string): Promise<void> {
  if (currentCrestUrl) return;
  try {
    const curatedTitle = CURATED_WIKIPEDIA_CREST_BY_CBF_SOURCE_KEY[sourceKey];
    const cbfMatch = sourceKey.match(CBF_CLUB_SOURCE_KEY_RE);
    const webp =
      (directCrestUrl ? await fetchCrestWebpFromUrl(directCrestUrl) : null) ??
      (curatedTitle ? await fetchWikipediaCrestWebp(curatedTitle) : null) ??
      (cbfMatch ? await fetchCbfCrestWebp(Number(cbfMatch[1]!)) : null);
    if (!webp) return;
    const fileName = `${fileNamePrefix}.webp`;
    mkdirSync("public/crests", { recursive: true });
    writeFileSync(`public/crests/${fileName}`, webp);
    await admin.from("clubes").update({ webp_crest_url: `/crests/${fileName}` }).eq("id", clubId);
  } catch {
    // escudo é melhoria visual — qualquer falha (rede, sharp, disco) é silenciosamente ignorada
  }
}

// Phase 6.1 orchestrator (format-agnostic). Idempotent upserts keyed by the stable
// keys: torneios (find-or-create by name+federation+year+category), clubes.source_key,
// atletas.bid, partidas_sumula (torneio_id,match_date,home,away), atuacoes_sumula
// (partida_id,bid). MUST run with `dryRun: true` first (validates + plans, never
// writes) — live ingestion stays blocked until the Fase 6.5 checks pass. Only ever
// call with the service_role admin client, from a server context.
//
// Contract: the scraper NEVER overwrites user-governed data (posse, favoritos,
// correções, decisões admin). It only touches institutional fields it owns.
export async function ingestMatch(admin: SupabaseClient, parsed: ParsedMatch, opts: { dryRun: boolean; allowPartialAppearances?: boolean }): Promise<IngestReport> {
  const report: IngestReport = {
    dryRun: opts.dryRun,
    scrapingLogId: null,
    tournamentResolved: false,
    clubsUpserted: 0,
    athletesSeeded: 0,
    matchUpserted: false,
    appearancesUpserted: 0,
    skippedAppearances: 0,
    errors: [],
  };

  const validationErrors = validateParsedMatch(parsed);
  if (validationErrors.length > 0) {
    report.errors.push(...validationErrors);
    return report; // never proceed on structurally invalid input
  }

  // Semantic reconciliation (6.5): a mismatch here means a degraded parse / layout
  // change. Surfaced in both modes; on a live run it blocks the write below.
  const reconciliationErrors = reconcileParsedMatch(parsed, { allowPartialAppearances: opts.allowPartialAppearances });
  report.errors.push(...reconciliationErrors);

  // Which appearance BIDs can we resolve to a real atleta row? Existing rows + any
  // parsed athlete (birth_date is now NULLABLE, so an athlete can be seeded with just
  // BID + name and have the birth date backfilled later). An appearance is only
  // skipped if there is no athlete record at all to seed from.
  const apBids = [...new Set(parsed.appearances.map((a) => a.bid))];
  const { data: existing, error: existErr } = await admin.from("atletas").select("fb_id").in("fb_id", apBids);
  if (existErr) { report.errors.push(`athlete lookup failed: ${existErr.message}`); return report; }
  const existingBids = new Set((existing ?? []).map((r) => Number(r.fb_id)));
  const seedable = new Map(parsed.athletes.map((a) => [a.bid, a]));
  const resolvableBids = new Set<number>();
  for (const bid of apBids) {
    if (existingBids.has(bid) || seedable.has(bid)) resolvableBids.add(bid);
    else report.errors.push(`athlete BID ${bid} has an appearance but no athlete record — appearance skipped`);
  }
  report.skippedAppearances = parsed.appearances.filter((a) => !resolvableBids.has(a.bid)).length;

  if (opts.dryRun) {
    // Plan only — count what WOULD be written, without touching the database.
    report.tournamentResolved = true;
    report.clubsUpserted = 2;
    report.athletesSeeded = apBids.filter((b) => !existingBids.has(b) && seedable.has(b)).length;
    report.matchUpserted = true;
    report.appearancesUpserted = parsed.appearances.filter((a) => resolvableBids.has(a.bid)).length;
    return report;
  }

  // ---- Live path (only reachable once Fase 6.5 gating allows it) ----
  // Hard gate: refuse to write unless live ingestion was explicitly enabled.
  assertLiveIngestionAllowed();
  // Never write a parse that failed reconciliation — mark the job for retry instead.
  if (reconciliationErrors.length > 0) return report;

  const t = parsed.tournament;
  const run = await admin.from("scraping_logs").insert({ source: t.federation, target_url: parsed.sourceUrl ?? null, status: "running" }).select("id").single();
  if (run.error) { report.errors.push(`scraping_logs start failed: ${run.error.message}`); return report; }
  report.scrapingLogId = String(run.data.id);

  try {
    // Resolve tournament (find-or-create; torneios has no unique key).
    let torneioId: string;
    const found = await admin.from("torneios").select("id,federacao_id").eq("name", t.name).eq("federation", t.federation).eq("year", t.year).eq("category", t.category).maybeSingle();
    if (found.error) throw found.error;
    // `federacoes.sigla` matches the source's federation code ("CBF"/"FPF"/"FERJ") —
    // without this FK the Torneios explorer's federação/categoria filter (which
    // matches on `federacao_id`) silently returns zero results for every ingested
    // tournament, even though the tournament itself is visible (Session 52, reported
    // live: national-federation filter showed categories but the results list stayed
    // empty). A source whose federação isn't seeded yet (e.g. before FERJ's row
    // exists) just leaves it null — never blocks ingestion.
    const fed = await admin.from("federacoes").select("id").eq("sigla", t.federation).maybeSingle();
    const federacaoId = fed.data ? String(fed.data.id) : null;
    if (found.data) {
      torneioId = String(found.data.id);
      if (federacaoId && !found.data.federacao_id) {
        await admin.from("torneios").update({ federacao_id: federacaoId }).eq("id", torneioId);
      }
    } else {
      const created = await admin.from("torneios").insert({ name: t.name, federation: t.federation, year: t.year, category: t.category, federacao_id: federacaoId }).select("id").single();
      if (created.error) throw created.error;
      torneioId = String(created.data.id);
    }
    report.tournamentResolved = true;

    // Seed/refresh clubs by source_key (institutional fields only).
    const clubIds: Record<"home" | "away", string> = { home: "", away: "" };
    for (const side of ["home", "away"] as const) {
      const c = parsed[side];
      const up = await admin.from("clubes").upsert({ source_key: c.sourceKey, name: c.name, state: c.state ?? null, federacao: c.federacao ?? null }, { onConflict: "source_key" }).select("id,webp_crest_url").single();
      if (up.error) throw up.error;
      clubIds[side] = String(up.data.id);
      report.clubsUpserted++;
      await ensureClubCrest(admin, clubIds[side], c.sourceKey, up.data.webp_crest_url, c.crestUrl, c.sourceKey.replace(":", "-"));
    }

    // Seed missing athletes and refresh existing ones ("súmula/fonte vence"): the
    // scraper owns FACTUAL/bio fields but NEVER governance columns (agent_id,
    // claim_status) — those are simply not in the write object. Precedence rule:
    // a field the source PROVIDES overwrites; a field it OMITS is preserved, never
    // nulled (so the refresh only carries fields that are actually present).
    for (const bid of apBids) {
      const a = seedable.get(bid);
      if (!a) continue; // has an appearance but no athlete record → already skipped
      if (existingBids.has(bid)) {
        const fields: Record<string, unknown> = {};
        if (a.name?.trim()) fields.name = a.name;
        if (a.birthDate) fields.birth_date = a.birthDate;
        if (a.nacionalidade) fields.nacionalidade = a.nacionalidade;
        if (a.mainPosition) fields.main_position = a.mainPosition;
        if (Object.keys(fields).length > 0) {
          const upd = await admin.from("atletas").update(fields).eq("fb_id", a.bid);
          if (upd.error) throw upd.error;
        }
        continue;
      }
      // New athlete: birth_date may be null (backfilled later); nacionalidade keeps
      // its column default when the source doesn't provide one.
      const seed: Record<string, unknown> = { fb_id: a.bid, name: a.name, birth_date: a.birthDate ?? null, main_position: a.mainPosition ?? null };
      if (a.nacionalidade) seed.nacionalidade = a.nacionalidade;
      const ins = await admin.from("atletas").insert(seed).select("fb_id").single();
      if (ins.error) throw ins.error;
      report.athletesSeeded++;
    }

    // Upsert the match by its stable identity.
    const match = await admin.from("partidas_sumula").upsert({
      torneio_id: torneioId, match_date: parsed.matchDate, match_category: parsed.matchCategory, rodada: parsed.rodada ?? null,
      home_club_id: clubIds.home, away_club_id: clubIds.away, home_score: parsed.homeScore ?? null, away_score: parsed.awayScore ?? null,
      scraping_log_id: report.scrapingLogId, source_url: parsed.sourceUrl ?? null,
    }, { onConflict: "torneio_id,match_date,home_club_id,away_club_id" }).select("id").single();
    if (match.error) throw match.error;
    report.matchUpserted = true;
    const partidaId = String(match.data.id);

    // Upsert appearances (resolvable BIDs only). `club_id` (Session 55) is the
    // club THIS appearance was for — already known via `a.side`, same source
    // as the current_club_id-refresh loop below, just persisted now instead
    // of only used transiently.
    const resolvableAppearances = parsed.appearances.filter((a) => resolvableBids.has(a.bid));
    const rows = resolvableAppearances.map((a) => ({
      partida_id: partidaId, fb_id_atleta: a.bid, player_category: a.playerCategory, minutes_played: a.minutesPlayed,
      goals: a.goals, assists: a.assists, yellow_cards: a.yellowCards, red_cards: a.redCards, clean_sheet: a.cleanSheet,
      club_id: a.side ? clubIds[a.side] : null,
    }));
    if (rows.length > 0) {
      const ins = await admin.from("atuacoes_sumula").upsert(rows, { onConflict: "partida_id,fb_id_atleta" }).select("id,fb_id_atleta");
      if (ins.error) throw ins.error;
      report.appearancesUpserted = rows.length;

      // Card reasons (Session 55) — one row per real card event, straight
      // from the súmula's own "Motivo:" text. Delete-then-insert scoped to
      // just these atuações, so reprocessing the same match (a correction,
      // or the Session 55 historical backfill) never duplicates rows.
      const atuacaoIdByBid = new Map((ins.data ?? []).map((r) => [Number(r.fb_id_atleta), r.id as string]));
      const cardRows: { atuacao_id: string; card_type: "yellow" | "red"; reason: string }[] = [];
      for (const a of resolvableAppearances) {
        const atuacaoId = atuacaoIdByBid.get(a.bid);
        if (!atuacaoId) continue;
        for (const reason of a.yellowCardReasons ?? []) {
          if (reason) cardRows.push({ atuacao_id: atuacaoId, card_type: "yellow", reason });
        }
        for (const reason of a.redCardReasons ?? []) {
          if (reason) cardRows.push({ atuacao_id: atuacaoId, card_type: "red", reason });
        }
      }
      const affectedAtuacaoIds = [...atuacaoIdByBid.values()];
      if (affectedAtuacaoIds.length > 0) {
        const del = await admin.from("atuacao_cartoes").delete().in("atuacao_id", affectedAtuacaoIds);
        if (del.error) throw del.error;
      }
      if (cardRows.length > 0) {
        const cardIns = await admin.from("atuacao_cartoes").insert(cardRows);
        if (cardIns.error) throw cardIns.error;
      }
    }

    // Keep `atletas.current_club_id`/`current_category` up to date from this match's
    // appearances (Session 52: these were never written anywhere — every scraped
    // athlete had a null "current club" forever, which silently broke squad listings
    // and `view_clube_resumo`'s athlete counts even though the match/appearance data
    // itself was correct). Only updates when THIS match is the athlete's most recent
    // one on record (derived from the ground truth in `atuacoes_sumula`/
    // `partidas_sumula`, not from processing order — matches aren't necessarily
    // (re)ingested chronologically), so an older match reprocessed later never
    // clobbers a club a player has since transferred to.
    for (const a of parsed.appearances) {
      if (!resolvableBids.has(a.bid) || !a.side) continue;
      const clubId = clubIds[a.side];
      const { data: newer } = await admin
        .from("atuacoes_sumula").select("id, partidas_sumula!inner(match_date)")
        .eq("fb_id_atleta", a.bid).gt("partidas_sumula.match_date", parsed.matchDate).limit(1).maybeSingle();
      if (newer) continue; // a more recent match already set the current club/category
      const upd = await admin.from("atletas").update({ current_club_id: clubId, current_category: parsed.matchCategory }).eq("fb_id", a.bid);
      if (upd.error) throw upd.error;
    }

    // Keep the precomputed stat columns on `atletas` fresh (Session 55):
    // `view_atleta_resumo` reads these directly now instead of a live
    // per-row LATERAL aggregate, which started hitting Postgres statement
    // timeouts on the dashboard once atuacoes_sumula grew past ~30k rows.
    // Runs AFTER the `current_category` update above (not right after the
    // appearances upsert) — `games_above_current_category` compares each
    // past match's category against the athlete's CURRENT category, so it
    // needs that column already reflecting this match before it computes.
    if (rows.length > 0) {
      for (const bid of new Set(rows.map((r) => r.fb_id_atleta))) {
        const { error: statsErr } = await admin.rpc("recompute_atleta_stats", { p_fb_id: bid });
        if (statsErr) report.errors.push(`stats recompute failed for bid ${bid}: ${statsErr.message}`);
      }
    }

    const status = report.errors.length > 0 ? "partial" : "success";
    await admin.from("scraping_logs").update({ status, records_ingested: report.appearancesUpserted, finished_at: new Date().toISOString(), error_message: report.errors.length > 0 ? report.errors.join("; ").slice(0, 2000) : null }).eq("id", report.scrapingLogId);
  } catch (e) {
    // CONFIRMED LIVE (Session 50): every `throw x.error` above throws a PostgrestError
    // -like object (has `.message`/`.details`/`.hint`/`.code`, never `instanceof
    // Error`) — `String(e)` on that gives the useless literal "[object Object]", which
    // is exactly what every `scraping_logs.error_message` row said during the first
    // live run, hiding the real cause (a missing unique constraint) behind a
    // meaningless string. Prefer `.message` on ANY object that has one before falling
    // back to `String(e)`.
    const message =
      e instanceof Error ? e.message : typeof e === "object" && e && "message" in e && typeof e.message === "string" ? e.message : String(e);
    report.errors.push(message);
    await admin.from("scraping_logs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: report.errors.join("; ").slice(0, 2000) }).eq("id", report.scrapingLogId);
  }

  return report;
}
