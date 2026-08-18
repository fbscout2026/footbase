import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestReport, ParsedMatch } from "./types.ts";
import { validateParsedMatch } from "./validate.ts";
import { reconcileParsedMatch } from "./reconciliation.ts";
import { assertLiveIngestionAllowed } from "./ingestion-gate.ts";

// Phase 6.1 orchestrator (format-agnostic). Idempotent upserts keyed by the stable
// keys: torneios (find-or-create by name+federation+year+category), clubes.source_key,
// atletas.bid, partidas_sumula (torneio_id,match_date,home,away), atuacoes_sumula
// (partida_id,bid). MUST run with `dryRun: true` first (validates + plans, never
// writes) — live ingestion stays blocked until the Fase 6.5 checks pass. Only ever
// call with the service_role admin client, from a server context.
//
// Contract: the scraper NEVER overwrites user-governed data (posse, favoritos,
// correções, decisões admin). It only touches institutional fields it owns.
export async function ingestMatch(admin: SupabaseClient, parsed: ParsedMatch, opts: { dryRun: boolean }): Promise<IngestReport> {
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
  const reconciliationErrors = reconcileParsedMatch(parsed);
  report.errors.push(...reconciliationErrors);

  // Which appearance BIDs can we resolve to a real atleta row? Existing rows + any
  // parsed athlete (birth_date is now NULLABLE, so an athlete can be seeded with just
  // BID + name and have the birth date backfilled later). An appearance is only
  // skipped if there is no athlete record at all to seed from.
  const apBids = [...new Set(parsed.appearances.map((a) => a.bid))];
  const { data: existing, error: existErr } = await admin.from("atletas").select("bid").in("bid", apBids);
  if (existErr) { report.errors.push(`athlete lookup failed: ${existErr.message}`); return report; }
  const existingBids = new Set((existing ?? []).map((r) => Number(r.bid)));
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
    const found = await admin.from("torneios").select("id").eq("name", t.name).eq("federation", t.federation).eq("year", t.year).eq("category", t.category).maybeSingle();
    if (found.error) throw found.error;
    if (found.data) torneioId = String(found.data.id);
    else {
      const created = await admin.from("torneios").insert({ name: t.name, federation: t.federation, year: t.year, category: t.category }).select("id").single();
      if (created.error) throw created.error;
      torneioId = String(created.data.id);
    }
    report.tournamentResolved = true;

    // Seed/refresh clubs by source_key (institutional fields only).
    const clubIds: Record<"home" | "away", string> = { home: "", away: "" };
    for (const side of ["home", "away"] as const) {
      const c = parsed[side];
      const up = await admin.from("clubes").upsert({ source_key: c.sourceKey, name: c.name, state: c.state ?? null, federacao: c.federacao ?? null }, { onConflict: "source_key" }).select("id").single();
      if (up.error) throw up.error;
      clubIds[side] = String(up.data.id);
      report.clubsUpserted++;
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
          const upd = await admin.from("atletas").update(fields).eq("bid", a.bid);
          if (upd.error) throw upd.error;
        }
        continue;
      }
      // New athlete: birth_date may be null (backfilled later); nacionalidade keeps
      // its column default when the source doesn't provide one.
      const seed: Record<string, unknown> = { bid: a.bid, name: a.name, birth_date: a.birthDate ?? null, main_position: a.mainPosition ?? null };
      if (a.nacionalidade) seed.nacionalidade = a.nacionalidade;
      const ins = await admin.from("atletas").insert(seed).select("bid").single();
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

    // Upsert appearances (resolvable BIDs only).
    const rows = parsed.appearances.filter((a) => resolvableBids.has(a.bid)).map((a) => ({
      partida_id: partidaId, bid_atleta: a.bid, player_category: a.playerCategory, minutes_played: a.minutesPlayed,
      goals: a.goals, assists: a.assists, yellow_cards: a.yellowCards, red_cards: a.redCards, clean_sheet: a.cleanSheet,
    }));
    if (rows.length > 0) {
      const ins = await admin.from("atuacoes_sumula").upsert(rows, { onConflict: "partida_id,bid_atleta" }).select("id");
      if (ins.error) throw ins.error;
      report.appearancesUpserted = rows.length;
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
