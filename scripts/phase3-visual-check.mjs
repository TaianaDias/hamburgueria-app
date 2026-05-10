/**
 * FASE 3 — checagens headless (Playwright): consola, overflow, toggles do shell.
 * Páginas com requireAuth terminam em login.html sem sessão Firebase (esperado).
 * O ficheiro public/dev-shell-probe.html permite testar premium-shell.js sem auth.
 */
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { startServer } from "../server.js";

const port = Number(process.env.PORT || 3100);
const baseUrl = `http://127.0.0.1:${port}`;

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 900 },
  { name: "640", width: 640, height: 900 },
  { name: "480", width: 480, height: 860 },
  { name: "390", width: 390, height: 844 }
];

const PAGES = [
  { path: "/dashboard-saas.html", kind: "dashboard" },
  { path: "/estoque.html", kind: "shell" },
  { path: "/compras.html", kind: "shell" },
  { path: "/fornecedores.html", kind: "shell" },
  { path: "/desperdicio.html", kind: "shell" },
  { path: "/etiquetas.html", kind: "redirect" },
  { path: "/funcionarios.html", kind: "shell" },
  { path: "/whatsapp-ia.html", kind: "shell" },
  { path: "/configuracoes.html", kind: "redirect" },
  { path: "/login.html", kind: "login" },
  { path: "/alertas-reposicao.html", kind: "shell" },
  { path: "/producao-etiquetas.html", kind: "shell" }
];

const IGNORE_CONSOLE_SUBSTRINGS = [
  "favicon",
  "Failed to load resource",
  "net::ERR_",
  "ResizeObserver loop",
  "Non-Error promise rejection",
  "Usu\u00e1rio n\u00e3o autenticado"
];

function shouldIgnoreConsole(text) {
  const t = String(text || "");
  return IGNORE_CONSOLE_SUBSTRINGS.some((s) => t.includes(s));
}

async function waitForServer() {
  const timeoutAt = Date.now() + 20000;
  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      /* ainda a subir */
    }
    await delay(400);
  }
  throw new Error("Timeout esperando servidor.");
}

function collectPageListeners(page) {
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") {
      return;
    }
    const text = msg.text();
    if (shouldIgnoreConsole(text)) {
      return;
    }
    consoleErrors.push({ type: "console", text });
  });

  page.on("pageerror", (err) => {
    const text = err?.message || String(err);
    if (shouldIgnoreConsole(text)) {
      return;
    }
    pageErrors.push({ type: "pageerror", text });
  });

  return { consoleErrors, pageErrors };
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const docEl = document.documentElement;
    const body = document.body;
    const vw = window.innerWidth;
    const scrollW = Math.max(docEl.scrollWidth, body?.scrollWidth || 0);
    const delta = scrollW - vw;
    return { vw, scrollW, delta, overflowSuspected: delta > 2 };
  });
}

async function runShellDesktopToggle(page) {
  const menu = page.locator(".clean-menu-button").first();
  const visible = await menu.isVisible().catch(() => false);
  if (!visible) {
    return { ok: false, note: "Botão ☰ não visível" };
  }
  await page.evaluate(() => {
    try {
      localStorage.removeItem("premium-shell-sidebar-collapsed");
    } catch {
      /* ignore */
    }
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await delay(500);
  const before = await page.evaluate(() => document.body.classList.contains("sidebar-desktop-collapsed"));
  await menu.click();
  await delay(200);
  const mid = await page.evaluate(() => document.body.classList.contains("sidebar-desktop-collapsed"));
  await menu.click();
  await delay(200);
  const after = await page.evaluate(() => document.body.classList.contains("sidebar-desktop-collapsed"));
  await menu.click();
  await delay(150);
  const stored = await page.evaluate(() => localStorage.getItem("premium-shell-sidebar-collapsed"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await delay(500);
  const persisted = await page.evaluate(() => document.body.classList.contains("sidebar-desktop-collapsed"));

  const toggleWorks = before === false && mid === true && after === false && stored === "1" && persisted === true;
  return { ok: toggleWorks, note: toggleWorks ? "toggle+localStorage OK" : `before=${before} mid=${mid} after=${after} stored=${stored} persisted=${persisted}` };
}

async function runShellMobileDrawer(page) {
  const backdrop = page.locator(".premium-mobile-menu-backdrop").first();
  const menu = page.locator(".clean-menu-button").first();
  const visible = await menu.isVisible().catch(() => false);
  if (!visible) {
    return { ok: false, note: "☰ não visível (mobile)" };
  }
  const hiddenStart = await backdrop.getAttribute("hidden");
  await menu.click();
  await delay(300);
  const hiddenOpen = await backdrop.getAttribute("hidden");
  /* Painel pode ocupar 100% da largura — clique “fora” nem existe; Escape fecha (mesmo fluxo do utilizador). */
  await page.keyboard.press("Escape");
  await delay(250);
  const hiddenClosed = await backdrop.getAttribute("hidden");
  const ok = hiddenStart === "" && hiddenOpen === null && hiddenClosed === "";
  return { ok, note: `hidden: start='${hiddenStart}' open='${hiddenOpen}' after Esc='${hiddenClosed}'` };
}

async function runProbeSuite(page, summary) {
  let worstDelta = 0;
  let worstVp = "";
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${baseUrl}/dev-shell-probe.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(400);
    const ov = await measureOverflow(page);
    summary.probe.overflow[vp.name] = ov;
    if (ov.delta > worstDelta) {
      worstDelta = ov.delta;
      worstVp = vp.name;
    }
    if (vp.name === "1280" && !summary.shellDesktopToggle) {
      summary.shellDesktopToggle = await runShellDesktopToggle(page);
    }
    if (vp.name === "390" && !summary.shellMobileDrawer) {
      summary.shellMobileDrawer = await runShellMobileDrawer(page);
    }
  }
  summary.probe.overflowWorst = { viewport: worstVp, delta: worstDelta };
}

async function main() {
  const server = startServer({ port, host: "127.0.0.1", startScheduler: false });
  try {
    await waitForServer();
    const browser = await chromium.launch({ headless: true });
    const summary = {
      byPage: {},
      probe: { overflow: {}, overflowWorst: null, errors: [] },
      shellDesktopToggle: null,
      shellMobileDrawer: null,
      dashboardNote:
        "Interações ☰ / gaveta em dashboard-saas.html não cobertas pelo probe (requireAuth). Lógica espelha premium-shell (mesmas keys de media query e localStorage separado)."
    };

    for (const { path: p } of PAGES) {
      summary.byPage[p] = { path: p, finalUrls: {}, overflow: {}, errors: [], overflowWorst: null };
    }

    const probeContext = await browser.newContext();
    const probePage = await probeContext.newPage();
    const probeListeners = collectPageListeners(probePage);
    await runProbeSuite(probePage, summary);
    summary.probe.errors = [...probeListeners.consoleErrors, ...probeListeners.pageErrors];
    await probeContext.close();

    for (const { path: p, kind } of PAGES) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const { consoleErrors, pageErrors } = collectPageListeners(page);

      let worstDelta = 0;
      let worstVp = "";

      const postGotoWait = kind === "redirect" ? 2000 : kind === "login" ? 500 : 2800;

      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`${baseUrl}${p}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await delay(postGotoWait);
        summary.byPage[p].finalUrls[vp.name] = page.url();

        const ov = await measureOverflow(page);
        summary.byPage[p].overflow[vp.name] = ov;
        if (ov.delta > worstDelta) {
          worstDelta = ov.delta;
          worstVp = vp.name;
        }
      }

      summary.byPage[p].errors = [...consoleErrors, ...pageErrors];
      summary.byPage[p].overflowWorst = { viewport: worstVp, delta: worstDelta };

      await context.close();
    }

    await browser.close();
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
