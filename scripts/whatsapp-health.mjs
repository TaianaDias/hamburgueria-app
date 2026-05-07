import fs from "fs";

const DEFAULT_BASE_URL = "http://localhost:8080";
const DEFAULT_BACKEND_URL = "http://127.0.0.1:3000";
const DEFAULT_INSTANCE = "cariocas-estoque";

function loadEnvironmentFile(filePath = ".env") {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

async function readJson(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function checkHttp(label, url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(8000)
    });
    const payload = await readJson(response);

    return {
      label,
      ok: response.ok,
      status: response.status,
      payload
    };
  } catch (error) {
    return {
      label,
      ok: false,
      status: 0,
      error: error.message
    };
  }
}

function maskPhone(value = "") {
  const digits = String(value).replace(/\D/g, "");

  if (digits.length <= 4) {
    return digits ? "****" : "nao configurado";
  }

  return `${digits.slice(0, 4)}*****${digits.slice(-4)}`;
}

function printCheck(result, detail = "") {
  const icon = result.ok ? "OK" : "FALHA";
  const status = result.status ? `HTTP ${result.status}` : "sem resposta";
  console.log(`[${icon}] ${result.label}: ${status}${detail ? ` - ${detail}` : ""}`);
}

loadEnvironmentFile();

const baseUrl = (process.env.EVOLUTION_BASE_URL || process.env.EVOLUTION_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
const backendUrl = (process.env.LOCAL_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
const apiKey = process.env.EVOLUTION_API_KEY || process.env.AUTHENTICATION_API_KEY || process.env.EVOLUTION_API_TOKEN || "";
const instance = process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || DEFAULT_INSTANCE;
const configuredWebhookUrl = process.env.EVOLUTION_WEBHOOK_URL || process.env.WHATSAPP_WEBHOOK_URL || "";

console.log("Diagnostico WhatsApp/Evolution");
console.log(`Evolution: ${baseUrl}`);
console.log(`Backend: ${backendUrl}`);
console.log(`Instancia: ${instance}`);
console.log(`Admin: ${maskPhone(process.env.ADMIN_WHATSAPP || "")}`);
console.log("");

const backend = await checkHttp("Backend local", `${backendUrl}/login.html`);
printCheck(backend);

const evolution = await checkHttp("Evolution API", `${baseUrl}/`);
printCheck(evolution, evolution.payload?.version ? `versao ${evolution.payload.version}` : "");

const headers = apiKey ? { apikey: apiKey } : {};
const state = await checkHttp(
  "Instancia WhatsApp",
  `${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`,
  { headers }
);
const instanceState = state.payload?.instance?.state || state.payload?.state || "";
printCheck(state, instanceState ? `estado ${instanceState}` : "");

const webhook = await checkHttp(
  "Webhook Evolution",
  `${baseUrl}/webhook/find/${encodeURIComponent(instance)}`,
  { headers }
);
const webhookUrl = webhook.payload?.url || "";
printCheck(webhook, webhookUrl ? webhookUrl : "nao configurado");

const expectedUrl = configuredWebhookUrl || "http://host.docker.internal:3000/webhook/evolution";
const webhookMatches = webhookUrl === expectedUrl;

if (webhook.ok && !webhookMatches) {
  console.log(`[ATENCAO] Webhook esperado: ${expectedUrl}`);
}

const ready = backend.ok
  && evolution.ok
  && String(instanceState).toLowerCase() === "open"
  && webhook.ok
  && Boolean(webhookUrl);

console.log("");
console.log(ready
  ? "Status final: pronto para responder mensagens no WhatsApp."
  : "Status final: ainda existe pendencia. Corrija os itens marcados como FALHA/ATENCAO.");
