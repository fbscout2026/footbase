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
import { recordScrapingJob } from "./scraping-jobs.ts";
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

export interface ExecutorItemResult {
  source: string;
  sourceUrl: string;
  outcome: "ingested" | "reconciliation-failed" | "no-sumula-yet" | "fetch-failed" | "unresolved-players" | "write-failed";
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

async function processFpfSource(page: Page, admin: SupabaseClient, cfg: FpfSourceConfig, dryRun: boolean): Promise<ExecutorItemResult[]> {
  const results: ExecutorItemResult[] = [];
  const rodadaAtual = await discoverFpfCurrentRound(page, cfg);

  const rounds = Array.from({ length: rodadaAtual }, (_, i) => i + 1);
  const roundBatches = await forEachRateLimited(rounds, (r) => discoverFpfRound(page, { ...cfg, rodada: r }), { minDelayMs: 800, jitterMs: 400 });
  const matches = roundBatches.flatMap((b) => b.result ?? []).filter((m) => m.linkSumula);

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
      const report = await ingestMatch(admin, match, { dryRun });
      const detail = dryRun
        ? `plan: ${report.appearancesUpserted} atuações, ${report.athletesSeeded} atletas novos` +
          (unresolved.length ? `; ${unresolved.length} jogador(es) sem mapeamento ainda` : "")
        : `gravado: ${report.appearancesUpserted} atuações` + (report.errors.length ? `; erros: ${report.errors.join("; ")}` : "");
      // See the CBF processor's identical fix (Session 50) — a live write that threw
      // inside `ingestMatch` must never come back bucketed as "ingested".
      if (!dryRun && report.errors.length > 0) return { outcome: "write-failed" as const, detail };
      return { outcome: unresolved.length > 0 && match.appearances.length === 0 ? ("unresolved-players" as const) : ("ingested" as const), detail };
    },
    { minDelayMs: 900, jitterMs: 400 },
  );

  for (let i = 0; i < matches.length; i++) {
    const o = outcomes[i]!;
    const outcome = o.error ? "fetch-failed" : o.result!.outcome;
    const detail = o.error ?? o.result!.detail;
    results.push({ source: cfg.label, sourceUrl: matches[i]!.linkSumula!, outcome, detail });
    await recordScrapingJob(
      admin,
      { source: "FPF", jobType: "sumula", ref: String(matches[i]!.idJogo) },
      outcome === "ingested" || outcome === "unresolved-players"
        ? { status: "done", payload: { url: matches[i]!.linkSumula, competition: cfg.label } }
        : { status: "failed", error: detail, payload: { url: matches[i]!.linkSumula, competition: cfg.label } },
    );
  }
  return results;
}

async function processCbfSource(admin: SupabaseClient, cfg: CbfSourceConfig, dryRun: boolean): Promise<ExecutorItemResult[]> {
  const results: ExecutorItemResult[] = [];

  const phaseBatches = await forEachRateLimited(cfg.tabelaPhaseUrls, (u) => discoverCbfMatchesForPhase(u), { minDelayMs: 1000, jitterMs: 500 });
  const matchRefs = phaseBatches.flatMap((b) => b.result ?? []);
  const withLinks = matchRefs.filter((ref): ref is typeof ref & { sumulaUrl: string } => !!ref.sumulaUrl);

  const outcomes = await forEachRateLimited(
    withLinks,
    async ({ sumulaUrl: link }) => {
      const text = await fetchSumulaText(link);
      const { match } = parseCbfSumula(text, { sourceUrl: link });
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
    { minDelayMs: 900, jitterMs: 400 },
  );

  for (let i = 0; i < withLinks.length; i++) {
    const o = outcomes[i]!;
    const outcome = o.error ? "fetch-failed" : o.result!.outcome;
    const detail = o.error ?? o.result!.detail;
    results.push({ source: cfg.label, sourceUrl: withLinks[i]!.sumulaUrl, outcome, detail });
    await recordScrapingJob(
      admin,
      { source: "CBF", jobType: "sumula", ref: String(withLinks[i]!.idJogoGrande) },
      outcome === "ingested"
        ? { status: "done", payload: { url: withLinks[i]!.sumulaUrl, competition: cfg.label } }
        : { status: "failed", error: detail, payload: { url: withLinks[i]!.sumulaUrl, competition: cfg.label } },
    );
  }
  return results;
}

async function processFerjSource(admin: SupabaseClient, cfg: FerjSourceConfig, dryRun: boolean): Promise<ExecutorItemResult[]> {
  const results: ExecutorItemResult[] = [];

  const monthBatches = await forEachRateLimited(cfg.meses, (mes) => discoverFerjMonth(mes, cfg.ano), { minDelayMs: 700, jitterMs: 300 });
  const matchRefs = monthBatches.flatMap((b) => b.result ?? []);

  const outcomes = await forEachRateLimited(
    matchRefs,
    async (ref) => {
      const { html, sumulaPdfUrl } = await fetchFerjMatchPage(ref.matchId);
      if (!sumulaPdfUrl) return { outcome: "no-sumula-yet" as const, detail: "no súmula PDF link on the match page yet", sourceUrl: "" };

      const pdfText = await fetchSumulaText(sumulaPdfUrl);
      const pdf = parseFerjSumulaPdf(pdfText, { categoryHint: ref.categoria });
      const { match: ferjMatch } = buildFerjSumula(pdf, html, { sourceUrl: sumulaPdfUrl });
      const reconciliationErrors = reconcileFerjParsedMatch(ferjMatch);
      if (reconciliationErrors.length > 0) {
        return { outcome: "reconciliation-failed" as const, detail: reconciliationErrors.join("; "), sourceUrl: sumulaPdfUrl };
      }
      const { match, unresolved } = await buildParsedMatchFromFerj(admin, ferjMatch);
      const report = await ingestMatch(admin, match, { dryRun });
      const detail = dryRun
        ? `plan: ${report.appearancesUpserted} atuações, ${report.athletesSeeded} atletas novos` +
          (unresolved.length ? `; ${unresolved.length} jogador(es) sem mapeamento ainda` : "")
        : `gravado: ${report.appearancesUpserted} atuações` + (report.errors.length ? `; erros: ${report.errors.join("; ")}` : "");
      // See the CBF processor's identical fix (Session 50) — a live write that threw
      // inside `ingestMatch` must never come back bucketed as "ingested".
      if (!dryRun && report.errors.length > 0) return { outcome: "write-failed" as const, detail, sourceUrl: sumulaPdfUrl };
      const outcome = unresolved.length > 0 && match.appearances.length === 0 ? ("unresolved-players" as const) : ("ingested" as const);
      return { outcome, detail, sourceUrl: sumulaPdfUrl };
    },
    { minDelayMs: 900, jitterMs: 400 },
  );

  for (let i = 0; i < matchRefs.length; i++) {
    const o = outcomes[i]!;
    const outcome = o.error ? "fetch-failed" : o.result!.outcome;
    const detail = o.error ?? o.result!.detail;
    const sourceUrl = o.error ? "" : o.result!.sourceUrl;
    results.push({ source: cfg.label, sourceUrl, outcome, detail });
    await recordScrapingJob(
      admin,
      { source: "FERJ", jobType: "sumula", ref: String(matchRefs[i]!.matchId) },
      outcome === "ingested" || outcome === "unresolved-players"
        ? { status: "done", payload: { url: sourceUrl, competition: cfg.label } }
        : { status: "failed", error: detail, payload: { url: sourceUrl, competition: cfg.label } },
    );
  }
  return results;
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
      allResults.push(...(await processFpfSource(stealthSession.page, admin, cfg, dryRun)));
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
      allResults.push(...(await processCbfSource(admin, cfg, dryRun)));
    } catch (e) {
      console.error(`[executor] CBF source failed entirely: ${cfg.label} —`, e instanceof Error ? e.message : e);
    }
  }

  for (const cfg of onlySource && onlySource !== "ferj" ? [] : FERJ_SOURCES) {
    console.log(`[executor] FERJ: ${cfg.label}`);
    try {
      allResults.push(...(await processFerjSource(admin, cfg, dryRun)));
    } catch (e) {
      console.error(`[executor] FERJ source failed entirely: ${cfg.label} —`, e instanceof Error ? e.message : e);
    }
  }

  const byOutcome = new Map<string, number>();
  for (const r of allResults) byOutcome.set(r.outcome, (byOutcome.get(r.outcome) ?? 0) + 1);
  console.log("\n[executor] resumo:", Object.fromEntries(byOutcome));
  for (const r of allResults.filter((r) => r.outcome !== "ingested")) {
    console.log(`  [${r.outcome}] ${r.source} — ${r.sourceUrl}\n    ${r.detail}`);
  }
}

main().catch((e) => {
  console.error("[executor] fatal:", e);
  process.exitCode = 1;
});
