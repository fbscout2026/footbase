// FOOTBASE — FPF Cloudflare Session Resolver & Verification Utility
//
// Rodada via CLI:
//   npx tsx lib/services/scraper/discovery/fpf-session-resolver.ts
// ou
//   npm run fpf:session

import { createStealthSession, waitForCloudflareChallenge } from "./stealth-browser.ts";

export async function resolveFpfSession(options: { headless?: boolean; cookiePath?: string } = {}): Promise<boolean> {
  const cookiePath = options.cookiePath ?? ".fpf-session-cookies.json";
  const headless = options.headless ?? false;

  console.log(`[fpf-session-resolver] Iniciando sessão stealth FPF (headless: ${headless})...`);

  const session = await createStealthSession({
    headless,
    sessionCookiePath: cookiePath,
  });

  try {
    const testUrl = "https://futebolpaulista.com.br/Competicoes/Tabela.aspx?idCampeonato=125&ano=2026&idCategoria=80&nav=1";
    console.log(`[fpf-session-resolver] Acessando ${testUrl}...`);

    await session.page.goto(testUrl, { waitUntil: "load", timeout: 45000 });
    const passed = await waitForCloudflareChallenge(session.page, 30000);

    if (passed) {
      const title = await session.page.title();
      console.log(`[fpf-session-resolver] ✅ Sessão resolvida com sucesso! Título: "${title}"`);
      await session.context.cookies();
      return true;
    } else {
      console.error("[fpf-session-resolver] ❌ Falha: Cloudflare não liberou o acesso no tempo estipulado.");
      return false;
    }
  } catch (err) {
    console.error("[fpf-session-resolver] Erro durante resolução da sessão:", err);
    return false;
  } finally {
    await session.close();
  }
}

resolveFpfSession().then((ok) => {
  process.exitCode = ok ? 0 : 1;
});
