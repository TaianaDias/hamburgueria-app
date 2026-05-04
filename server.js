import cors from "cors";
import express from "express";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createStockAlertService } from "./server/stock-alerts.js";

const app = express();
const port = process.env.PORT || 3000;
const validRoles = new Set([
  "admin",
  "gerente",
  "compras",
  "producao",
  "estoque",
  "funcionario",
  "visualizacao",
  "caixa"
]);
const validAdditionalFunctions = new Set([
  "estoque",
  "compras",
  "producao",
  "etiquetas",
  "cmv",
  "relatorios",
  "treinamento",
  "fornecedores",
  "funcionarios",
  "configuracoes"
]);
const validWeekdayKeys = new Set(["seg", "ter", "qua", "qui", "sex", "sab", "dom"]);
const LOOKUP_TIMEOUT_MS = 8000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const envFilePath = path.join(__dirname, ".env");
const localServiceAccountPath = path.join(__dirname, "server", "serviceAccountKey.json");
const legacyRootServiceAccountPath = path.join(__dirname, "serviceAccountKey.json");

function loadEnvironmentFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  });
}

function normalizePrivateKey(value) {
  return String(value ?? "").replace(/\\n/g, "\n");
}

function parseServiceAccountFromEnvironment() {
  const rawJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "").trim();

  if (rawJson) {
    const parsed = JSON.parse(rawJson);

    if (parsed.private_key) {
      parsed.private_key = normalizePrivateKey(parsed.private_key);
    }

    return parsed;
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID ?? "").trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL ?? "").trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY ?? "");

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey
  };
}

function parseServiceAccountFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  const rawJson = fs.readFileSync(filePath, "utf-8").trim();

  if (!rawJson) {
    return null;
  }

  const parsed = JSON.parse(rawJson);

  if (parsed.private_key) {
    parsed.private_key = normalizePrivateKey(parsed.private_key);
  }

  return parsed;
}

function loadFirebaseServiceAccount() {
  const serviceAccountFromEnvironment = parseServiceAccountFromEnvironment();

  if (serviceAccountFromEnvironment) {
    return {
      type: "service-account",
      value: serviceAccountFromEnvironment,
      source: "variaveis de ambiente"
    };
  }

  const serviceAccountFileCandidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_FILE,
    "/etc/secrets/firebase-service-account.json",
    "/etc/secrets/serviceAccountKey.json",
    localServiceAccountPath,
    legacyRootServiceAccountPath
  ];

  for (const filePath of serviceAccountFileCandidates) {
    const serviceAccount = parseServiceAccountFile(filePath);

    if (!serviceAccount) {
      continue;
    }

    return {
      type: "service-account",
      value: serviceAccount,
      source: `arquivo ${filePath}`
    };
  }

  return {
    type: "application-default",
    value: null,
    source: "Application Default Credentials"
  };
}

loadEnvironmentFile(envFilePath);

const firebaseCredentialSource = loadFirebaseServiceAccount();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: firebaseCredentialSource.type === "service-account"
      ? admin.credential.cert(firebaseCredentialSource.value)
      : admin.credential.applicationDefault()
  });
}

const stockAlertService = createStockAlertService({
  admin,
  logger: console
});

app.disable("x-powered-by");
app.use(cors());
app.use(express.json());

function extractToken(headerValue) {
  if (!headerValue) {
    return "";
  }

  return headerValue.startsWith("Bearer ")
    ? headerValue.slice("Bearer ".length).trim()
    : headerValue.trim();
}

function normalizeName(value) {
  return String(value ?? "").trim().slice(0, 80);
}

function normalizeBarcode(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 24);
}

function normalizeLookupText(value) {
  return String(value ?? "").trim();
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return digits.startsWith("55") ? digits : `55${digits}`;
}

function resolveTenantContext(source = {}) {
  const profile = source.profile || source;
  const empresaId = normalizeLookupText(
    source.empresaId ||
    profile.empresaId ||
    profile.empresa ||
    process.env.DEFAULT_EMPRESA_ID ||
    "default"
  );
  const lojaId = normalizeLookupText(
    source.lojaId ||
    profile.lojaId ||
    profile.loja ||
    process.env.DEFAULT_LOJA_ID ||
    "matriz"
  );

  return {
    empresaId,
    lojaId
  };
}

function withTenantMetadata(data = {}, source = {}) {
  const tenant = resolveTenantContext(source);

  return {
    ...data,
    empresaId: data.empresaId || tenant.empresaId,
    lojaId: data.lojaId || tenant.lojaId
  };
}

async function recordAuditLog({
  tipo,
  origem = "api",
  actor = "",
  tenant = {},
  payload = {},
  before = null,
  after = null
}) {
  const scopedTenant = resolveTenantContext(tenant);
  await admin.firestore().collection("auditoriaOperacional").add({
    empresaId: scopedTenant.empresaId,
    lojaId: scopedTenant.lojaId,
    tipo: normalizeLookupText(tipo || "acao_operacional"),
    origem: normalizeLookupText(origem || "api"),
    actor: normalizeLookupText(actor || ""),
    payload,
    before,
    after,
    criadoEm: admin.firestore.FieldValue.serverTimestamp()
  });
}

function parseBooleanValue(value, fallback = false) {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "sim", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "nao", "não", "no"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeRole(value, fallback = "funcionario") {
  const normalized = String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace("producao", "producao");

  if (normalized === "funcionario" || normalized === "funcionário") {
    return "funcionario";
  }

  if (normalized === "visualizacao" || normalized === "visualização") {
    return "visualizacao";
  }

  return validRoles.has(normalized) ? normalized : fallback;
}

function sanitizeAdditionalFunctions(values = []) {
  const rawValues = Array.isArray(values)
    ? values
    : String(values ?? "")
      .split(/[,\s;|/]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  const selected = new Set();

  rawValues.forEach((value) => {
    const normalized = String(value ?? "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "_");

    const mapped = normalized === "ficha_tecnica" || normalized === "ficha_tecnica_cmv"
      ? "cmv"
      : normalized;

    if (validAdditionalFunctions.has(mapped)) {
      selected.add(mapped);
    }
  });

  return Array.from(selected);
}

function sanitizePermissionTree(source = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  return Object.entries(source).reduce((permissions, [moduleKey, actions]) => {
    if (!actions || typeof actions !== "object" || Array.isArray(actions)) {
      return permissions;
    }

    const cleanModuleKey = String(moduleKey ?? "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "_")
      .slice(0, 40);

    if (!cleanModuleKey) {
      return permissions;
    }

    const cleanActions = Object.entries(actions).reduce((result, [actionKey, value]) => {
      const cleanActionKey = String(actionKey ?? "")
        .trim()
        .replace(/[^\w]/g, "")
        .slice(0, 60);

      if (!cleanActionKey) {
        return result;
      }

      result[cleanActionKey] = parseBooleanValue(value, false);
      return result;
    }, {});

    permissions[cleanModuleKey] = cleanActions;
    return permissions;
  }, {});
}

function getPermissionValue(profile = {}, permission = "") {
  const [moduleKey, actionKey] = String(permission ?? "").split(".");

  if (!moduleKey || !actionKey) {
    return null;
  }

  const value = profile.permissoes?.[moduleKey]?.[actionKey];
  return typeof value === "boolean" ? value : null;
}

function hasPermission(profile = {}, permission = "") {
  const manualValue = getPermissionValue(profile, permission);

  if (manualValue === false) {
    return false;
  }

  if (manualValue === true) {
    return true;
  }

  return profile.tipo === "admin" || profile.perfilPrincipal === "admin";
}

function clampNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, parsed));
}

function normalizeWeekdayKey(value, fallback) {
  const normalized = String(value ?? "").trim().toLowerCase().slice(0, 3);
  return validWeekdayKeys.has(normalized) ? normalized : fallback;
}

function sanitizeAlertConfigPayload(body = {}) {
  const nextConfig = {};

  if ("enabled" in body) {
    nextConfig.enabled = parseBooleanValue(body.enabled, true);
  }

  if ("autoEvaluation" in body) {
    nextConfig.autoEvaluation = parseBooleanValue(body.autoEvaluation, true);
  }

  if ("dailyAdminAlertEnabled" in body) {
    nextConfig.dailyAdminAlertEnabled = parseBooleanValue(body.dailyAdminAlertEnabled, true);
  }

  if ("evaluationIntervalMinutes" in body) {
    nextConfig.evaluationIntervalMinutes = clampNumber(body.evaluationIntervalMinutes, 60, 15, 1440);
  }

  if ("scheduledHour" in body) {
    nextConfig.scheduledHour = clampNumber(body.scheduledHour, 8, 0, 23);
  }

  if ("notificationCooldownHours" in body) {
    nextConfig.notificationCooldownHours = clampNumber(body.notificationCooldownHours, 12, 1, 168);
  }

  if ("targetCoverageDays" in body) {
    nextConfig.targetCoverageDays = clampNumber(body.targetCoverageDays, 7, 1, 60);
  }

  if ("criticalPercentOfMinimum" in body) {
    nextConfig.criticalPercentOfMinimum = clampNumber(body.criticalPercentOfMinimum, 0.5, 0.1, 1);
  }

  if ("idealFallbackMultiplier" in body) {
    nextConfig.idealFallbackMultiplier = clampNumber(body.idealFallbackMultiplier, 2, 1, 10);
  }

  if ("weeklyReportEnabled" in body) {
    nextConfig.weeklyReportEnabled = parseBooleanValue(body.weeklyReportEnabled, true);
  }

  if ("weeklyReportWeekday" in body) {
    nextConfig.weeklyReportWeekday = normalizeWeekdayKey(body.weeklyReportWeekday, "seg");
  }

  if ("weeklyReportHour" in body) {
    nextConfig.weeklyReportHour = clampNumber(body.weeklyReportHour, 9, 0, 23);
  }

  if ("whatsappProvider" in body) {
    nextConfig.whatsappProvider = String(body.whatsappProvider ?? "").trim().toLowerCase() || "log";
  }

  return nextConfig;
}

function inferCategoryFromText(value) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const rules = [
    { keywords: ["molho", "ketchup", "maionese", "mostarda"], category: "molho" },
    { keywords: ["embal", "pote", "copo", "sacola", "guardanapo", "papel"], category: "embalagem" },
    { keywords: ["bebida", "refrigerante", "suco", "agua", "cerveja"], category: "bebida" },
    { keywords: ["carne", "blend", "hamburguer"], category: "proteina" },
    { keywords: ["queijo", "mussarela", "cheddar"], category: "laticinio" },
    { keywords: ["pao", "bun"], category: "panificacao" },
    { keywords: ["tempero", "insumo", "ingrediente"], category: "insumo" }
  ];

  for (const rule of rules) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.category;
    }
  }

  return "";
}

function inferOperationalIntent(message = "") {
  const text = normalizeLookupText(message)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const quantityMatch = text.match(/(\d+(?:[,.]\d+)?)/);
  const quantity = quantityMatch ? Number(quantityMatch[1].replace(",", ".")) : 0;
  const moneyMatch = text.match(/r?\$?\s*(\d+(?:[,.]\d{1,2})?)/);
  const cost = moneyMatch ? Number(moneyMatch[1].replace(",", ".")) : 0;
  let intent = "consulta";

  if (text.includes("entrou") || text.includes("comprei") || text.includes("chegou")) {
    intent = "entrada_estoque";
  } else if (text.includes("saiu") || text.includes("retirou") || text.includes("producao")) {
    intent = "saida_producao";
  } else if (text.includes("virou") || text.includes("porcion")) {
    intent = "porcionamento";
  } else if (text.includes("relatorio") || text.includes("resumo")) {
    intent = "relatorio_diario";
  } else if (text.includes("comprar") || text.includes("pedido")) {
    intent = "sugestao_compra";
  } else if (text.includes("venc")) {
    intent = "validade";
  }

  return {
    intent,
    confidence: intent === "consulta" ? 0.45 : 0.82,
    entities: {
      quantidade: Number.isFinite(quantity) ? quantity : 0,
      custoTotal: Number.isFinite(cost) ? cost : 0,
      textoOriginal: message
    }
  };
}

function buildOperationalConfirmation(intent, entities = {}) {
  const amount = entities.quantidade > 0 ? `${entities.quantidade} unidade(s)` : "a movimentacao informada";
  const costText = entities.custoTotal > 0 ? ` com valor de R$ ${entities.custoTotal.toFixed(2)}` : "";

  if (intent === "entrada_estoque") {
    return `Confirma entrada de ${amount}${costText}?`;
  }

  if (intent === "saida_producao") {
    return `Confirma saida para producao de ${amount}?`;
  }

  if (intent === "porcionamento") {
    return `Confirma transformacao/porcionamento de ${amount}?`;
  }

  if (intent === "relatorio_diario") {
    return "Confirma envio do relatorio diario?";
  }

  if (intent === "sugestao_compra") {
    return "Confirma geracao de sugestao de compra?";
  }

  return "Preciso de mais contexto para confirmar este comando.";
}

async function recordOperationalCommand(payload = {}) {
  const message = normalizeLookupText(payload.mensagem ?? payload.message ?? payload.Body ?? "");
  const parsed = inferOperationalIntent(message);
  const confirmation = buildOperationalConfirmation(parsed.intent, parsed.entities);
  const tenant = resolveTenantContext(payload);
  const document = withTenantMetadata({
    mensagem: message,
    telefone: normalizePhone(payload.telefone ?? payload.from ?? payload.From ?? ""),
    usuarioId: normalizeLookupText(payload.usuarioId ?? ""),
    intencao: parsed.intent,
    confianca: parsed.confidence,
    entidades: parsed.entities,
    confirmacao: confirmation,
    statusConfirmacao: "pendente",
    origem: normalizeLookupText(payload.origem ?? "webhook"),
    responsavel: normalizeLookupText(payload.responsavel ?? ""),
    criadoEm: admin.firestore.FieldValue.serverTimestamp()
  }, tenant);

  const ref = await admin.firestore().collection("comandosWhatsApp").add(document);
  await recordAuditLog({
    tipo: "comando_whatsapp_interpretado",
    origem: document.origem,
    actor: document.responsavel || document.telefone,
    tenant: document,
    payload: {
      comandoId: ref.id,
      intencao: parsed.intent
    }
  });

  return {
    id: ref.id,
    ...document,
    criadoEm: undefined
  };
}

async function lookupOpenFoodFactsProduct(barcode) {
  const response = await fetch(
    `https://world.openfoodfacts.net/api/v2/product/${barcode}?fields=code,product_name,brands,categories,categories_tags`,
    {
      headers: {
        "User-Agent": "BurgerOps/1.0 (barcode lookup)"
      },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
    }
  );

  if (!response.ok) {
    throw new Error(`Open Food Facts respondeu com status ${response.status}.`);
  }

  const payload = await response.json();

  if (payload?.status !== 1 || !payload?.product) {
    return null;
  }

  const product = payload.product;
  const categoryText = normalizeLookupText(product.categories);
  const inferredCategory = inferCategoryFromText(categoryText);

  return {
    barcode,
    nome: normalizeLookupText(product.product_name),
    marca: normalizeLookupText(product.brands),
    categoria: inferredCategory || categoryText || "insumo",
    fonte: "open-food-facts"
  };
}

async function interpretOperationalCommand(req, res) {
  const message = normalizeLookupText(req.body?.mensagem ?? req.body?.message ?? "");

  if (!message) {
    return res.status(400).json({ erro: "Mensagem obrigatoria." });
  }

  try {
    const command = await recordOperationalCommand({
      mensagem: message,
      telefone: req.body?.telefone,
      usuarioId: req.user?.uid,
      empresaId: req.body?.empresaId,
      lojaId: req.body?.lojaId,
      origem: "api_autenticada",
      profile: req.profile,
      responsavel: req.profile?.email || req.user?.email || ""
    });
    return res.json({ ok: true, comando: command });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: "Nao foi possivel interpretar o comando." });
  }
}

async function whatsappWebhook(req, res) {
  const expectedToken = String(process.env.WHATSAPP_WEBHOOK_TOKEN ?? "").trim();
  const receivedToken = String(req.headers["x-webhook-token"] ?? req.query?.token ?? "").trim();

  if (expectedToken && receivedToken !== expectedToken) {
    return res.status(401).json({ erro: "Webhook nao autorizado." });
  }

  const message = normalizeLookupText(req.body?.mensagem ?? req.body?.message ?? req.body?.Body ?? "");

  if (!message) {
    return res.status(400).json({ erro: "Mensagem obrigatoria." });
  }

  try {
    const command = await recordOperationalCommand({
      ...req.body,
      mensagem: message,
      origem: normalizeLookupText(req.body?.origem ?? "whatsapp_webhook")
    });
    return res.json({
      ok: true,
      resposta: command.confirmacao,
      comandoId: command.id,
      intencao: command.intencao
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: "Nao foi possivel processar o webhook." });
  }
}

async function getSaasContext(req, res) {
  const tenant = resolveTenantContext(req.profile);

  return res.json({
    ok: true,
    tenant,
    profile: {
      email: req.profile?.email || req.user?.email || "",
      tipo: req.profile?.tipo || "",
      nome: req.profile?.nome || ""
    },
    collections: {
      empresas: "empresas",
      unidades: "unidades",
      auditoria: "auditoriaOperacional",
      comandosWhatsApp: "comandosWhatsApp"
    }
  });
}

async function lookupCosmosProduct(barcode) {
  const cosmosToken = String(
    process.env.COSMOS_API_TOKEN ??
    process.env.COSMOS_TOKEN ??
    process.env.COSMOS_API_KEY ??
    ""
  ).trim();
  const cosmosUserAgent = String(process.env.COSMOS_USER_AGENT ?? "BurgerOps/1.0 (barcode lookup)").trim();

  if (!cosmosToken) {
    return null;
  }

  const response = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${barcode}.json`, {
    headers: {
      "Content-Type": "application/json",
      "User-Agent": cosmosUserAgent,
      "X-Cosmos-Token": cosmosToken
    },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Cosmos respondeu com status ${response.status}.`);
  }

  const payload = await response.json();
  const gpcCategory = normalizeLookupText(payload?.gpc?.description);
  const inferredCategory = inferCategoryFromText(gpcCategory);

  return {
    barcode,
    nome: normalizeLookupText(payload?.description),
    marca: normalizeLookupText(payload?.brand?.name),
    categoria: inferredCategory || gpcCategory || "insumo",
    fonte: "cosmos"
  };
}

async function tryLookupBarcodeSource(sourceName, lookupFn, barcode) {
  try {
    return await lookupFn(barcode);
  } catch (error) {
    console.warn(`Falha ao consultar codigo de barras em ${sourceName}.`, error);
    return null;
  }
}

async function barcodeLookup(req, res) {
  const barcode = normalizeBarcode(req.params?.barcode);

  if (!barcode) {
    return res.status(400).json({ erro: "Informe um codigo de barras valido." });
  }

  try {
    const cosmosProduct = await tryLookupBarcodeSource("cosmos", lookupCosmosProduct, barcode);

    if (cosmosProduct?.nome) {
      return res.json({
        ok: true,
        found: true,
        source: cosmosProduct.fonte,
        product: cosmosProduct
      });
    }

    const openFoodFactsProduct = await tryLookupBarcodeSource("open-food-facts", lookupOpenFoodFactsProduct, barcode);

    if (openFoodFactsProduct?.nome) {
      return res.json({
        ok: true,
        found: true,
        source: openFoodFactsProduct.fonte,
        product: openFoodFactsProduct
      });
    }

    return res.json({
      ok: true,
      found: false,
      source: null,
      product: {
        barcode,
        nome: "",
        marca: "",
        categoria: ""
      }
    });
  } catch (error) {
    if (error?.name === "TimeoutError") {
      return res.status(504).json({
        erro: "A consulta do codigo de barras demorou mais do que o esperado. Tente novamente em instantes."
      });
    }

    return res.status(502).json({ erro: error.message || "Nao foi possivel consultar o codigo de barras." });
  }
}

async function hasRegisteredUsers() {
  const snapshot = await admin.firestore().collection("usuarios").limit(1).get();
  return !snapshot.empty;
}

async function saveUserProfile(userId, profile) {
  await admin.firestore().collection("usuarios").doc(userId).set({
    ...profile,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function requireAuthenticated(req, res, next) {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ erro: "Token de autenticacao nao enviado." });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const profileSnapshot = await admin.firestore().collection("usuarios").doc(decodedToken.uid).get();

    if (!profileSnapshot.exists) {
      return res.status(403).json({ erro: "Perfil do usuario nao encontrado." });
    }

    req.user = decodedToken;
    req.profile = profileSnapshot.data();
    return next();
  } catch (error) {
    return res.status(401).json({ erro: "Token invalido ou expirado." });
  }
}

async function requireAdmin(req, res, next) {
  return requireAuthenticated(req, res, async () => {
    if (!hasPermission(req.profile, "funcionarios.alterarPermissoes")) {
      return res.status(403).json({ erro: "Somente administradores podem executar esta acao." });
    }

    return next();
  });
}

async function listUsers(req, res) {
  try {
    const snapshot = await admin.firestore().collection("usuarios").get();
    const users = snapshot.docs
      .map((document) => ({
        id: document.id,
        ...document.data()
      }))
      .sort((left, right) => left.email.localeCompare(right.email, "pt-BR"));

    return res.json({ usuarios: users });
  } catch (error) {
    return res.status(500).json({ erro: "Nao foi possivel listar os funcionarios." });
  }
}

async function createUser(req, res) {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const senha = String(req.body?.senha ?? "");
  const perfilPrincipal = normalizeRole(req.body?.perfilPrincipal ?? req.body?.tipo, "funcionario");
  const tipo = perfilPrincipal;
  const nome = normalizeName(req.body?.nome);
  const telefone = normalizePhone(req.body?.telefone ?? "");
  const cargoInterno = normalizeLookupText(req.body?.cargoInterno ?? req.body?.cargo ?? "").slice(0, 80);
  const funcoesAdicionais = sanitizeAdditionalFunctions(req.body?.funcoesAdicionais);
  const permissoes = sanitizePermissionTree(req.body?.permissoes);
  const ativo = parseBooleanValue(req.body?.ativo, true);

  if (!email || !senha || !perfilPrincipal) {
    return res.status(400).json({ erro: "Email, senha e perfil principal sao obrigatorios." });
  }

  if (!validRoles.has(perfilPrincipal)) {
    return res.status(400).json({ erro: "Perfil principal invalido." });
  }

  if (senha.length < 6) {
    return res.status(400).json({ erro: "A senha deve ter pelo menos 6 caracteres." });
  }

  try {
    const user = await admin.auth().createUser({
      email,
      password: senha
    });

    await saveUserProfile(user.uid, {
      email,
      tipo,
      nome,
      telefone,
      cargoInterno,
      perfilPrincipal,
      funcoesAdicionais,
      permissoes,
      ativo,
      criadoPor: req.profile.email,
      empresaId: req.profile?.empresaId || process.env.DEFAULT_EMPRESA_ID || "default",
      lojaId: req.profile?.lojaId || process.env.DEFAULT_LOJA_ID || "matriz"
    });

    await recordAuditLog({
      tipo: "permissoes_funcionario_criadas",
      origem: "api",
      actor: req.profile?.email || req.user?.email || "admin",
      tenant: req.profile,
      payload: {
        funcionarioId: user.uid,
        funcionarioEmail: email
      },
      before: null,
      after: {
        perfilPrincipal,
        funcoesAdicionais,
        permissoes,
        ativo
      }
    });

    return res.status(201).json({
      ok: true,
      usuario: {
        id: user.uid,
        email,
        tipo,
        perfilPrincipal,
        funcoesAdicionais,
        permissoes,
        ativo
      }
    });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({ erro: "Ja existe um usuario com esse email." });
    }

    return res.status(400).json({ erro: error.message || "Nao foi possivel criar o usuario." });
  }
}

async function updateUser(req, res) {
  const userId = String(req.params?.userId ?? "").trim();

  if (!userId) {
    return res.status(400).json({ erro: "Funcionario nao informado." });
  }

  const profileRef = admin.firestore().collection("usuarios").doc(userId);
  const beforeSnapshot = await profileRef.get();

  if (!beforeSnapshot.exists) {
    return res.status(404).json({ erro: "Funcionario nao encontrado." });
  }

  const before = beforeSnapshot.data();
  const perfilPrincipal = normalizeRole(req.body?.perfilPrincipal ?? req.body?.tipo ?? before.perfilPrincipal ?? before.tipo, "funcionario");

  if (!validRoles.has(perfilPrincipal)) {
    return res.status(400).json({ erro: "Perfil principal invalido." });
  }

  const nextData = {
    nome: normalizeName(req.body?.nome ?? before.nome),
    email: String(req.body?.email ?? before.email ?? "").trim().toLowerCase(),
    telefone: normalizePhone(req.body?.telefone ?? before.telefone ?? ""),
    cargoInterno: normalizeLookupText(req.body?.cargoInterno ?? req.body?.cargo ?? before.cargoInterno ?? "").slice(0, 80),
    tipo: perfilPrincipal,
    perfilPrincipal,
    funcoesAdicionais: sanitizeAdditionalFunctions(req.body?.funcoesAdicionais ?? before.funcoesAdicionais),
    permissoes: sanitizePermissionTree(req.body?.permissoes ?? before.permissoes),
    ativo: parseBooleanValue(req.body?.ativo, before.ativo !== false),
    empresaId: normalizeLookupText(req.body?.empresaId ?? before.empresaId ?? req.profile?.empresaId ?? process.env.DEFAULT_EMPRESA_ID ?? "default"),
    lojaId: normalizeLookupText(req.body?.lojaId ?? before.lojaId ?? req.profile?.lojaId ?? process.env.DEFAULT_LOJA_ID ?? "matriz"),
    atualizadoPor: req.profile?.email || req.user?.email || "admin",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
  };

  await profileRef.set(nextData, { merge: true });

  await recordAuditLog({
    tipo: "permissoes_funcionario_alteradas",
    origem: "api",
    actor: req.profile?.email || req.user?.email || "admin",
    tenant: req.profile,
    payload: {
      funcionarioId: userId,
      funcionarioEmail: nextData.email
    },
    before: {
      perfilPrincipal: before.perfilPrincipal || before.tipo || "",
      funcoesAdicionais: before.funcoesAdicionais || [],
      permissoes: before.permissoes || {},
      ativo: before.ativo !== false
    },
    after: {
      perfilPrincipal: nextData.perfilPrincipal,
      funcoesAdicionais: nextData.funcoesAdicionais,
      permissoes: nextData.permissoes,
      ativo: nextData.ativo
    }
  });

  return res.json({
    ok: true,
    usuario: {
      id: userId,
      ...nextData,
      updatedAt: undefined,
      atualizadoEm: undefined
    }
  });
}

async function getBootstrapStatus(req, res) {
  try {
    const initialized = await hasRegisteredUsers();

    return res.json({
      ok: true,
      initialized,
      canCreateFirstAccount: !initialized
    });
  } catch (error) {
    return res.status(500).json({ erro: "Nao foi possivel verificar o status inicial do sistema." });
  }
}

async function bootstrapRegister(req, res) {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const senha = String(req.body?.senha ?? "");
  const nome = normalizeName(req.body?.nome);

  if (!email || !senha) {
    return res.status(400).json({ erro: "Email e senha sao obrigatorios." });
  }

  if (senha.length < 6) {
    return res.status(400).json({ erro: "A senha deve ter pelo menos 6 caracteres." });
  }

  try {
    if (await hasRegisteredUsers()) {
      return res.status(403).json({
        erro: "O sistema ja foi inicializado. Novas contas devem ser criadas por um administrador na area de Funcionarios."
      });
    }

    const user = await admin.auth().createUser({
      email,
      password: senha
    });

    await saveUserProfile(user.uid, {
      email,
      tipo: "admin",
      nome,
      bootstrap: true,
      criadoPor: "bootstrap"
    });

    return res.status(201).json({
      ok: true,
      usuario: {
        id: user.uid,
        email,
        tipo: "admin",
        nome
      }
    });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({
        erro: "Esse email ja existe no Firebase Auth. Use outro email ou ajuste esse usuario manualmente no console."
      });
    }

    return res.status(400).json({
      erro: error.message || "Nao foi possivel criar a conta inicial."
    });
  }
}

async function getAdminAlertsDashboard(req, res) {
  try {
    const dashboard = await stockAlertService.getDashboardData({
      actor: req.profile?.email || req.user?.email || "admin",
      force: String(req.query.force ?? "").trim().toLowerCase() === "true"
    });

    return res.json({
      ok: true,
      ...dashboard
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: "Nao foi possivel carregar o painel de alertas de reposicao." });
  }
}

async function evaluateAdminAlerts(req, res) {
  try {
    const result = await stockAlertService.evaluateAlerts({
      force: parseBooleanValue(req.body?.force, false),
      actor: req.profile?.email || req.user?.email || "usuario",
      trigger: normalizeLookupText(req.body?.reason || req.body?.trigger || "manual") || "manual"
    });

    return res.json({
      ok: true,
      data: result
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: "Nao foi possivel avaliar os alertas de reposicao." });
  }
}

async function recordManualAdminSuggestion(req, res) {
  try {
    const notification = await stockAlertService.recordManualAdminSuggestion({
      reason: normalizeLookupText(req.body?.reason || "Reposicao urgente"),
      recipient: req.body?.recipient,
      message: req.body?.message,
      groups: Array.isArray(req.body?.groups) ? req.body.groups : []
    }, req.profile?.email || req.user?.email || "usuario");

    return res.json({
      ok: true,
      notification
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: "Nao foi possivel registrar a sugestao ao admin." });
  }
}

async function updateAdminAlertConfig(req, res) {
  try {
    const nextConfig = sanitizeAlertConfigPayload(req.body);
    const updatedConfig = await stockAlertService.updateAlertConfig(nextConfig, req.profile?.email || req.user?.email || "admin");
    const hasAdminWhatsappField = Object.prototype.hasOwnProperty.call(req.body || {}, "adminWhatsapp");
    const adminWhatsapp = normalizePhone(req.body?.adminWhatsapp || "");

    if (hasAdminWhatsappField) {
      await admin.firestore().collection("configuracoes").doc("sistema").set({
        adminWhatsapp,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        atualizadoPor: req.profile?.email || req.user?.email || "admin"
      }, { merge: true });
    }

    return res.json({
      ok: true,
      config: updatedConfig,
      adminWhatsapp
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: "Nao foi possivel salvar a configuracao dos alertas de reposicao." });
  }
}

async function resolveAdminAlert(req, res) {
  const productId = String(req.params?.productId ?? "").trim();

  if (!productId) {
    return res.status(400).json({ erro: "Produto nao informado." });
  }

  try {
    await stockAlertService.markAlertResolved(productId, req.profile?.email || req.user?.email || "admin");

    return res.json({
      ok: true
    });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ erro: error.message || "Nao foi possivel resolver o alerta." });
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/bootstrap/status", getBootstrapStatus);
app.post("/api/bootstrap/register", bootstrapRegister);
app.get("/api/usuarios", requireAdmin, listUsers);
app.post("/api/usuarios", requireAdmin, createUser);
app.patch("/api/usuarios/:userId", requireAdmin, updateUser);
app.get("/api/barcodes/:barcode", requireAuthenticated, barcodeLookup);
app.get("/api/saas/context", requireAuthenticated, getSaasContext);
app.post("/api/operational/interpret", requireAuthenticated, interpretOperationalCommand);
app.post("/api/webhooks/whatsapp", whatsappWebhook);
app.get("/api/admin-alerts/dashboard", requireAdmin, getAdminAlertsDashboard);
app.post("/api/admin-alerts/evaluate", requireAuthenticated, evaluateAdminAlerts);
app.post("/api/admin-alerts/manual-suggestion", requireAuthenticated, recordManualAdminSuggestion);
app.post("/api/admin-alerts/config", requireAdmin, updateAdminAlertConfig);
app.post("/api/admin-alerts/:productId/resolve", requireAdmin, resolveAdminAlert);
app.post("/criar-usuario", requireAdmin, createUser);

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.use(express.static(publicDir, {
  extensions: ["html"],
  index: false
}));

export function startServer(options = {}) {
  const host = options.host || "0.0.0.0";
  const runtimePort = options.port || port;
  const shouldStartScheduler = options.startScheduler !== false;

  if (shouldStartScheduler) {
    stockAlertService.startScheduler();
  }

  return app.listen(runtimePort, host, () => {
    console.log(`Servidor rodando na porta ${runtimePort} com credenciais via ${firebaseCredentialSource.source}.`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}
