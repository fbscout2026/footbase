import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import type { BrowserContext, Page, Browser } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Ativa o plugin de camuflagem anti-detecção
chromium.use(stealthPlugin());

export interface StealthSessionOptions {
  headless?: boolean;
  userDataDir?: string;
  sessionCookiePath?: string;
}

export interface StealthSession {
  browser: Browser | null;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

/**
 * Script de inicialização injetado na página antes dos scripts da aplicação carregar.
 * Neutraliza marcas conhecidas de automação Chromium (CDC, navigator.webdriver, etc).
 */
async function injectAntiAutomationEvasions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // 1. Remove navigator.webdriver
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    // 2. Mock do objeto window.chrome se estiver oculto
    if (!(window as unknown as { chrome?: object }).chrome) {
      (window as unknown as { chrome: object }).chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: {},
      };
    }

    // 3. Mock de plugins realistas
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    // 4. Idiomas padrão
    Object.defineProperty(navigator, "languages", {
      get: () => ["pt-BR", "pt", "en-US", "en"],
    });

    // 5. Permissão de notificação neutra
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery(parameters);
    }
  });
}

/**
 * Detecta se a página atual caiu em um desafio da Cloudflare (Turnstile, JS challenge ou 403)
 * e aguarda até que o desafio seja superado ou até esgotar o timeout.
 */
export async function waitForCloudflareChallenge(page: Page, timeoutMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const title = (await page.title().catch(() => "")).toLowerCase();
    const content = (await page.content().catch(() => "")).toLowerCase();

    const isCloudflareChallenge =
      title.includes("just a moment") ||
      title.includes("aguarde") ||
      title.includes("attention required") ||
      title.includes("verificando se você é humano") ||
      content.includes("cf-challenge-running") ||
      content.includes("challenges.cloudflare.com") ||
      content.includes("ray id:");

    if (!isCloudflareChallenge) {
      return true; // Não está em desafio ou desafio já foi superado
    }

    console.log("[stealth-browser] Desafio Cloudflare detectado. Aguardando resolução da sessão...");
    await page.waitForTimeout(2000);
  }

  const finalTitle = await page.title().catch(() => "");
  console.warn(`[stealth-browser] Timeout aguardando resolução do Cloudflare (título atual: "${finalTitle}")`);
  return false;
}

/**
 * Salva cookies da sessão atual em um arquivo JSON para persistência entre execuções.
 */
export async function saveSessionCookies(context: BrowserContext, filePath: string): Promise<void> {
  try {
    const cookies = await context.cookies();
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(cookies, null, 2), "utf-8");
    console.log(`[stealth-browser] ${cookies.length} cookies armazenados em ${filePath}`);
  } catch (err) {
    console.error("[stealth-browser] Falha ao salvar cookies de sessão:", err);
  }
}

/**
 * Carrega cookies salvos em um arquivo JSON para a sessão atual.
 */
export async function loadSessionCookies(context: BrowserContext, filePath: string): Promise<void> {
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, "utf-8");
      const cookies = JSON.parse(data);
      if (Array.isArray(cookies) && cookies.length > 0) {
        await context.addCookies(cookies);
        console.log(`[stealth-browser] ${cookies.length} cookies de sessão restaurados de ${filePath}`);
      }
    }
  } catch (err) {
    console.error("[stealth-browser] Falha ao carregar cookies de sessão:", err);
  }
}

/**
 * Cria uma nova sessão com navegador camuflado (Stealth Engine).
 * Suporta navegador efêmero ou contexto de perfil persistente.
 */
export async function createStealthSession(options: StealthSessionOptions = {}): Promise<StealthSession> {
  const headless = options.headless ?? false;
  const launchArgs = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-infobars",
    "--window-position=0,0",
    "--ignore-certificate-errors",
    "--disable-features=IsolateOrigins,site-per-process",
  ];

  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  let browser: Browser | null = null;
  let context: BrowserContext;

  if (options.userDataDir) {
    context = await chromium.launchPersistentContext(options.userDataDir, {
      headless,
      channel: "chrome",
      args: launchArgs,
      userAgent,
      viewport: { width: 1366, height: 768 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      permissions: ["geolocation"],
      extraHTTPHeaders: {
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
      },
    });
  } else {
    browser = await chromium.launch({
      headless,
      channel: "chrome",
      args: launchArgs,
    });
    context = await browser.newContext({
      userAgent,
      viewport: { width: 1366, height: 768 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      permissions: ["geolocation"],
      extraHTTPHeaders: {
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
      },
    });
  }

  if (options.sessionCookiePath) {
    await loadSessionCookies(context, options.sessionCookiePath);
  }

  const page = context.pages().length > 0 ? context.pages()[0]! : await context.newPage();
  await injectAntiAutomationEvasions(page);

  const close = async () => {
    if (options.sessionCookiePath) {
      await saveSessionCookies(context, options.sessionCookiePath);
    }
    if (browser) {
      await browser.close().catch(() => {});
    } else {
      await context.close().catch(() => {});
    }
  };

  return { browser, context, page, close };
}