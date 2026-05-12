/**
 * FASE 5 — Validação operacional real (Playwright + servidor local).
 * Credenciais: PHASE4_EMAIL e PHASE4_PASSWORD apenas no ambiente (nunca commite).
 *
 * Variáveis opcionais:
 *   PHASE5_TIMEOUT_MS   — timeout global (ms), padrão 180000
 *   PHASE5_SHORT=1      — só login → fornecedor → estoque (insumo) → entrada → saída
 *   PHASE5_DEBUG=1      — logs extra no stderr
 *   PHASE5_FORN_WAIT_MS — poll fornecedores (ms), padrão 90000
 *
 * Dados canónicos: TESTE_AUDITORIA_INSUMO, TESTE_AUDITORIA_FORNECEDOR,
 * TESTE_AUDITORIA_ENTRADA / TESTE_AUDITORIA_SAIDA (referência em ficha técnica + movimentação rápida).
 */
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { startServer } from "../server.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 3100);
const baseUrl = `http://127.0.0.1:${port}`;

const email = String(process.env.PHASE4_EMAIL || "").trim().toLowerCase();
const password = String(process.env.PHASE4_PASSWORD || "");

const TIMEOUT_MS = Number(process.env.PHASE5_TIMEOUT_MS || 180000);
const SHORT =
  process.env.PHASE5_SHORT === "1" ||
  String(process.env.PHASE5_SHORT || "").toLowerCase() === "true";
const DEBUG =
  process.env.PHASE5_DEBUG === "1" ||
  String(process.env.PHASE5_DEBUG || "").toLowerCase() === "true";

const CANON = {
  insumo: "TESTE_AUDITORIA_INSUMO",
  fornecedor: "TESTE_AUDITORIA_FORNECEDOR",
  entrada: "TESTE_AUDITORIA_ENTRADA",
  saida: "TESTE_AUDITORIA_SAIDA",
  barcode: "7890999001555",
  categoria: "Auditoria Fase5"
};

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];

const IGNORE_CONSOLE = [
  "favicon",
  "ResizeObserver",
  "net::ERR_",
  "Failed to load resource",
  "Non-Error promise rejection"
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const reportsDir = () => join(__dirname, "..", "reports");

function log(msg) {
  console.error(`[phase5] ${msg}`);
}

function debug(msg) {
  if (DEBUG) {
    console.error(`[phase5:debug] ${msg}`);
  }
}

let currentStage = "bootstrap";
function setStage(name) {
  currentStage = name;
  log(`etapa → ${name}`);
}

function ignoreConsole(text) {
  return IGNORE_CONSOLE.some((s) => String(text || "").includes(s));
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

function computeAnswers(report, globalErrors) {
  const steps = report.steps || [];
  const modules = report.modules || [];
  const s = (name) => steps.find((x) => x.name === name)?.ok === true;
  const modOk = (lbl) => modules.find((m) => m.label === lbl)?.ok === true;
  const anyFirestoreDenied =
    modules.some((m) => m.firestoreDenied) ||
    globalErrors.some((e) => /permission-denied/i.test(e.text || ""));
  const erroCritico = !report.login?.ok || anyFirestoreDenied || Boolean(report.fatal);
  report.answers = {
    cadastroInsumoPronto: s("insumo_salvo"),
    cadastroFornecedorPronto: s("fornecedor_salvo"),
    entradaPronta: s("entrada_rapida"),
    saidaPronta: s("saida_rapida"),
    historicoIntegro: s("entrada_rapida") && s("saida_rapida"),
    reposicaoFunciona: modOk("alertas"),
    etiquetasFuncionam: modOk("producao_etiquetas") && modOk("impressora"),
    inconsistenciaDados:
      !s("insumo_salvo") || !s("fornecedor_salvo")
        ? "possível — ver passos falhos ou duplicados"
        : "não detetada pelo script",
    erroCritico,
    alimentacaoRealRecomendada:
      report.login?.ok &&
      s("fornecedor_salvo") &&
      s("insumo_salvo") &&
      s("entrada_rapida") &&
      s("saida_rapida") &&
      !anyFirestoreDenied &&
      !erroCritico
  };
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

async function login(page, report) {
  setStage("login-inicio");
  debug(`GET login.html (${baseUrl})`);
  await page.goto(`${baseUrl}/login.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  log(`página atual: ${page.url()}`);
  await page.fill("#login-email", email);
  await page.fill("#login-senha", password);
  await page.click("#submit-button");
  try {
    await page.waitForURL(/dashboard-saas\.html/i, { timeout: 55000 });
    report.login = { ok: true };
    setStage("login-concluido");
    log(`página atual: ${page.url()}`);
  } catch {
    report.login = { ok: false, url: page.url() };
    setStage("login-falhou");
    log(`página atual: ${page.url()}`);
    throw new Error("Login falhou.");
  }
}

async function captureTimeoutArtifacts(page, report) {
  const dir = reportsDir();
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* exists */
  }
  const ts = Date.now();
  const png = join(dir, `phase5-timeout-${ts}.png`);
  const htmlPath = join(dir, `phase5-timeout-${ts}.html`);
  try {
    if (page) {
      await page.screenshot({ path: png, fullPage: true }).catch(() => {});
      const html = await page.content().catch(() => "<!-- sem HTML -->");
      writeFileSync(htmlPath, html, "utf8");
      report.timeoutArtifacts = {
        screenshot: `reports/phase5-timeout-${ts}.png`,
        html: `reports/phase5-timeout-${ts}.html`
      };
      log(`timeout: screenshot → ${report.timeoutArtifacts.screenshot}`);
      log(`timeout: HTML → ${report.timeoutArtifacts.html}`);
    } else {
      report.timeoutArtifacts = { note: "sem página Playwright para capturar" };
    }
  } catch (e) {
    report.timeoutArtifacts = { error: String(e?.message || e).slice(0, 200) };
  }
}

async function runFlow(page, report, globalErrors, push) {
  const dumpFornDiag = async () => {
    report.fornecedoresDiag = await page
      .evaluate(() => {
        function inputLooksInteractable(el) {
          if (!el) {
            return false;
          }
          const s = window.getComputedStyle(el);
          if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) {
            return false;
          }
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }
        const input = document.querySelector("#supplier-form input#nome");
        const r = window.__fornecedoresReadiness;
        const hasReadinessApi = r != null && Object.prototype.hasOwnProperty.call(r, "ready");
        return {
          href: location.href,
          ready: document.readyState,
          hasNome: Boolean(document.getElementById("nome")),
          nomeScopedInteractable: inputLooksInteractable(input),
          hasSupplierForm: Boolean(document.getElementById("supplier-form")),
          title: document.title,
          userInfoLen: (document.getElementById("user-info")?.textContent || "").trim().length,
          appReady: Boolean(r?.ready),
          hasReadinessApi,
          readinessMarks: r?.marks || null,
          readinessClass: r?.classificacao || null,
          readinessError: r?.error || null
        };
      })
      .catch(() => null);
  };

  const waitFornMs = Number(process.env.PHASE5_FORN_WAIT_MS || 90000);
  const pollFornReady = async () => {
    const deadline = Date.now() + waitFornMs;
    while (Date.now() < deadline) {
      await dumpFornDiag();
      const d = report.fornecedoresDiag;
      if (!d) {
        await delay(400);
        continue;
      }
      if (!/fornecedores\.html/i.test(d.href || "")) {
        return { kind: "away", diag: d };
      }
      const readyByApp =
        d.hasReadinessApi && d.appReady && d.nomeScopedInteractable;
      const readyLegacy =
        !d.hasReadinessApi && d.nomeScopedInteractable && d.userInfoLen > 0;
      if (readyByApp || readyLegacy) {
        await delay(400);
        await dumpFornDiag();
        const later = report.fornecedoresDiag;
        if (!later || !/fornecedores\.html/i.test(later.href || "")) {
          return { kind: "away", diag: later || d };
        }
        const okLater =
          (later.hasReadinessApi && later.appReady && later.nomeScopedInteractable) ||
          (!later.hasReadinessApi && later.nomeScopedInteractable && later.userInfoLen > 0);
        if (okLater) {
          report.fornecedoresReadinessSnapshot = {
            marks: later.readinessMarks,
            classificacao: later.readinessClass
          };
          return { kind: "ready", diag: later };
        }
      }
      await delay(450);
    }
    await dumpFornDiag();
    return { kind: "timeout", diag: report.fornecedoresDiag };
  };

  /* Ordem: fornecedor antes do insumo (dropdown depende do fornecedor) */
  setStage("modulo-fornecedores-inicio");
  log(`página atual: ${page.url()}`);
  await page.goto(`${baseUrl}/fornecedores.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
  log(`página atual: ${page.url()}`);
  debug("poll formulário fornecedor…");
  const fornWait = await pollFornReady();
  const urlForn = page.url();
  let fornOk = false;
  let fornStatus = "";
  setStage("modulo-fornecedores-criacao");
  if (/login\.html/i.test(urlForn)) {
    push("fornecedor_salvo", false, { note: "redirecionado para login" });
  } else if (fornWait.kind === "away" || !/fornecedores\.html/i.test(urlForn)) {
    push("fornecedor_salvo", false, {
      note:
        "URL final não é fornecedores.html — sem fornecedores.ver (alert+redirect), tipo estoque, ou sessão inválida. Ver scripts/phase5-fornecedores-diagnostic.mjs.",
      url: page.url().replace(/\/\/.*@/, "//***@"),
      fornPoll: fornWait.kind,
      diag: fornWait.diag
    });
  } else if (fornWait.kind === "timeout") {
    push("fornecedor_salvo", false, {
      note:
        "Timeout à espera de `__fornecedoresReadiness.ready` + campo nome acionável — rede lenta, Firestore pesado ou overlay. Aumente PHASE5_FORN_WAIT_MS / PHASE5_TIMEOUT_MS ou rode npm run diag:fornecedores-phase5.",
      diag: fornWait.diag,
      fornPoll: "timeout"
    });
  } else if (!fornWait.diag?.hasSupplierForm || !fornWait.diag?.hasNome) {
    push("fornecedor_salvo", false, {
      note: "DOM sem supplier-form / #nome — página incompleta.",
      diag: fornWait.diag
    });
  } else {
    const nomeField = page.locator("#supplier-form input#nome");
    await nomeField.scrollIntoViewIfNeeded().catch(() => {});
    await nomeField.fill(CANON.fornecedor, { timeout: 60000 });
    await page.click("#save-button");
    await delay(5000);
    fornStatus = await page.locator("#status").textContent().catch(() => "");
    fornOk =
      /sucesso|salvo/i.test(fornStatus || "") ||
      /Já existe um fornecedor com esse nome/i.test(fornStatus || "");
    push("fornecedor_salvo", fornOk, {
      statusSnippet: (fornStatus || "").slice(0, 200),
      selectorUsed: "#supplier-form input#nome"
    });
  }
  log(`fornecedor: fim (ok=${fornOk})`);
  setStage("modulo-fornecedores-fim");

  setStage("modulo-estoque-insumo-inicio");
  await page.goto(`${baseUrl}/estoque.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
  log(`página atual: ${page.url()}`);
  await delay(5000);
  await page.click("#stock-header-new-insumo");
  await delay(600);
  await page.fill("#novo_codigo_barras", CANON.barcode);
  await page.fill("#novo_nome", CANON.insumo);
  await page.fill("#novo_categoria", CANON.categoria);
  await page.fill("#novo_min", "2");
  await page.fill("#novo_qtd", "5");
  await page.click('button[data-drawer-tab="fornecedores"]');
  await delay(800);
  await page
    .waitForFunction(
      (name) => {
        const sel = document.querySelector("#novo_fornecedor");
        if (!sel) {
          return false;
        }
        return [...sel.options].some((o) => String(o.textContent || "").includes(name));
      },
      CANON.fornecedor,
      { timeout: 20000 }
    )
    .catch(() => {});
  await page.evaluate((name) => {
    const sel = document.getElementById("novo_fornecedor");
    if (!sel) {
      return;
    }
    const opt = [...sel.options].find((o) => String(o.textContent || "").includes(name));
    if (opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, CANON.fornecedor);
  await page.fill("#novo_custo", "12.5");
  await page.click("#add-supplier-button");
  await delay(600);
  await page.fill(
    "#novo_ficha_observacoes",
    `Ref.canônica entrada: ${CANON.entrada} | saída: ${CANON.saida} | FASE5`
  );
  setStage("modulo-estoque-insumo-salvar");
  await page.click("#create-button");
  await delay(5000);
  const prodStatus = await page.locator("#status").textContent().catch(() => "");
  const prodOk =
    /sucesso|cadastrado|salvo/i.test(prodStatus || "") ||
    /Já existe um produto com esse nome/i.test(prodStatus || "") ||
    /Já existe um produto cadastrado com o código de barras/i.test(prodStatus || "");
  push("insumo_salvo", prodOk, { statusSnippet: (prodStatus || "").slice(0, 220) });
  log(`insumo: fim (ok=${prodOk})`);
  setStage("modulo-estoque-insumo-fim");

  setStage("entrada-rapida-inicio");
  await page.fill("#quick_barcode", CANON.barcode);
  await page.click("#quick-lookup-barcode");
  await delay(3500);
  await page.fill("#quick_box_price", "25");
  await page.fill("#quick_entry_quantity", "1");
  await page.click("#quick-entry-box");
  await delay(4500);
  const qeStatus = await page.locator("#quick-box-status").textContent().catch(() => "");
  const entradaOk = /Entrada registrada|registrada/i.test(qeStatus || "");
  push("entrada_rapida", entradaOk, { statusSnippet: (qeStatus || "").slice(0, 200) });
  log(`entrada rápida: fim (ok=${entradaOk})`);
  setStage("entrada-rapida-fim");

  setStage("saida-rapida-inicio");
  await page.fill("#quick_exit_quantity", "1");
  await page.click("#quick-exit-box");
  await delay(4500);
  const qsStatus = await page.locator("#quick-box-status").textContent().catch(() => "");
  const saidaOk = /Saída registrada|registrada/i.test(qsStatus || "");
  push("saida_rapida", saidaOk, { statusSnippet: (qsStatus || "").slice(0, 200) });
  log(`saída rápida: fim (ok=${saidaOk})`);
  setStage("saida-rapida-fim");

  setStage("historico");
  log(
    "histórico: movimentos acima gravam em `historico` via app (sem passo UI dedicado neste script)"
  );
  push("historico_implicito", entradaOk && saidaOk, {
    note: "Validação implícita pelos passos entrada_rapida + saida_rapida"
  });

  if (SHORT) {
    setStage("modo-curto-skip-extras");
    log("PHASE5_SHORT=1 — a saltar buscas, módulos extra, viewports, shell e logout");
    report.phase5Short = true;
    return;
  }

  setStage("busca-estoque-inicio");
  await page.fill("#stock-top-search", "TESTE_AUDITORIA_");
  await delay(1500);
  const listaHtml = await page.locator("#lista").innerHTML().catch(() => "");
  report.search.estoqueListaContemPrefixo = listaHtml.includes("TESTE_AUDITORIA");
  push("busca_estoque_prefixo", report.search.estoqueListaContemPrefixo);
  log(`busca estoque prefixo: fim (match=${report.search.estoqueListaContemPrefixo})`);
  setStage("busca-estoque-fim");

  setStage("busca-global-inicio");
  await page.click("#dashboard-search-button");
  await delay(500);
  await page.fill("#dashboard-global-search", "TESTE_AUDITORIA_");
  await delay(400);
  report.search.dialogAberto = await page.locator("#dashboard-search-dialog").isVisible().catch(() => false);
  await page.keyboard.press("Escape");
  await delay(300);
  log("busca global: fim");
  setStage("busca-global-fim");

  const modulePaths = [
    { path: "alertas-reposicao.html", label: "alertas" },
    { path: "compras.html", label: "compras" },
    { path: "relatorio-diario.html", label: "relatorio_diario" },
    { path: "producao-etiquetas.html", label: "producao_etiquetas" },
    { path: "impressora.html", label: "impressora" }
  ];

  for (const m of modulePaths) {
    setStage(`modulo-${m.label}-inicio`);
    log(`módulo: ${m.label} (${m.path})`);
    const errBefore = globalErrors.length;
    await page.goto(`${baseUrl}/${m.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    log(`página atual: ${page.url()}`);
    await delay(2800);
    const url = page.url();
    const onLogin = /login\.html/i.test(url);
    const errSlice = globalErrors.slice(errBefore);
    const firestoreDenied = errSlice.some((e) =>
      /permission-denied|Missing or insufficient permissions/i.test(e.text || "")
    );
    report.modules.push({
      label: m.label,
      ok: !onLogin && !firestoreDenied,
      onLogin,
      firestoreDenied
    });
    setStage(`modulo-${m.label}-fim`);
  }

  setStage("viewports-inicio");
  report.viewports.results = [];
  for (const vp of VIEWPORTS) {
    setStage(`viewport-${vp.name}`);
    log(`viewport: ${vp.name} (${vp.width}×${vp.height})`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${baseUrl}/estoque.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await delay(2200);
    const doc = await page.evaluate(() => ({
      vw: window.innerWidth,
      sw: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0)
    }));
    report.viewports.results.push({
      name: vp.name,
      overflowDelta: doc.sw - doc.vw
    });
  }
  setStage("viewports-fim");

  setStage("shell-sidebar-inicio");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseUrl}/estoque.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await delay(2000);
  const menu = page.locator("#dashboard-mobile-menu");
  if (await menu.isVisible().catch(() => false)) {
    const before = await page.evaluate(() => document.body.classList.contains("dashboard-sidebar-collapsed"));
    await menu.click();
    await delay(250);
    const mid = await page.evaluate(() => document.body.classList.contains("dashboard-sidebar-collapsed"));
    await menu.click();
    await delay(200);
    report.shell.sidebarToggleDesktop = { ok: before !== mid };
  } else {
    report.shell.sidebarToggleDesktop = { ok: false, note: "☰ não visível" };
  }

  setStage("shell-mobile-drawer");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/estoque.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await delay(1500);
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    await delay(500);
    const drawerOpen = await page.locator("#dashboard-mobile-drawer-backdrop").getAttribute("hidden");
    await page.keyboard.press("Escape");
    await delay(400);
    report.shell.mobileDrawer = { ok: drawerOpen === null };
  } else {
    report.shell.mobileDrawer = { ok: false };
  }
  setStage("shell-fim");

  setStage("logout-inicio");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseUrl}/dashboard-saas.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  log(`página atual: ${page.url()}`);
  await delay(2000);
  const logoutBtn = page.locator("[data-logout-button]").first();
  if (await logoutBtn.isVisible().catch(() => false)) {
    await logoutBtn.click();
    await delay(3500);
    report.logout = { ok: /login\.html/i.test(page.url()) };
  } else {
    report.logout = { ok: false };
  }
  log(`logout: fim (ok=${report.logout?.ok})`);
  setStage("logout-fim");
}

async function main() {
  if (!email || !password) {
    console.error("Defina PHASE4_EMAIL e PHASE4_PASSWORD no ambiente.");
    process.exit(1);
  }

  log(`timeout global: ${TIMEOUT_MS}ms | SHORT=${SHORT} | DEBUG=${DEBUG} | PORT=${port}`);
  log("servidor: a iniciar…");

  const report = {
    phase: 5,
    timestamp: new Date().toISOString(),
    credentialsNote: "E-mail e senha omitidos do relatório.",
    canonical: { ...CANON },
    login: {},
    steps: [],
    viewports: {},
    shell: {},
    search: {},
    modules: [],
    consoleErrors: [],
    answers: {},
    phase5Short: SHORT,
    phase5TimeoutMs: TIMEOUT_MS
  };

  const server = startServer({ port, host: "127.0.0.1", startScheduler: false });
  const globalErrors = [];
  let browser;
  let page;
  let timeoutHandle;
  let flowPromise;
  let reportFlushed = false;

  const flushReport = (partial) => {
    if (reportFlushed) {
      return;
    }
    reportFlushed = true;
    const outDir = reportsDir();
    try {
      mkdirSync(outDir, { recursive: true });
    } catch {
      /* exists */
    }
    report.consoleErrors = report.consoleErrors?.length ? report.consoleErrors : globalErrors.slice(0, 40);
    computeAnswers(report, globalErrors);
    if (partial) {
      report.partial = true;
      report.partialReason = report.timeoutReason || report.fatal || "interrupção";
    }
    writeFileSync(join(outDir, "phase5-raw.json"), JSON.stringify(report, null, 2), "utf8");
    log(`relatório gravado: reports/phase5-raw.json${partial ? " (parcial)" : ""}`);
  };

  try {
    setStage("wait-health");
    await waitForHealth();
    log(`servidor iniciado (health OK) — base ${baseUrl}`);

    const timeoutPromise = new Promise((_, rej) => {
      timeoutHandle = setTimeout(() => {
        const err = new Error(`PHASE5_TIMEOUT_MS (${TIMEOUT_MS}ms) na etapa: ${currentStage}`);
        err.code = "PHASE5_GLOBAL_TIMEOUT";
        rej(err);
      }, TIMEOUT_MS);
    });

    flowPromise = (async () => {
      setStage("browser-launch");
      browser = await chromium.launch({ headless: true });
      log("browser iniciado (Chromium headless)");
      const context = await browser.newContext();
      page = await context.newPage();
      page.on("dialog", (d) => {
        d.accept().catch(() => {});
      });
      attachCollectors(page, globalErrors);

      await login(page, report);

      const push = (name, ok, detail = {}) => {
        report.steps.push({ name, ok, ...detail });
      };

      await runFlow(page, report, globalErrors, push);

      setStage("cleanup");
      log("cleanup: sem remoção automática de dados — ver AUDITORIA.md FASE 5 (limpeza manual TESTE_AUDITORIA_)");

      report.consoleErrors = globalErrors.slice(0, 40);
      computeAnswers(report, globalErrors);
      console.log(JSON.stringify(report, null, 2));
    })();

    await Promise.race([flowPromise, timeoutPromise]);
    clearTimeout(timeoutHandle);
    timeoutHandle = undefined;
    await flowPromise;
  } catch (runErr) {
    clearTimeout(timeoutHandle);
    timeoutHandle = undefined;
    const code = runErr?.code;
    if (code === "PHASE5_GLOBAL_TIMEOUT") {
      report.timeout = true;
      report.timeoutStage = currentStage;
      report.timeoutMs = TIMEOUT_MS;
      report.timeoutReason = runErr.message;
      report.fatal = runErr.message;
      log(`TIMEOUT GLOBAL na etapa: ${currentStage}`);
      await captureTimeoutArtifacts(page, report);
      flushReport(true);
    } else {
      report.fatal = String(runErr?.message || runErr).slice(0, 500);
      console.error(report.fatal);
      flushReport(true);
    }
    flowPromise?.catch(() => {});
  } finally {
    clearTimeout(timeoutHandle);
    if (browser) {
      log("browser: a encerrar…");
      await browser.close().catch(() => {});
    }
    if (!reportFlushed) {
      flushReport(false);
    }
    log("servidor: a encerrar…");
    await new Promise((resolve) => server.close(resolve));
    log("servidor encerrado");
  }

  if (report.timeout || report.fatal) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
