/**
 * FASE 4 — auditoria autenticada (Playwright + servidor local).
 * Credenciais: PHASE4_EMAIL e PHASE4_PASSWORD (nunca commite).
 */
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { startServer } from "../server.js";

const port = Number(process.env.PORT || 3100);
const baseUrl = `http://127.0.0.1:${port}`;

const email = String(process.env.PHASE4_EMAIL || "").trim().toLowerCase();
const password = String(process.env.PHASE4_PASSWORD || "");

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 900 },
  { name: "640", width: 640, height: 900 },
  { name: "480", width: 480, height: 860 },
  { name: "390", width: 390, height: 844 }
];

const MODULE_PAGES = [
  { path: "dashboard-saas.html", label: "dashboard" },
  { path: "estoque.html", label: "estoque" },
  { path: "compras.html", label: "compras" },
  { path: "fornecedores.html", label: "fornecedores" },
  { path: "desperdicio.html", label: "desperdicio" },
  { path: "funcionarios.html", label: "funcionarios" },
  { path: "whatsapp-ia.html", label: "whatsapp" },
  { path: "configuracoes.html", label: "configuracoes" },
  { path: "alertas-reposicao.html", label: "alertas" },
  { path: "producao-etiquetas.html", label: "producao" },
  { path: "relatorio-diario.html", label: "relatorio" }
];

const IGNORE_CONSOLE = [
  "favicon",
  "ResizeObserver",
  "net::ERR_",
  "Failed to load resource",
  "Non-Error promise rejection",
  "Usuário não autenticado"
];

function ignoreConsole(text) {
  const t = String(text || "");
  return IGNORE_CONSOLE.some((s) => t.includes(s));
}

async function waitForHealth() {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/api/health`);
      if (r.ok) {
        return;
      }
    } catch {
      /* ignore */
    }
    await delay(400);
  }
  throw new Error("Servidor não respondeu a /api/health.");
}

function attachCollectors(page, bucket) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") {
      return;
    }
    const text = msg.text();
    if (ignoreConsole(text)) {
      return;
    }
    bucket.push({ kind: "console", text: text.slice(0, 500) });
  });
  page.on("pageerror", (err) => {
    const text = err?.message || String(err);
    if (ignoreConsole(text)) {
      return;
    }
    bucket.push({ kind: "pageerror", text: text.slice(0, 500) });
  });
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    const b = document.body;
    const vw = window.innerWidth;
    const sw = Math.max(d.scrollWidth, b?.scrollWidth || 0);
    return { vw, scrollWidth: sw, delta: sw - vw };
  });
}

function summarizeOverflow(overflowByVp) {
  let worst = 0;
  let worstVp = "";
  for (const [name, ov] of Object.entries(overflowByVp)) {
    if (ov.delta > worst) {
      worst = ov.delta;
      worstVp = name;
    }
  }
  return { worstDelta: worst, worstViewport: worstVp };
}

async function main() {
  if (!email || !password) {
    console.error("Defina PHASE4_EMAIL e PHASE4_PASSWORD no ambiente.");
    process.exit(1);
  }

  const server = startServer({ port, host: "127.0.0.1", startScheduler: false });
  const report = {
    phase: 4,
    auditCredentials: {
      source: "PHASE4_EMAIL / PHASE4_PASSWORD no ambiente",
      emailValueInReport: "omitido intencionalmente (não versionar identificadores)"
    },
    login: { ok: false, note: "" },
    modules: [],
    responsive: { dashboard: [], estoque: [] },
    shell: { desktopToggle: null, mobileDrawer: null },
    logout: { ok: false, note: "" },
    dialogs: []
  };

  try {
    await waitForHealth();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const globalErrors = [];
    attachCollectors(page, globalErrors);

    page.on("dialog", async (dialog) => {
      report.dialogs.push({ type: dialog.type(), message: dialog.message().slice(0, 300) });
      await dialog.accept().catch(() => {});
    });

    await page.goto(`${baseUrl}/login.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.fill("#login-email", email);
    await page.fill("#login-senha", password);
    await page.click("#submit-button");

    try {
      await page.waitForURL(/dashboard-saas\.html/i, { timeout: 50000 });
      report.login = { ok: true, note: "dashboard-saas.html" };
    } catch {
      report.login = {
        ok: false,
        note: `URL após login: ${page.url()}`,
        sampleErrors: globalErrors.slice(0, 15)
      };
      console.log(JSON.stringify(report, null, 2));
      await browser.close();
      process.exit(1);
    }

    let errorCursor = globalErrors.length;

    for (const mod of MODULE_PAGES) {
      const overflowByVp = {};
      const dialogsBefore = report.dialogs.length;

      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`${baseUrl}/${mod.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await delay(mod.path === "configuracoes.html" ? 4000 : 2500);
        overflowByVp[vp.name] = await measureOverflow(page);
      }

      const moduleErrors = globalErrors.slice(errorCursor);
      errorCursor = globalErrors.length;
      const moduleDialogs = report.dialogs.slice(dialogsBefore);
      const finalUrl = page.url();
      const onLogin = /login\.html/i.test(finalUrl);
      const permissionDialog = moduleDialogs.some((d) => /permissão|permissao|perfil não possui/i.test(d.message || ""));
      const firestoreDenied = moduleErrors.some((e) => /permission-denied|Missing or insufficient permissions/i.test(e.text || ""));

      report.modules.push({
        label: mod.label,
        path: mod.path,
        finalUrl: finalUrl.replace(/\/\/.*@/, "//***@"),
        ok: !onLogin && !permissionDialog && !firestoreDenied,
        permissionDialog,
        firestoreDenied,
        dialogs: moduleDialogs,
        errors: moduleErrors.slice(0, 25),
        overflow: summarizeOverflow(overflowByVp),
        overflowByVp
      });
    }

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/dashboard-saas.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(2500);
      report.responsive.dashboard.push({ viewport: vp.name, ...(await measureOverflow(page)) });
    }

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/estoque.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await delay(2500);
      report.responsive.estoque.push({ viewport: vp.name, ...(await measureOverflow(page)) });
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${baseUrl}/estoque.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(2000);
    const menuDesktop = page.locator(".clean-menu-button").first();
    if (await menuDesktop.isVisible().catch(() => false)) {
      await page.evaluate(() => {
        try {
          localStorage.removeItem("premium-shell-sidebar-collapsed");
        } catch {
          /* ignore */
        }
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await delay(1500);
      const before = await page.evaluate(() => document.body.classList.contains("sidebar-desktop-collapsed"));
      await menuDesktop.click();
      await delay(200);
      const mid = await page.evaluate(() => document.body.classList.contains("sidebar-desktop-collapsed"));
      await menuDesktop.click();
      await delay(200);
      report.shell.desktopToggle = { ok: before === false && mid === true };
    } else {
      report.shell.desktopToggle = { ok: false, note: "☰ não visível em 1280" };
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/estoque.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(1500);
    const menuMobile = page.locator(".clean-menu-button").first();
    const bd = page.locator(".premium-mobile-menu-backdrop").first();
    if (await menuMobile.isVisible().catch(() => false)) {
      await menuMobile.click();
      await delay(400);
      const hiddenAfterOpen = await bd.getAttribute("hidden");
      await page.keyboard.press("Escape");
      await delay(300);
      const hiddenAfterClose = await bd.getAttribute("hidden");
      report.shell.mobileDrawer = { ok: hiddenAfterOpen === null && hiddenAfterClose === "" };
    } else {
      report.shell.mobileDrawer = { ok: false, note: "☰ não visível em 390" };
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${baseUrl}/estoque.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(2000);
    const logoutBtn = page.locator("[data-logout-button]").first();
    if (await logoutBtn.isVisible().catch(() => false)) {
      await logoutBtn.click();
      await delay(3000);
      report.logout.ok = /login\.html/i.test(page.url());
      report.logout.note = report.logout.ok ? "login.html" : page.url();
    } else {
      report.logout = { ok: false, note: "Sair não visível" };
    }

    report.consoleErrorsSample = globalErrors.slice(0, 35);
    await browser.close();
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
