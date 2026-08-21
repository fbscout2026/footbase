// FOOTBASE Phase 6.x — the live ingestion executor.
//
// Standalone Node entry point (NOT a Next.js route) — run it directly:
//   npx playwright install chromium   # one-time, on the machine that will run this
//   npm run ingest:dry-run            # dry-run (default, never writes)
//
// This is the piece that was missing from every adapter built so far: it actually
// DISCOVERS matches, downloads each súmula, parses it, reconciles it, and either
// plans (dry-run) or writes (only with INGESTION_LIVE_ENABLED=true — see
// `ingestion-gate.ts`) via the SAME `ingestMatch` used by every other adapter.
//
// CBF discovery is plain `fetch` end to end (confirmed live: cbf.com.br has no
// bot-detection) — no browser involved. FPF discovery still needs Playwright:
// futebolpaulista.com.br sits behind a Cloudflare challenge that blocks even
// real-browser automation once it detects the session is Playwright-controlled (see
// `discovery/fpf-discover.ts`'s module doc) — there is no non-evasive fix for that
// today, so FPF ingestion stays on hold until we have authorized API/data access from
// the federation.
//
// NOT unit tested in this repo (drives a real browser against live third-party
// sites — can't run in this sandboxed environment). Validate it for real, on a
// machine with Playwright installed, before ever pointing it at a live gate.
//
// Rate limiting: every network loop goes through `forEachRateLimited` (see
// rate-limit.ts) — sequential, ~700-1000ms + jitter between requests per source,
// exactly the "~1-2 req/s" ceiling CLAUDE.md's operational design calls for. Sources
// are processed one at a time in this version too (not "distinct sources in
// parallel" yet, per CLAUDE.md's future design) — simpler to reason about and safer
// while this executor is new and unproven.

import { type Page } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchSumulaText } from "./extract-pdf-text.ts";
import { parseFpfSumula } from "./parse-fpf-sumula.ts";
import { reconcileFpfParsedMatch } from "./reconciliation-fpf.ts";
import { buildParsedMatchFromFpf } from "./fpf-to-parsed-match.ts";
import { parseCbfSumula } from "./parse-cbf-sumula.ts";
import { reconcileParsedMatch } from "./reconciliation.ts";
import { parseFerjSumulaPdf } from "./parse-ferj-sumula.ts";
import { buildFerjSumula } from "./parse-ferj-events.ts";
import { reconcileFerjParsedMatch } from "./reconciliation-ferj.ts";
import { buildParsedMatchFromFerj } from "./ferj-to-parsed-match.ts";
import { ingestMatch } from "./ingest.ts";
import { forEachRateLimited } from "./rate-limit.ts";
import { discoverFpfCurrentRound, discoverFpfRound } from "./discovery/fpf-discover.ts";
import { discoverCbfMatchesForPhase } from "./discovery/cbf-discover.ts";
import { discoverFerjMonth, fetchFerjMatchPage } from "./discovery/ferj-discover.ts";
import { discoverFmfCompetition } from "./discovery/fmf-discover.ts";
import { parseFmfSumula } from "./parse-fmf-sumula.ts";
import { discoverFgfCompetition, fetchFgfSumulaUrl } from "./discovery/fgf-discover.ts";
import { recordScrapingJob, getDoneJobRefs } from "./scraping-jobs.ts";
import { resolveAthleteIdentity } from "./resolve-athlete-identity.ts";
import { seedProvisionalAthlete, nextProvisionalBid } from "./provisional-athlete.ts";
import { createStealthSession, type StealthSession } from "./discovery/stealth-browser.ts";

// ---- Config: every source this executor knows about today ------------------------
// Adding the 26 remaining state federations means adding entries here (and their own
// discovery module, mirroring fpf-discover.ts) — the orchestrator loop below does not
// change per source.

interface FpfSourceConfig {
  kind: "fpf";
  label: string;
  idCampeonato: number;
  idCategoria: number;
  ano: number;
}

interface CbfSourceConfig {
  kind: "cbf";
  label: string;
  tabelaPhaseUrls: string[]; // one per phase (1ª Fase, Quartas, ...) — from the competition's tabela page
}

interface FerjSourceConfig {
  kind: "ferj";
  label: string;
  ano: number;
  meses: number[]; // FERJ discovery crawls the global /partidas listing month by month (see discovery/ferj-discover.ts)
}

interface FmfSourceConfig {
  kind: "fmf";
  label: string;
  d: number; // ProxJogos.aspx?d={id} — one competition/division's full-season listing
}

interface FgfSourceConfig {
  kind: "fgf";
  label: string;
  competitionId: number; // fgf.com.br/competicoes/amador/{id} — phases re-derived fresh every run
}

const FPF_SOURCES: FpfSourceConfig[] = [
  { kind: "fpf", label: "FPF SUB-11", idCampeonato: 125, idCategoria: 80, ano: 2026 },
  { kind: "fpf", label: "FPF SUB-12", idCampeonato: 203, idCategoria: 91, ano: 2026 },
  { kind: "fpf", label: "FPF SUB-13", idCampeonato: 127, idCategoria: 81, ano: 2026 },
  { kind: "fpf", label: "FPF SUB-14", idCampeonato: 202, idCategoria: 90, ano: 2026 },
  { kind: "fpf", label: "FPF SUB-15", idCampeonato: 32, idCategoria: 17, ano: 2026 },
  { kind: "fpf", label: "FPF SUB-17", idCampeonato: 33, idCategoria: 18, ano: 2026 },
  { kind: "fpf", label: "FPF SUB-20 Série A", idCampeonato: 221, idCategoria: 94, ano: 2026 },
  { kind: "fpf", label: "FPF SUB-20 Série B", idCampeonato: 219, idCategoria: 93, ano: 2026 },
  { kind: "fpf", label: "FPF Copinha", idCampeonato: 75, idCategoria: 45, ano: 2026 },
];

// CBF competitions need their phase URLs discovered once per season (they're not a
// clean IdCampeonato/IdCategoria pair like FPF) — mapped live via the site's own
// "Competições" nav menu (Session 44). Every masculine youth (SUB-11..SUB-20)
// competition with active 2026 data is wired here; feminino is out of scope (explicit
// prior decision) and Copa do Brasil SUB-20 / Supercopa SUB-20 / Supercopa SUB-17
// exist in the menu but have no 2026 data yet (confirmed live — empty tabela page) so
// aren't included until they do. Competitions that mix round-robin + knock-out phases
// (Brasileirão SUB-20, SUB-20 B; Copa do Brasil SUB-17, SUB-15; Liga de
// Desenvolvimento SUB-13) list every phase's own idFase URL — `discoverCbfMatchesForPhase`
// auto-detects which shape each one is (see discovery/cbf-discover.ts's module doc).
// Competitions still in a single ongoing group stage (SUB-17, Copa do Nordeste SUB-20)
// only need their base tabela URL — no idFase segment required yet.
//
// ⚠️ YEARLY MAINTENANCE REQUIRED, unlike FERJ_SOURCES: every URL below is literal and
// carries the SEASON EDITION'S OWN id in its path (e.g. ".../sub-20/2026/2008" — 2008
// is the 1ª Fase's edition id, not a formula on the year), not a plain `ano` parameter
// a helper can compute. When CBF opens each competition's 2027 edition, these URLs
// stay pointed at the now-closed 2026 one FOREVER — no error, just zero new matches
// found from then on (same silent-staleness risk `currentYear()` fixes for FERJ,
// but there's no equivalent one-line fix here). Rediscovering next season's URLs
// (same method as Session 44: the site's own "Competições" tabela nav menu) is a
// yearly manual task until a dynamic edition-id lookup gets built.
const CBF_SOURCES: CbfSourceConfig[] = [
  {
    kind: "cbf",
    label: "CBF Brasileirão SUB-20",
    tabelaPhaseUrls: [
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20/2026/2008", // 1ª Fase
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20/2026/2070", // Quartas de Final
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20/2026/2076", // Semi Finais
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20/2026/2087", // Final
    ],
  },
  {
    kind: "cbf",
    label: "CBF Brasileirão SUB-20 B",
    tabelaPhaseUrls: [
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20-b/2026/2063",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20-b/2026/2067",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-20-b/2026/2073",
    ],
  },
  {
    kind: "cbf",
    label: "CBF Brasileirão SUB-17",
    tabelaPhaseUrls: ["https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/sub-17/2026"],
  },
  {
    kind: "cbf",
    label: "CBF Copa do Brasil SUB-17",
    tabelaPhaseUrls: [
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-17/2026/2006",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-17/2026/2014",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-17/2026/2032",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-17/2026/2056",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-17/2026/2062",
    ],
  },
  {
    kind: "cbf",
    label: "CBF Copa do Brasil SUB-15",
    tabelaPhaseUrls: [
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-15/2026/2045",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-15/2026/2057",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-15/2026/2072",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-15/2026/2079",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-15/2026/2081",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-brasil/sub-15/2026/2082",
    ],
  },
  {
    kind: "cbf",
    label: "CBF Copa do Nordeste SUB-20",
    tabelaPhaseUrls: ["https://www.cbf.com.br/futebol-brasileiro/tabelas/copa-do-nordeste/sub-20/2026"],
  },
  {
    kind: "cbf",
    label: "CBF Liga de Desenvolvimento SUB-13 Masculino",
    tabelaPhaseUrls: [
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/liga-de-desenvolvimento/sub-13-masculino/2026/2029",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/liga-de-desenvolvimento/sub-13-masculino/2026/2036",
      "https://www.cbf.com.br/futebol-brasileiro/tabelas/liga-de-desenvolvimento/sub-13-masculino/2026/2041",
    ],
  },
];

// Current year, computed at run time — NOT hardcoded. Confirmed live (Session 50):
// a source config with a literal `ano: 2026` doesn't error or warn when the calendar
// rolls over to 2027, it just silently stops discovering new matches (still "works",
// zero new results forever) — the kind of failure nobody notices without dedicated
// monitoring. `discoverFerjMonth(mes, ano)` already takes `ano` as a plain parameter
// (the FERJ site itself has a season selector back to 2008), so this alone is enough
// for FERJ to track the current season with no yearly maintenance. Any FUTURE
// federation adapter's own source config should use this same helper (not a literal
// year) for exactly the same reason — this isn't FERJ-specific, it's the convention.
const currentYear = (): number => new Date().getFullYear();

// One entry, not one per FERJ competition (unlike FPF/CBF) — discovery crawls the
// site's global match listing and filters by category label instead of walking a
// per-competition URL (see discovery/ferj-discover.ts's module doc for why: 100+
// base-football competitions with no stable per-competition id exposed to `fetch`).
const FERJ_SOURCES: FerjSourceConfig[] = [
  { kind: "ferj", label: "FERJ SUB-11..SUB-20", ano: currentYear(), meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
];

// One entry per competition/division `d` id — mapped live off fmf.com.br's own
// "Competições" nav (Session 54), same method as CBF_SOURCES. The competition NAME
// and category come from the súmula PDF's own "Competição:" header (parsed by
// `parseFmfSumula`), so no label/category duplication is needed here beyond a
// human-readable log tag. Feminino (`d=7,36,32,20`) is deliberately excluded — same
// pre-existing project-wide decision as FERJ/FPF.
//
// ⚠️ YEARLY MAINTENANCE, same caveat as CBF_SOURCES — see that config's comment.
const FMF_SOURCES: FmfSourceConfig[] = [
  { kind: "fmf", label: "FMF SUB-13 1ª Divisão", d: 40 },
  { kind: "fmf", label: "FMF SUB-13 2ª Divisão", d: 41 },
  { kind: "fmf", label: "FMF SUB-14 1ª Divisão", d: 15 },
  { kind: "fmf", label: "FMF SUB-14 2ª Divisão", d: 42 },
  { kind: "fmf", label: "FMF Troféu Inconfidência SUB-14", d: 39 },
  { kind: "fmf", label: "FMF SUB-15 1ª Divisão", d: 4 },
  { kind: "fmf", label: "FMF SUB-15 2ª Divisão", d: 12 },
  { kind: "fmf", label: "FMF Copa Inconfidência SUB-15", d: 33 },
  { kind: "fmf", label: "FMF SUB-17 1ª Divisão", d: 5 },
  { kind: "fmf", label: "FMF SUB-17 2ª Divisão", d: 13 },
  { kind: "fmf", label: "FMF Copa Inconfidência SUB-17", d: 34 },
  { kind: "fmf", label: "FMF SUB-20 1ª Divisão", d: 6 },
  { kind: "fmf", label: "FMF SUB-20 2ª Divisão", d: 31 },
  { kind: "fmf", label: "FMF Copa Inconfidência SUB-20", d: 35 },
  { kind: "fmf", label: "FMF SFAC SUB-20 Módulo 1", d: 24 },
  { kind: "fmf", label: "FMF SFAC SUB-20 Módulo 2", d: 25 },
  { kind: "fmf", label: "FMF SFAC SUB-17", d: 26 },
  { kind: "fmf", label: "FMF SFAC SUB-15", d: 27 },
];

// One entry per base competition, mapped live off fgf.com.br's own site (Session
// 55). Unlike CBF_SOURCES/FMF_SOURCES, the competition ids here are NOT edition-
// specific — `fgf.com.br/competicoes/amador/{id}` always resolves to (and exposes
// the phase links for) the CURRENT season on its own, re-derived fresh every run —
// **no yearly manual maintenance needed**, same guarantee as FERJ_SOURCES. Feminino
// (`/competicoes/feminino/{id}`) is deliberately excluded — same pre-existing
// project-wide decision as every other source.
const FGF_SOURCES: FgfSourceConfig[] = [
  { kind: "fgf", label: "FGF Gauchão Sub 20 A1", competitionId: 603 },
  { kind: "fgf", label: "FGF Gauchão Sub 20 A2", competitionId: 614 },
  { kind: "fgf", label: "FGF Gauchão Sub 17 A1", competitionId: 596 },
  { kind: "fgf", label: "FGF Gauchão Sub 17 A2", competitionId: 602 },
  { kind: "fgf", label: "FGF Gauchão Sub 15", competitionId: 62 },
  { kind: "fgf", label: "FGF Gauchão Sub 13", competitionId: 717 },
];

export interface ExecutorItemResult {
  source: string;
  sourceUrl: string;
  outcome: "ingested" | "reconciliation-failed" | "no-sumula-yet" | "fetch-failed" | "unresolved-players" | "write-failed" | "skipped-already-done";
  detail: string;
}

function loadEnvLocal(): void {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
}

async function processFpfSource(page: Page, admin: SupabaseClient, cfg: FpfSourceConfig, dryRun: boolean, touch: () => void): Promise<ExecutorItemResult[]> {
  const results: ExecutorItemResult[] = [];
  const rodadaAtual = await discoverFpfCurrentRound(page, cfg);
  touch();

  const rounds = Array.from({ length: rodadaAtual }, (_, i) => i + 1);
  const roundBatches = await forEachRateLimited(rounds, (r) => discoverFpfRound(page, { ...cfg, rodada: r }), { minDelayMs: 800, jitterMs: 400, onItemDone: touch });
  const matches = roundBatches.flatMap((b) => b.result ?? []).filter((m) => m.linkSumula);
  touch();

  const outcomes = await forEachRateLimited(
    matches,
    async (m) => {
      const text = await fetchSumulaText(m.linkSumula!);
      const { match: fpfMatch } = parseFpfSumula(text, {
        sourceUrl: m.linkSumula!,
        homeSourceKey: `fpf:${m.idClubeMandante}`,
        awaySourceKey: `fpf:${m.idClubeVisitante}`,
      });
      const reconciliationErrors = reconcileFpfParsedMatch(fpfMatch);
      if (reconciliationErrors.length > 0) {
        return { outcome: "reconciliation-failed" as const, detail: reconciliationErrors.join("; ") };
      }
      const { match, unresolved } = await buildParsedMatchFromFpf(admin, fpfMatch);
      const report = await ingestMatch(admin, match, { dryRun, allowPartialAppearances: unresolved.length > 0 });
      const detail = dryRun
        ? `plan: ${report.appearancesUpserted} atuações, ${report.athletesSeeded} atletas novos` +
          (unresolved.length ? `; ${unresolved.length} jogador(es) sem mapeamento ainda` : "")
        : `gravado: ${report.appearancesUpserted} atuações` + (report.errors.length ? `; erros: ${report.errors.join("; ")}` : "");
      // See the CBF processor's identical fix (Session 50) — a live write that threw
      // inside `ingestMatch` must never come back bucketed as "ingested".
      if (!dryRun && report.errors.length > 0) return { outcome: "write-failed" as const, detail };
      return { outcome: unresolved.length > 0 && match.appearances.length === 0 ? ("unresolved-players" as const) : ("ingested" as const), detail };
    },
    { minDelayMs: 900, jitterMs: 400, onItemDone: touch },
  );

  for (let i = 0; i < matches.length; i++) {
    const o = outcomes[i]!;
    const outcome = o.error ? "fetch-failed" : o.result!.outcome;
    const detail = o.error ?? o.result!.detail;
    results.push({ source: cfg.label, sourceUrl: matches[i]!.linkSumula!, outcome, detail });
    // Only recorded on a LIVE run — Session 53, confirmed live: recording "done"
    // during a dry-run (this used to run "regardless of dry-run/live") made the
    // skip-already-done optimization permanently skip that item on every future
    // LIVE run too, even though dry-run never actually writes anything. FERJ's
    // first go-live wrote ZERO rows because every match had already been
    // dry-run-tested in an earlier session. A dry-run's outcome is still visible
    // in this run's own console summary — it just isn't persisted as a queue
    // entry that later runs would treat as "safe to skip".
    if (!dryRun) {
      await recordScrapingJob(
        admin,
        { source: "FPF", jobType: "sumula", ref: String(matches[i]!.idJogo) },
        outcome === "ingested" || outcome === "unresolved-players"
          ? { status: "done", payload: { url: matches[i]!.linkSumula, competition: cfg.label } }
          : { status: "failed", error: detail, payload: { url: matches[i]!.linkSumula, competition: cfg.label } },
      );
    }
  }
  return results;
}

async function processCbfSource(admin: SupabaseClient, cfg: CbfSourceConfig, dryRun: boolean, touch: () => void): Promise<ExecutorItemResult[]> {
  const results: ExecutorItemResult[] = [];

  const phaseBatches = await forEachRateLimited(cfg.tabelaPhaseUrls, (u) => discoverCbfMatchesForPhase(u), { minDelayMs: 1000, jitterMs: 500, onItemDone: touch });
  const matchRefs = phaseBatches.flatMap((b) => b.result ?? []);
  const withLinksAll = matchRefs.filter((ref): ref is typeof ref & { sumulaUrl: string } => !!ref.sumulaUrl);
  touch();

  // Skip súmulas already processed successfully in a prior run — discovery itself
  // stays cheap (JSON, not PDF) and always re-scans every round so newly-published
  // results are never missed, but downloading+parsing+re-writing every match EVERY
  // run doesn't scale for a twice-weekly cron once a season's worth of matches is
  // already in (Session 52: confirmed live, a full 7-competition CBF run with no skip
  // took ~95 minutes for 508 matches). A match only ever needs reprocessing if the
  // CBF re-publishes a corrected súmula — out of scope for now, no periodic re-check.
  const doneRefs = await getDoneJobRefs(admin, "CBF", "sumula");
  const withLinks = withLinksAll.filter((ref) => !doneRefs.has(String(ref.idJogoGrande)));
  const skipped = withLinksAll.length - withLinks.length;
  if (skipped > 0) {
    console.log(`[executor] CBF: ${cfg.label} — ${skipped} já processada(s), pulando`);
    for (let i = 0; i < skipped; i++) results.push({ source: cfg.label, sourceUrl: "", outcome: "skipped-already-done", detail: "já processada em run anterior" });
  }

  const outcomes = await forEachRateLimited(
    withLinks,
    async ({ sumulaUrl: link, idClubeMandante, idClubeVisitante }) => {
      const text = await fetchSumulaText(link);
      const { match } = parseCbfSumula(text, {
        sourceUrl: link,
        // Real numeric CBF club ids (from discovery's jogos API) instead of the
        // name-derived provisional key — this is also what makes the crest
        // auto-download in `ingest.ts` possible (Session 52), since the escudo URL
        // is keyed by this same id.
        ...(idClubeMandante ? { homeSourceKey: `cbf:${idClubeMandante}` } : {}),
        ...(idClubeVisitante ? { awaySourceKey: `cbf:${idClubeVisitante}` } : {}),
      });
      const reconciliationErrors = reconcileParsedMatch(match);
      if (reconciliationErrors.length > 0) {
        return { outcome: "reconciliation-failed" as const, detail: reconciliationErrors.join("; ") };
      }
      const report = await ingestMatch(admin, match, { dryRun });
      const detail = dryRun
        ? `plan: ${report.appearancesUpserted} atuações, ${report.athletesSeeded} atletas novos`
        : `gravado: ${report.appearancesUpserted} atuações` + (report.errors.length ? `; erros: ${report.errors.join("; ")}` : "");
      // CONFIRMED LIVE (Session 50, first-ever live CBF write): `report.errors` was
      // being computed into `detail` but never checked here — a live write that threw
      // inside `ingestMatch` (e.g. the `clubes.source_key` ON CONFLICT bug, since
      // fixed) still came back as `outcome: "ingested"`, silently hiding a 100%
      // write-failure rate behind a healthy-looking summary count. Only dry-run's
      // `report.errors` (pure reconciliation warnings, informational) should stay
      // bucketed as "ingested" — a LIVE run with errors means the write itself failed.
      if (!dryRun && report.errors.length > 0) return { outcome: "write-failed" as const, detail };
      return { outcome: "ingested" as const, detail };
    },
    { minDelayMs: 900, jitterMs: 400, onItemDone: touch },
  );

  for (let i = 0; i < withLinks.length; i++) {
    const o = outcomes[i]!;
    const outcome = o.error ? "fetch-failed" : o.result!.outcome;
    const detail = o.error ?? o.result!.detail;
    results.push({ source: cfg.label, sourceUrl: withLinks[i]!.sumulaUrl, outcome, detail });
    // See the FPF processor's identical fix (Session 53) — only recorded on a
    // LIVE run, never during dry-run (a dry-run "done" wrongly made the
    // skip-already-done optimization skip that item forever, on every future
    // live run too, even though nothing was actually written).
    if (!dryRun) {
      await recordScrapingJob(
        admin,
        { source: "CBF", jobType: "sumula", ref: String(withLinks[i]!.idJogoGrande) },
        outcome === "ingested"
          ? { status: "done", payload: { url: withLinks[i]!.sumulaUrl, competition: cfg.label } }
          : { status: "failed", error: detail, payload: { url: withLinks[i]!.sumulaUrl, competition: cfg.label } },
      );
    }
  }
  return results;
}

// Identity resolution state (Session 55): FERJ never carries a real CBF bid, so
// without this every match's roster would just sit unresolved forever (see
// plan-ferj-identity-seed.ts's module doc). Per product decision, ingestion never
// blocks on admin review — every athlete resolves to a real/mapped bid OR a fresh
// PROVISIONAL one (provisional-athlete.ts); true duplicates across sources are
// reconciled later by a human via scan-athlete-duplicates.ts + merge-atleta.ts.
// Loaded once per run (not per match) so a player seen across several matches in the
// same run only ever gets one provisional bid. Exported so both the live executor
// AND a one-off catch-up script (for matches recorded 'done' before this identity
// step existed) share the exact same resolution logic — never duplicated.
export interface FerjIdentityState {
  existingAthletes: { bid: number; name: string; birthDate: string }[];
  ferjMappings: { fonte: string; externalId: string; bid: number }[];
  nextProvisionalBid: number;
}

/** PostgREST caps a single `.select()` at 1000 rows by default — silently, no error,
 * just a truncated result. Confirmed live (Session 55): with 8000+ atletas and 1000+
 * atleta_fontes(fonte='ferj') rows, both loads below were silently cut to exactly
 * 1000, which made the "already resolved" in-memory check miss real, existing
 * mappings past that cutoff — causing a genuine `atleta_fontes_pkey` duplicate-key
 * crash (not a race, not a data problem) on any bira whose mapping fell past row
 * 1000. Every full-table load this identity resolution depends on MUST paginate. */
async function selectAll<T>(admin: SupabaseClient, table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = admin.from(table).select(columns).range(offset, offset + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

export async function loadFerjIdentityState(admin: SupabaseClient): Promise<FerjIdentityState> {
  const existingAthletesData = await selectAll<{ bid: number; name: string; birth_date: string | null }>(admin, "atletas", "bid, name, birth_date");
  const existingAthletes = existingAthletesData.map((a) => ({ bid: a.bid, name: a.name, birthDate: a.birth_date ?? "" }));
  const ferjMappingsData = await selectAll<{ id_externo: string; bid: number }>(admin, "atleta_fontes", "id_externo, bid", (q) => q.eq("fonte", "ferj"));
  const ferjMappings = ferjMappingsData.map((m) => ({ fonte: "ferj", externalId: String(m.id_externo), bid: Number(m.bid) }));
  const nextProvisionalBidValue = await nextProvisionalBid(admin);
  return { existingAthletes, ferjMappings, nextProvisionalBid: nextProvisionalBidValue };
}

export interface FerjMatchOutcome {
  outcome: "no-sumula-yet" | "reconciliation-failed" | "write-failed" | "unresolved-players" | "ingested";
  detail: string;
  sourceUrl: string;
}

/** Fetches, parses, resolves identity, and ingests ONE FERJ match. Shared by the live
 * executor's per-match loop and any one-off catch-up run over already-known matchIds. */
export async function ingestOneFerjMatch(
  admin: SupabaseClient,
  matchId: number,
  categoriaHint: string | undefined,
  dryRun: boolean,
  state: FerjIdentityState,
): Promise<FerjMatchOutcome> {
  const { html, sumulaPdfUrl } = await fetchFerjMatchPage(matchId);
  if (!sumulaPdfUrl) return { outcome: "no-sumula-yet", detail: "no súmula PDF link on the match page yet", sourceUrl: "" };

  const pdfText = await fetchSumulaText(sumulaPdfUrl);
  const pdf = parseFerjSumulaPdf(pdfText, { categoryHint: categoriaHint });
  const { match: ferjMatch } = buildFerjSumula(pdf, html, { sourceUrl: sumulaPdfUrl });
  const reconciliationErrors = reconcileFerjParsedMatch(ferjMatch);
  if (reconciliationErrors.length > 0) {
    return { outcome: "reconciliation-failed", detail: reconciliationErrors.join("; "), sourceUrl: sumulaPdfUrl };
  }

  // Resolve every athlete's identity BEFORE the bridge below. A name collision
  // ('ambiguous') still gets its own fresh provisional profile, never auto-merged here.
  for (const athlete of ferjMatch.athletes) {
    if (state.ferjMappings.some((m) => m.externalId === athlete.bira)) continue;
    const res = resolveAthleteIdentity(
      { fonte: "ferj", externalId: athlete.bira, cbfBid: null, name: athlete.name, birthDate: null },
      { existing: state.existingAthletes, mappings: state.ferjMappings },
    );
    let bid: number;
    if (res.kind === "bid" || res.kind === "mapped" || res.kind === "matched") {
      bid = res.bid;
      if (!dryRun && res.kind !== "mapped") {
        const insM = await admin.from("atleta_fontes").insert({ fonte: "ferj", id_externo: athlete.bira, bid });
        if (insM.error) throw insM.error;
      }
    } else {
      bid = state.nextProvisionalBid++;
      if (!dryRun) await seedProvisionalAthlete(admin, bid, { fonte: "ferj", externalId: athlete.bira, name: athlete.name });
      state.existingAthletes.push({ bid, name: athlete.name, birthDate: "" });
    }
    state.ferjMappings.push({ fonte: "ferj", externalId: athlete.bira, bid });
  }

  const { match, unresolved } = await buildParsedMatchFromFerj(admin, ferjMatch);
  const report = await ingestMatch(admin, match, { dryRun, allowPartialAppearances: unresolved.length > 0 });
  const detail = dryRun
    ? `plan: ${report.appearancesUpserted} atuações, ${report.athletesSeeded} atletas novos` +
      (unresolved.length ? `; ${unresolved.length} jogador(es) sem mapeamento ainda` : "")
    : `gravado: ${report.appearancesUpserted} atuações` + (report.errors.length ? `; erros: ${report.errors.join("; ")}` : "");
  // See the CBF processor's identical fix (Session 50) — a live write that threw
  // inside `ingestMatch` must never come back bucketed as "ingested".
  if (!dryRun && report.errors.length > 0) return { outcome: "write-failed", detail, sourceUrl: sumulaPdfUrl };
  const outcome = unresolved.length > 0 && match.appearances.length === 0 ? ("unresolved-players" as const) : ("ingested" as const);
  return { outcome, detail, sourceUrl: sumulaPdfUrl };
}

async function processFerjSource(admin: SupabaseClient, cfg: FerjSourceConfig, dryRun: boolean, touch: () => void): Promise<ExecutorItemResult[]> {
  const results: ExecutorItemResult[] = [];

  const state = await loadFerjIdentityState(admin);
  const provisionalBidStart = state.nextProvisionalBid;

  const monthBatches = await forEachRateLimited(cfg.meses, (mes) => discoverFerjMonth(mes, cfg.ano), { minDelayMs: 700, jitterMs: 300, onItemDone: touch });
  const matchRefsAll = monthBatches.flatMap((b) => b.result ?? []);

  // Same skip-already-done optimization as the CBF processor (Session 52) — see its
  // comment for why. FERJ discovery has no separate "has a súmula link" filter step
  // (that check happens per-item below, since a missing súmula is legitimately
  // "not published yet", not a permanent skip), so this filters the raw match list.
  const doneRefs = await getDoneJobRefs(admin, "FERJ", "sumula");
  touch();
  const matchRefs = matchRefsAll.filter((ref) => !doneRefs.has(String(ref.matchId)));
  const skipped = matchRefsAll.length - matchRefs.length;
  if (skipped > 0) {
    console.log(`[executor] FERJ: ${cfg.label} — ${skipped} já processada(s), pulando`);
    for (let i = 0; i < skipped; i++) results.push({ source: cfg.label, sourceUrl: "", outcome: "skipped-already-done", detail: "já processada em run anterior" });
  }

  const outcomes = await forEachRateLimited(
    matchRefs,
    (ref) => ingestOneFerjMatch(admin, ref.matchId, ref.categoria, dryRun, state),
    { minDelayMs: 900, jitterMs: 400, onItemDone: touch },
  );

  for (let i = 0; i < matchRefs.length; i++) {
    const o = outcomes[i]!;
    const outcome = o.error ? "fetch-failed" : o.result!.outcome;
    const detail = o.error ?? o.result!.detail;
    const sourceUrl = o.error ? "" : o.result!.sourceUrl;
    results.push({ source: cfg.label, sourceUrl, outcome, detail });
    // See the CBF/FPF processors' identical fix (Session 53) — only recorded on
    // a LIVE run. This is exactly the bug that made FERJ's actual go-live write
    // zero rows: every match had already been dry-run-tested in an earlier
    // session, which used to mark them "done" and made the skip-optimization
    // permanently skip them on the real live run too.
    if (!dryRun) {
      await recordScrapingJob(
        admin,
        { source: "FERJ", jobType: "sumula", ref: String(matchRefs[i]!.matchId) },
        outcome === "ingested" || outcome === "unresolved-players"
          ? { status: "done", payload: { url: sourceUrl, competition: cfg.label } }
          : { status: "failed", error: detail, payload: { url: sourceUrl, competition: cfg.label } },
      );
    }
  }
  const provisionalCreated = state.nextProvisionalBid - provisionalBidStart;
  if (provisionalCreated > 0) {
    console.log(`[executor] FERJ: ${cfg.label} — ${provisionalCreated} atleta(s) com bid provisório ${dryRun ? "seriam criados" : "criados"} (bid ${provisionalBidStart}..${state.nextProvisionalBid - 1})`);
  }
  return results;
}

async function processFmfSource(admin: SupabaseClient, cfg: FmfSourceConfig, dryRun: boolean, touch: () => void): Promise<ExecutorItemResult[]> {
  const results: ExecutorItemResult[] = [];

  const matchRefsAll = await discoverFmfCompetition(cfg.d);
  touch();

  // Same skip-already-done optimization as CBF (Session 52) — discovery itself is one
  // cheap full-season page fetch (not per-round like CBF/FERJ), so it always re-scans
  // everything; only downloading+parsing+re-writing an already-processed súmula is
  // skipped.
  const doneRefs = await getDoneJobRefs(admin, "FMF", "sumula");
  touch();
  const matchRefs = matchRefsAll.filter((ref) => !doneRefs.has(String(ref.matchId)));
  const skipped = matchRefsAll.length - matchRefs.length;
  if (skipped > 0) {
    console.log(`[executor] FMF: ${cfg.label} — ${skipped} já processada(s), pulando`);
    for (let i = 0; i < skipped; i++) results.push({ source: cfg.label, sourceUrl: "", outcome: "skipped-already-done", detail: "já processada em run anterior" });
  }

  const outcomes = await forEachRateLimited(
    matchRefs,
    async (ref) => {
      const text = await fetchSumulaText(ref.sumulaUrl);
      // FMF's roster carries the athlete's real CBF bid directly (confirmed live,
      // Session 54) — no identity crosswalk/bridge needed, same shape as CBF itself,
      // unlike FPF/FERJ's Registro/BIRA bridge. Some roster players still have NO bid
      // at all though — confirmed live: a minority in the "official" federated
      // divisions (registration pending), and the large majority in the SFAC amateur
      // divisions (players never register with the CBF at all). `parseFmfSumula`
      // already drops those from `athletes`/`appearances` rather than inventing an
      // identity — an undercount vs. the súmula's own goal total is then EXPECTED
      // whenever an unresolved player scored, same reasoning as FPF/FERJ's bridge
      // (see `reconciliation.ts`'s `allowPartialAppearances` doc).
      const { match, roster, isWalkover } = parseFmfSumula(text, {
        sourceUrl: ref.sumulaUrl,
        homeSourceKey: `fmf:${ref.homeClubId}`,
        awaySourceKey: `fmf:${ref.awayClubId}`,
        homeCrestUrl: ref.homeCrestUrl,
        awayCrestUrl: ref.awayCrestUrl,
      });
      const unresolvedCount = [...roster.home, ...roster.away].filter((p) => p.bid == null).length;
      // A walkover has an official score but genuinely no gameplay to reconcile
      // against (see `parseFmfSumula`'s doc) — relax the same checks as an
      // unresolved-identity match, for a different underlying reason.
      const allowPartial = unresolvedCount > 0 || isWalkover;
      const reconciliationErrors = reconcileParsedMatch(match, { allowPartialAppearances: allowPartial });
      if (reconciliationErrors.length > 0) {
        return { outcome: "reconciliation-failed" as const, detail: reconciliationErrors.join("; ") };
      }
      const report = await ingestMatch(admin, match, { dryRun, allowPartialAppearances: allowPartial });
      const detail = dryRun
        ? `plan: ${report.appearancesUpserted} atuações, ${report.athletesSeeded} atletas novos` +
          (unresolvedCount ? `; ${unresolvedCount} jogador(es) sem BID da CBF` : "") +
          (isWalkover ? "; W.O." : "")
        : `gravado: ${report.appearancesUpserted} atuações` + (report.errors.length ? `; erros: ${report.errors.join("; ")}` : "");
      // See the CBF processor's identical fix (Session 50) — a live write that threw
      // inside `ingestMatch` must never come back bucketed as "ingested".
      if (!dryRun && report.errors.length > 0) return { outcome: "write-failed" as const, detail };
      const outcome = allowPartial && match.appearances.length === 0 ? ("unresolved-players" as const) : ("ingested" as const);
      return { outcome, detail };
    },
    { minDelayMs: 900, jitterMs: 400, onItemDone: touch },
  );

  for (let i = 0; i < matchRefs.length; i++) {
    const o = outcomes[i]!;
    const outcome = o.error ? "fetch-failed" : o.result!.outcome;
    const detail = o.error ?? o.result!.detail;
    results.push({ source: cfg.label, sourceUrl: matchRefs[i]!.sumulaUrl, outcome, detail });
    if (!dryRun) {
      await recordScrapingJob(
        admin,
        { source: "FMF", jobType: "sumula", ref: String(matchRefs[i]!.matchId) },
        outcome === "ingested" || outcome === "unresolved-players"
          ? { status: "done", payload: { url: matchRefs[i]!.sumulaUrl, competition: cfg.label } }
          : { status: "failed", error: detail, payload: { url: matchRefs[i]!.sumulaUrl, competition: cfg.label } },
      );
    }
  }
  return results;
}

function fgfClubSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function processFgfSource(admin: SupabaseClient, cfg: FgfSourceConfig, dryRun: boolean, touch: () => void): Promise<ExecutorItemResult[]> {
  const results: ExecutorItemResult[] = [];

  const matchRefsAll = await discoverFgfCompetition(cfg.competitionId);
  touch();

  // Same skip-already-done optimization as every other source — `matchUrl` (the
  // match page's own URL slug) is the stable ref: FGF exposes no numeric match id to
  // `fetch` (the in-page "JOGO: N" number is only unique within one competition).
  const doneRefs = await getDoneJobRefs(admin, "FGF", "sumula");
  const matchRefs = matchRefsAll.filter((ref) => !doneRefs.has(ref.matchUrl));
  const skipped = matchRefsAll.length - matchRefs.length;
  if (skipped > 0) {
    console.log(`[executor] FGF: ${cfg.label} — ${skipped} já processada(s), pulando`);
    for (let i = 0; i < skipped; i++) results.push({ source: cfg.label, sourceUrl: "", outcome: "skipped-already-done", detail: "já processada em run anterior" });
  }

  const outcomes = await forEachRateLimited(
    matchRefs,
    async (ref) => {
      const sumulaUrl = await fetchFgfSumulaUrl(ref.matchUrl);
      if (!sumulaUrl) return { outcome: "no-sumula-yet" as const, detail: "no súmula link on the match page yet", sourceUrl: "" };

      const text = await fetchSumulaText(sumulaUrl);
      // FGF's roster carries the athlete's real CBF bid directly (same "SÚMULA
      // ON-LINE" template CBF's own competitions use — see discovery/fgf-discover.ts's
      // module doc) — no identity crosswalk/bridge needed, same shape as CBF/FMF.
      const { match } = parseCbfSumula(text, {
        sourceUrl: sumulaUrl,
        homeSourceKey: `fgf-club:${fgfClubSlug(ref.homeName)}`,
        awaySourceKey: `fgf-club:${fgfClubSlug(ref.awayName)}`,
        homeCrestUrl: ref.homeCrestUrl,
        awayCrestUrl: ref.awayCrestUrl,
        federation: "FGF",
        clubFederacao: "FGF",
      });
      const reconciliationErrors = reconcileParsedMatch(match);
      if (reconciliationErrors.length > 0) {
        return { outcome: "reconciliation-failed" as const, detail: reconciliationErrors.join("; "), sourceUrl: sumulaUrl };
      }
      const report = await ingestMatch(admin, match, { dryRun });
      const detail = dryRun
        ? `plan: ${report.appearancesUpserted} atuações, ${report.athletesSeeded} atletas novos`
        : `gravado: ${report.appearancesUpserted} atuações` + (report.errors.length ? `; erros: ${report.errors.join("; ")}` : "");
      // See the CBF processor's identical fix (Session 50) — a live write that threw
      // inside `ingestMatch` must never come back bucketed as "ingested".
      if (!dryRun && report.errors.length > 0) return { outcome: "write-failed" as const, detail, sourceUrl: sumulaUrl };
      return { outcome: "ingested" as const, detail, sourceUrl: sumulaUrl };
    },
    { minDelayMs: 900, jitterMs: 400, onItemDone: touch },
  );

  for (let i = 0; i < matchRefs.length; i++) {
    const o = outcomes[i]!;
    const outcome = o.error ? "fetch-failed" : o.result!.outcome;
    const detail = o.error ?? o.result!.detail;
    const sourceUrl = o.error ? "" : o.result!.sourceUrl;
    results.push({ source: cfg.label, sourceUrl, outcome, detail });
    if (!dryRun) {
      await recordScrapingJob(
        admin,
        { source: "FGF", jobType: "sumula", ref: matchRefs[i]!.matchUrl },
        outcome === "ingested"
          ? { status: "done", payload: { url: sourceUrl, competition: cfg.label } }
          : { status: "failed", error: detail, payload: { url: sourceUrl, competition: cfg.label } },
      );
    }
  }
  return results;
}

// Confirmed live (Session 54, continuation): even with a timeout on every individual
// `fetch()` (discovery, súmula, crest), a source can still hang the ENTIRE executor
// indefinitely for reasons no per-request timeout catches. A `try/catch` around a
// source's own processing NEVER helps here either — a Promise that never resolves
// never throws.
//
// Explicit product requirement (Session 54): the executor must NEVER get stuck, full
// stop. A blunt total-duration timeout (`Promise.race` against a single fixed
// deadline) doesn't fit that: the largest real competition seen (~98 súmulas, rate-
// limited ~1.1s apart + real write time) legitimately takes minutes end to end, so a
// short fixed ceiling would kill genuinely-progressing work, not just real hangs. An
// INACTIVITY watchdog solves both at once — `touch()` resets the clock on every real
// checkpoint (discovery done, done-refs loaded, every single súmula processed), so a
// competition that's actively working never trips it no matter how long it
// legitimately takes in total, while one that goes fully silent gets abandoned within
// `idleMs` of its LAST heartbeat.
//
// ⚠️ CORRECTION (measured live, same continuation): an earlier version of this
// comment blamed a 20s ceiling's real trips on "accumulated local network/handle
// state" — WRONG. A single real `ingestMatch()` call (the first match of a brand new
// tournament: creates the torneio, upserts clubs, writes ~33 `atuacoes_sumula` rows
// one at a time) was directly measured at 19.6s end to end, with both clubs already
// existing (no crest download involved) — genuinely working the whole time, not
// stuck. `onItemDone` only fires once a WHOLE item (fetch+parse+ingest) finishes, so
// a single item legitimately taking closer to `idleMs` than expected trips the
// watchdog mid-item on real, correct work — a false positive, not a caught hang. The
// three "stuck" competitions from that session were never actually hung; every retry
// was silently re-doing real work the previous attempt had already half-finished.
// `idleMs` must stay safely above the slowest plausible SINGLE item (first match of
// a new tournament + a from-scratch crest download, i.e. up to ~20s DB work + ~30s
// crest fetch timeout, stacked) — 90s keeps a wide margin over that measured/derived
// worst case while remaining "seconds, not minutes" for an actual dead hang.
const WATCHDOG_IDLE_MS = 90_000;

interface Watchdog {
  /** Call at every real checkpoint (discovery done, one item processed, ...). */
  touch: () => void;
  /** Races `promise` against the idle timer; rejects if `touch()` isn't called for `idleMs`. */
  guard: <T>(promise: Promise<T>) => Promise<T>;
}

function createWatchdog(idleMs: number, label: string): Watchdog {
  let lastActivity = Date.now();
  return {
    touch: () => {
      lastActivity = Date.now();
    },
    guard: <T>(promise: Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        const check = setInterval(() => {
          const idleFor = Date.now() - lastActivity;
          if (idleFor >= idleMs) {
            clearInterval(check);
            reject(new Error(`sem atividade por ${Math.round(idleFor / 1000)}s (abandonado, será retentado no próximo run): ${label}`));
          }
        }, 1000);
        promise.then(
          (v) => {
            clearInterval(check);
            resolve(v);
          },
          (e) => {
            clearInterval(check);
            reject(e);
          },
        );
      }),
  };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const dryRun = process.env.INGESTION_LIVE_ENABLED !== "true"; // mirrors ingestion-gate.ts's own check
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (.env.local)");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Optional filter for a single-source run (e.g. `ONLY_SOURCE=ferj npm run
  // ingest:dry-run`), so a source under active development doesn't have to sit
  // through every other source's own rate-limited run just to get feedback. Unset
  // (default) runs every source, same as before this existed.
  const onlySource = process.env.ONLY_SOURCE?.toLowerCase();
  // Finer isolation than ONLY_SOURCE — one specific competition's `label` (case-
  // insensitive substring match), for the runbook's "isolamento: rodar primeiro numa
  // fonte/competição pequena" gate before a source's very first live write.
  const onlyCompetition = process.env.ONLY_COMPETITION?.toLowerCase();
  console.log(
    `[executor] mode: ${dryRun ? "DRY-RUN (no writes)" : "LIVE (writing to the database)"}${onlySource ? ` — only source: ${onlySource}` : ""}${onlyCompetition ? ` — only competition matching: "${onlyCompetition}"` : ""}`,
  );

  const allResults: ExecutorItemResult[] = [];
  // FPF stays paused: futebolpaulista.com.br escalated to an interactive Cloudflare
  // Turnstile checkbox ("Confirme que é humano") — automating past that is CAPTCHA
  // bypass, which stays off the table regardless of authorization. Flip this back to
  // FPF_SOURCES once there's an official federation API/data feed to adapt against
  // instead (mirrors how CBF_SOURCES below already works — plain fetch, no browser).
  const fpfSourcesToRun: typeof FPF_SOURCES = [];

  // Each FPF competition gets its own fresh browser session — reusing one session
  // across competitions let Cloudflare's suspicion accumulate across the whole run
  // (confirmed live: once flagged on competition #1, every later competition in the
  // same session failed too, even ones that would pass in isolation). A brand new
  // session per competition, plus a cooldown gap between them, resets that per-run.
  const FPF_SESSION_COOLDOWN_MS = 15000;
  for (const cfg of onlySource && onlySource !== "fpf" ? [] : fpfSourcesToRun) {
    console.log(`[executor] FPF: ${cfg.label}`);
    let stealthSession: StealthSession | null = null;
    try {
      stealthSession = await createStealthSession({
        headless: process.env.HEADLESS !== "false",
        sessionCookiePath: ".fpf-session-cookies.json",
      });
      const wd = createWatchdog(WATCHDOG_IDLE_MS, `FPF ${cfg.label}`);
      allResults.push(...(await wd.guard(processFpfSource(stealthSession.page, admin, cfg, dryRun, wd.touch))));
    } catch (e) {
      // Isolated per source, same principle as `forEachRateLimited`'s per-item
      // isolation: one broken source (e.g. FPF's Cloudflare block) must never abort
      // the other sources' runs — "falha de scrape nunca quebra a exposição".
      console.error(`[executor] FPF source failed entirely: ${cfg.label} —`, e instanceof Error ? e.message : e);
    } finally {
      await stealthSession?.close();
    }
    if (cfg !== fpfSourcesToRun[fpfSourcesToRun.length - 1]) {
      await new Promise((resolve) => setTimeout(resolve, FPF_SESSION_COOLDOWN_MS));
    }
  }

  const cbfSourcesToRun = (onlySource && onlySource !== "cbf" ? [] : CBF_SOURCES).filter(
    (cfg) => !onlyCompetition || cfg.label.toLowerCase().includes(onlyCompetition),
  );
  for (const cfg of cbfSourcesToRun) {
    console.log(`[executor] CBF: ${cfg.label}`);
    try {
      const wd = createWatchdog(WATCHDOG_IDLE_MS, `CBF ${cfg.label}`);
      allResults.push(...(await wd.guard(processCbfSource(admin, cfg, dryRun, wd.touch))));
    } catch (e) {
      console.error(`[executor] CBF source failed entirely: ${cfg.label} —`, e instanceof Error ? e.message : e);
    }
  }

  for (const cfg of onlySource && onlySource !== "ferj" ? [] : FERJ_SOURCES) {
    console.log(`[executor] FERJ: ${cfg.label}`);
    try {
      const wd = createWatchdog(WATCHDOG_IDLE_MS, `FERJ ${cfg.label}`);
      allResults.push(...(await wd.guard(processFerjSource(admin, cfg, dryRun, wd.touch))));
    } catch (e) {
      console.error(`[executor] FERJ source failed entirely: ${cfg.label} —`, e instanceof Error ? e.message : e);
    }
  }

  const fmfSourcesToRun = (onlySource && onlySource !== "fmf" ? [] : FMF_SOURCES).filter(
    (cfg) => !onlyCompetition || cfg.label.toLowerCase().includes(onlyCompetition),
  );
  for (const cfg of fmfSourcesToRun) {
    console.log(`[executor] FMF: ${cfg.label}`);
    try {
      const wd = createWatchdog(WATCHDOG_IDLE_MS, `FMF ${cfg.label}`);
      allResults.push(...(await wd.guard(processFmfSource(admin, cfg, dryRun, wd.touch))));
    } catch (e) {
      console.error(`[executor] FMF source failed entirely: ${cfg.label} —`, e instanceof Error ? e.message : e);
    }
  }

  const fgfSourcesToRun = (onlySource && onlySource !== "fgf" ? [] : FGF_SOURCES).filter(
    (cfg) => !onlyCompetition || cfg.label.toLowerCase().includes(onlyCompetition),
  );
  for (const cfg of fgfSourcesToRun) {
    console.log(`[executor] FGF: ${cfg.label}`);
    try {
      const wd = createWatchdog(WATCHDOG_IDLE_MS, `FGF ${cfg.label}`);
      allResults.push(...(await wd.guard(processFgfSource(admin, cfg, dryRun, wd.touch))));
    } catch (e) {
      console.error(`[executor] FGF source failed entirely: ${cfg.label} —`, e instanceof Error ? e.message : e);
    }
  }

  const byOutcome = new Map<string, number>();
  for (const r of allResults) byOutcome.set(r.outcome, (byOutcome.get(r.outcome) ?? 0) + 1);
  console.log("\n[executor] resumo:", Object.fromEntries(byOutcome));
  for (const r of allResults.filter((r) => r.outcome !== "ingested" && r.outcome !== "skipped-already-done")) {
    console.log(`  [${r.outcome}] ${r.source} — ${r.sourceUrl}\n    ${r.detail}`);
  }
}

// Only run the full executor when this file is EXECUTED directly (`node
// run-live-ingestion.ts`) — never as a side effect of another script importing its
// shared exports (loadFerjIdentityState, ingestOneFerjMatch). Before this guard
// (Session 55, found live), catchup-ferj-athletes.ts's import alone silently kicked
// off a full CBF/FMF/FGF/FERJ discovery+ingest pass in the background, racing the
// importing script's own logic — and whichever finished first called `process.exit`,
// which could have killed a live write mid-flight.
const isMainModule = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main()
    .then(() => {
      // A source abandoned by `withTimeout` (see its doc) may leave a hung network
      // handle Node's event loop would otherwise wait on forever even though every
      // useful result is already logged above — force a clean exit instead of a
      // silent, invisible hang after the real work is done (Session 54: this is the
      // exact "never allowed to get stuck" requirement, applied to the process itself).
      process.exit(0);
    })
    .catch((e) => {
      console.error("[executor] fatal:", e);
      process.exit(1);
    });
}
