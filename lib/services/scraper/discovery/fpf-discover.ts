import type { Page } from "playwright";
import { waitForCloudflareChallenge } from "./stealth-browser.ts";

// FOOTBASE Phase 6.x — FPF discovery (Playwright, thin — NOT unit tested in this repo:
// it drives a real browser against a live third-party site, which can't run in this
// sandboxed test environment. Validate by running `npm run ingest:dry-run` for real,
// in an environment with `npx playwright install chromium` done first).
//
// futebolpaulista.com.br is behind a Cloudflare challenge. Confirmed live (Session 43):
// a request injected via `page.evaluate(() => fetch(...))` gets blocked (403 "Just a
// moment...") EVEN INSIDE an already-challenge-passed page — Cloudflare/bot-management
// specifically flags script-injected network calls, not just headless signals. The
// fix confirmed live is to never inject our own network call at all: click the round
// selector the page itself exposes (a real `<a title="Selecione a rodada">` /
// `<a title="Rodada N">` pair, confirmed via DevTools inspection with the user) and
// capture the response the PAGE's OWN jQuery generates via `page.waitForResponse()`.
// Same URL shape (`ListarTabela.ashx?IdCampeonato=...&Rodada=...`), same JSON body —
// the only difference is who issues the request. This is standard automation (drive
// the UI, read what it produces), not evasion — no call originates from our code.
//
// Two more things confirmed live (Session 44):
//  - A fresh page load always defaults to Rodada 1 (NOT the "current" round) — so the
//    round-selector's own label can't be used to find the current/last round.
//  - Re-clicking the round that's already selected never fires a new request (the
//    page has nothing to change), so blindly clicking whatever round is asked for can
//    hang forever waiting for a response that never comes.
// Fix: read the total round count directly from the dropdown's own option list
// (`discoverFpfCurrentRound` — count `a[title="Rodada N"]` entries, take the max), and
// cache the auto-fired Rodada-1 response from the initial page load so asking for
// round 1 never needs a redundant click.

/** Best-effort dismiss of the cookie banner — a no-op if it's not present. */
async function acceptCookiesIfPresent(page: Page): Promise<void> {
  const btn = page.getByText("ACEITAR", { exact: true }).first();
  if ((await btn.count().catch(() => 0)) > 0) {
    await btn.click({ timeout: 3000 }).catch(() => {});
  }
}

function tabelaUrl(opts: { idCampeonato: number; idCategoria: number; ano: number }): string {
  return `https://futebolpaulista.com.br/Competicoes/Tabela.aspx?idCampeonato=${opts.idCampeonato}&ano=${opts.ano}&idCategoria=${opts.idCategoria}&nav=1`;
}

interface CachedRound {
  competitionKey: string;
  rodada: number;
  data: unknown;
}

const initialRoundCache = new WeakMap<Page, CachedRound>();

function competitionKey(opts: { idCampeonato: number; idCategoria: number; ano: number }): string {
  return `${opts.idCampeonato}:${opts.idCategoria}:${opts.ano}`;
}

function rodadaFromListTabelaJson(data: unknown): number {
  const lista = (data as { Retorno?: { listTabela?: unknown[] } })?.Retorno?.listTabela ?? [];
  const first = lista[0] as Record<string, unknown> | undefined;
  return Number(first?.Rodada) || 0;
}

/**
 * Navigates to the Tabela page for one competition/category if the page isn't already
 * there — reused across round-selector clicks so switching rounds never re-navigates
 * (matches how a real visitor browses: one page load, then round changes via the
 * dropdown). Also captures the request the page fires automatically on load (always
 * Rodada 1, confirmed live) so a later `discoverFpfRound(..., { rodada: 1 })` call can
 * reuse it instead of clicking a round that's already selected.
 */
async function ensureOnTabelaPage(page: Page, opts: { idCampeonato: number; idCategoria: number; ano: number }): Promise<void> {
  const url = tabelaUrl(opts);
  if (page.url() === url) return;

  const initialResponsePromise = page
    .waitForResponse(
      (res) => res.url().includes("ListarTabela.ashx") && res.url().includes(`IdCampeonato=${opts.idCampeonato}`),
      { timeout: 25000 },
    )
    .catch(() => null);

  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  
  // Aguarda e supera eventual desafio Cloudflare Turnstile/JS challenge
  const passedCloudflare = await waitForCloudflareChallenge(page, 30000);
  if (!passedCloudflare) {
    console.warn(`[fpf-discover] Cloudflare pode estar bloqueando a navegação para ${url}`);
  }

  await page.waitForTimeout(1500); // let the round-selector widget finish client-side init
  await acceptCookiesIfPresent(page);

  const initialResponse = await initialResponsePromise;
  if (initialResponse) {
    const data = await initialResponse.json().catch(() => null);
    if (data) {
      initialRoundCache.set(page, { competitionKey: competitionKey(opts), rodada: rodadaFromListTabelaJson(data), data });
    }
  }
}

/**
 * Opens the round dropdown and clicks the option for `rodada`, waiting for the
 * resulting `ListarTabela.ashx` response (the page's own jQuery call, confirmed live
 * — see module doc). Returns the parsed JSON body.
 */
async function selectRoundAndCapture(
  page: Page,
  opts: { idCampeonato: number; idCategoria: number; ano: number; rodada: number },
): Promise<unknown> {
  // Verifica se Cloudflare re-desafiou a sessão
  await waitForCloudflareChallenge(page, 15000);

  const responsePromise = page.waitForResponse(
    (res) => {
      const u = res.url();
      return u.includes("ListarTabela.ashx") && u.includes(`Rodada=${opts.rodada}`) && u.includes(`IdCampeonato=${opts.idCampeonato}`);
    },
    { timeout: 25000 },
  );

  // The page renders this widget twice (a hidden duplicate alongside the visible one
  // — confirmed live via `count()`/`isVisible()`), so `.first()` alone can grab the
  // hidden copy; `:visible` picks the one actually on screen.
  const dropdownBtn = page.locator('a[title="Selecione a rodada"]:visible').first();
  await dropdownBtn.click();
  await page.waitForTimeout(300);

  const roundOption = page.locator(`a[title="Rodada ${opts.rodada}"]:visible`).first();
  await roundOption.click();

  const response = await responsePromise;
  return response.json();
}

export interface FpfMatchRef {
  idJogo: number;
  data: string; // "DD/MM/YYYY"
  rodada: number;
  mandante: string;
  visitante: string;
  idClubeMandante: number;
  idClubeVisitante: number;
  linkSumula: string | null; // null = not published yet (postponed/pending)
}

function mapListTabelaJson(data: unknown, fallbackRodada: number): FpfMatchRef[] {
  const lista: unknown[] = (data as { Retorno?: { listTabela?: unknown[] } })?.Retorno?.listTabela ?? [];

  return lista
    .map((raw) => {
      const j = raw as Record<string, unknown>;
      const idJogo = Number(j.IdJogo);
      const idClubeMandante = Number(String(j.EscudoMandante ?? "").match(/CLUBE\/(\d+)\//)?.[1] ?? NaN);
      const idClubeVisitante = Number(String(j.EscudoVisitante ?? "").match(/CLUBE\/(\d+)\//)?.[1] ?? NaN);
      return {
        idJogo,
        data: String(j.Data ?? ""),
        rodada: Number(j.Rodada ?? fallbackRodada),
        mandante: String(j.NomePopularMandante ?? ""),
        visitante: String(j.NomePopularVisitante ?? ""),
        idClubeMandante,
        idClubeVisitante,
        linkSumula: typeof j.LinkSumula === "string" && j.LinkSumula ? j.LinkSumula : null,
      };
    })
    .filter((m) => Number.isInteger(m.idJogo) && m.idJogo > 0);
}

/**
 * Lists every match (with a result already in) for one round of one FPF competition/
 * category. The caller loops rounds 1..N (via `discoverFpfCurrentRound`). Reuses the
 * page-load auto-fired response when `rodada` is the one already showing (always
 * round 1 on a fresh load); otherwise clicks the round dropdown and captures the
 * resulting response.
 */
export async function discoverFpfRound(
  page: Page,
  opts: { idCampeonato: number; idCategoria: number; ano: number; rodada: number },
): Promise<FpfMatchRef[]> {
  await ensureOnTabelaPage(page, opts);

  const cached = initialRoundCache.get(page);
  const data =
    cached && cached.competitionKey === competitionKey(opts) && cached.rodada === opts.rodada
      ? cached.data
      : await selectRoundAndCapture(page, opts);

  return mapListTabelaJson(data, opts.rodada);
}

/**
 * The last available round for a competition — bounds the `discoverFpfRound` loop.
 * Read by opening the round dropdown and counting its own `Rodada N` options (confirmed
 * live: a fresh page load always defaults to Rodada 1, so the selector's label can't be
 * used for this — the full option list is what actually tells us how many rounds
 * exist).
 */
export async function discoverFpfCurrentRound(
  page: Page,
  opts: { idCampeonato: number; idCategoria: number; ano: number },
): Promise<number> {
  await ensureOnTabelaPage(page, opts);

  // See `selectRoundAndCapture`'s comment — the widget is duplicated in the DOM with
  // a hidden copy, so `:visible` is required to hit the one actually on screen.
  await page.locator('a[title="Selecione a rodada"]:visible').first().click();
  const titles = await page.locator('a[title^="Rodada "]:visible').allInnerTexts();
  await page.locator('a[title="Selecione a rodada"]:visible').first().click(); // toggle the dropdown closed again

  const rounds = titles.map((t) => Number(t.replace(/\D/g, ""))).filter((n) => Number.isInteger(n) && n > 0);
  return rounds.length ? Math.max(...rounds) : 0;
}
