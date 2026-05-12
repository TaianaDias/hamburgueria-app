/**
 * Diagnóstico focado em fornecedores.html (FASE 5) — usabilidade e readiness.
 * Credenciais: PHASE4_EMAIL / PHASE4_PASSWORD (nunca commite).
 *
 * Gera em reports/ (gitignored):
 *   - fornecedores-phase5-diag.json
 *   - fornecedores-phase5-diag.png
 *
 * Métricas: `window.__fornecedoresReadiness` (marks em ms desde o módulo), classificação percebida.
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

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "reports");

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

async function pollFornecedoresDeep(page, timeoutMs, tNav) {
  const deadline = Date.now() + timeoutMs;
  const samples = [];
  let firstDomComplete = null;
  let firstFormInDom = null;
  let firstInputInteractable = null;
  let firstUserInfo = null;
  let firstAppReady = null;

  while (Date.now() < deadline) {
    const elapsed = Date.now() - tNav;
    const snap = await page
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
        const href = location.href || "";
        const onForn = /fornecedores\.html/i.test(href);
        const input = document.querySelector("#supplier-form input#nome");
        const r = window.__fornecedoresReadiness;
        const hasReadinessApi = r != null && Object.prototype.hasOwnProperty.call(r, "ready");
        return {
          href,
          onFornecedoresPage: onForn,
          docReady: document.readyState,
          hasSupplierForm: Boolean(document.getElementById("supplier-form")),
          hasNomeId: Boolean(document.getElementById("nome")),
          inputInteractable: inputLooksInteractable(input),
          userInfoLen: (document.getElementById("user-info")?.textContent || "").trim().length,
          hasReadinessApi,
          appReady: Boolean(r?.ready),
          readinessMarks: r?.marks || null,
          readinessClass: r?.classificacao || null,
          readinessLabel: r?.classificacaoLabel || null,
          readinessError: r?.error || null,
          totalMs: r?.totalMs ?? null
        };
      })
      .catch(() => null);

    if (snap) {
      samples.push({ elapsedMs: elapsed, ...snap });
      if (snap.docReady === "complete" && firstDomComplete === null) {
        firstDomComplete = elapsed;
      }
      if (snap.hasSupplierForm && firstFormInDom === null) {
        firstFormInDom = elapsed;
      }
      if (snap.inputInteractable && firstInputInteractable === null) {
        firstInputInteractable = elapsed;
      }
      if (snap.userInfoLen > 0 && firstUserInfo === null) {
        firstUserInfo = elapsed;
      }
      if (snap.appReady && firstAppReady === null) {
        firstAppReady = elapsed;
      }

      if (!snap.onFornecedoresPage) {
        return {
          outcome: "redirected",
          snap,
          samples,
          firstDomComplete,
          firstFormInDom,
          firstInputInteractable,
          firstUserInfo,
          firstAppReady
        };
      }

      const readyByApp =
        snap.hasReadinessApi && snap.appReady && snap.inputInteractable;
      const readyLegacy =
        !snap.hasReadinessApi && snap.inputInteractable && snap.userInfoLen > 0;
      if (readyByApp || readyLegacy) {
        await delay(400);
        const snap2 = await page
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
            const href = location.href || "";
            const onForn = /fornecedores\.html/i.test(href);
            const input = document.querySelector("#supplier-form input#nome");
            const r = window.__fornecedoresReadiness;
            const hasReadinessApi = r != null && Object.prototype.hasOwnProperty.call(r, "ready");
            return {
              href,
              onFornecedoresPage: onForn,
              inputInteractable: inputLooksInteractable(input),
              userInfoLen: (document.getElementById("user-info")?.textContent || "").trim().length,
              hasReadinessApi,
              appReady: Boolean(r?.ready),
              readinessMarks: r?.marks || null,
              readinessClass: r?.classificacao || null,
              readinessLabel: r?.classificacaoLabel || null,
              totalMs: r?.totalMs ?? null
            };
          })
          .catch(() => null);
        if (snap2?.onFornecedoresPage) {
          const ok2 =
            (snap2.hasReadinessApi && snap2.appReady && snap2.inputInteractable) ||
            (!snap2.hasReadinessApi && snap2.inputInteractable && snap2.userInfoLen > 0);
          if (ok2) {
            return {
              outcome: "ready",
              snap: snap2,
              samples,
              firstDomComplete,
              firstFormInDom,
              firstInputInteractable,
              firstUserInfo,
              firstAppReady
            };
          }
        }
      }
    }
    await delay(450);
  }
  return {
    outcome: "timeout",
    snap: samples.at(-1),
    samples,
    firstDomComplete,
    firstFormInDom,
    firstInputInteractable,
    firstUserInfo,
    firstAppReady
  };
}

async function login(page) {
  await page.goto(`${baseUrl}/login.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill("#login-email", email);
  await page.fill("#login-senha", password);
  await page.click("#submit-button");
  await page.waitForURL(/dashboard-saas\.html/i, { timeout: 55000 });
}

async function main() {
  if (!email || !password) {
    console.error("Defina PHASE4_EMAIL e PHASE4_PASSWORD no ambiente.");
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  const staticAnalysis = {
    modalNovoFornecedor: false,
    formularioNoPainelPrincipal: true,
    gargalosTipicos: [
      "requireAuth → getUserContext (Firebase Auth + documento de perfil Firestore)",
      "Dois getDocs em paralelo após auth: coleções `estoque` e `fornecedores` (latência rede + tamanho)",
      "renderSuppliers após lista (DOM proporcional ao número de fornecedores)"
    ],
    formularioHtmlAntesUserInfo:
      "Sim: o #supplier-form existe no HTML estático; `user-info` só é preenchido após requireAuth. O readiness da app (`__fornecedoresReadiness.ready`) só fica true após Firestore + resetForm.",
    indicadorLoadingApos2s:
      "Sim: faixa #supplier-panel-loading visível se a sincronização ultrapassar 2s (percepção de velocidade)."
  };

  const report = {
    phase: "fornecedores-diagnostic-deep",
    timestamp: new Date().toISOString(),
    canonicalSelector: "#supplier-form input#nome",
    staticAnalysis,
    timingsFromNavigationMs: {},
    browserReadiness: null,
    pollOutcome: null,
    samplesCount: 0,
    samplesTail: [],
    consoleTail: []
  };

  const consoleLog = [];
  const server = startServer({ port, host: "127.0.0.1", startScheduler: false });
  let browser;

  try {
    await waitForHealth();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on("dialog", (d) => {
      d.accept().catch(() => {});
    });
    page.on("console", (msg) => {
      const t = msg.text();
      if (msg.type() === "error" || /permission|denied|error/i.test(t)) {
        consoleLog.push({ type: msg.type(), text: t.slice(0, 400) });
      }
    });
    page.on("pageerror", (err) => {
      consoleLog.push({ type: "pageerror", text: String(err?.message || err).slice(0, 400) });
    });

    await login(page);

    const tNav = Date.now();
    await page.goto(`${baseUrl}/fornecedores.html`, { waitUntil: "domcontentloaded", timeout: 120000 });

    const waitMs = Number(process.env.PHASE5_FORN_WAIT_MS || 90000);
    const poll = await pollFornecedoresDeep(page, waitMs, tNav);

    report.pollOutcome = poll.outcome;
    report.timingsFromNavigationMs = {
      primeiroDomComplete: poll.firstDomComplete,
      primeiroSupplierFormNoDom: poll.firstFormInDom,
      primeiroInputAcionavel: poll.firstInputInteractable,
      primeiroUserInfoPreenchido: poll.firstUserInfo,
      primeiroAppReady: poll.firstAppReady
    };
    report.browserReadiness = await page
      .evaluate(() => {
        const r = window.__fornecedoresReadiness;
        if (!r) {
          return null;
        }
        return {
          ready: r.ready,
          totalMs: r.totalMs,
          classificacao: r.classificacao,
          classificacaoLabel: r.classificacaoLabel,
          marks: r.marks || null
        };
      })
      .catch(() => null);

    report.samplesCount = poll.samples.length;
    report.samplesTail = poll.samples.slice(-15);
    report.finalUrl = page.url();
    report.consoleTail = consoleLog.slice(-40);

    report.formOuterHtml = await page
      .locator("#supplier-form")
      .evaluate((el) => el?.outerHTML?.slice(0, 12000) || "")
      .catch(() => "");

    report.recommendedSelector = "#supplier-form input#nome";
    report.recommendedWaitPlaywright =
      "page.waitForFunction(() => window.__fornecedoresReadiness?.ready === true) + input acionável";

    const png = join(outDir, "fornecedores-phase5-diag.png");
    await page.screenshot({ path: png, fullPage: true }).catch(() => {});
    report.screenshot = "reports/fornecedores-phase5-diag.png";

    writeFileSync(join(outDir, "fornecedores-phase5-diag.json"), JSON.stringify(report, null, 2), "utf8");

    console.error(
      `[diag:fornecedores] outcome=${poll.outcome} class=${report.browserReadiness?.classificacao || "n/a"} totalMs=${report.browserReadiness?.totalMs ?? "n/a"}`
    );
    console.log(JSON.stringify({ ok: poll.outcome === "ready", outcome: poll.outcome, finalUrl: report.finalUrl }, null, 2));
  } catch (e) {
    report.fatal = String(e?.message || e).slice(0, 500);
    console.error(report.fatal);
    writeFileSync(join(outDir, "fornecedores-phase5-diag.json"), JSON.stringify(report, null, 2), "utf8");
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

main();
