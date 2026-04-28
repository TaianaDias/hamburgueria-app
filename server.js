import cors from "cors";
import express from "express";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createStockAlertService } from "./server/stock-alerts.js";

const app = express();
const port = process.env.PORT || 3000;
const validRoles = new Set(["admin", "estoque", "caixa"]);
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

async function lookupCosmosProduct(barcode) {
  const cosmosToken = String(process.env.COSMOS_API_TOKEN ?? "").trim();
  const cosmosUserAgent = String(process.env.COSMOS_USER_AGENT ?? "").trim();

  if (!cosmosToken || !cosmosUserAgent) {
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

async function barcodeLookup(req, res) {
  const barcode = normalizeBarcode(req.params?.barcode);

  if (!barcode) {
    return res.status(400).json({ erro: "Informe um codigo de barras valido." });
  }

  try {
    const openFoodFactsProduct = await lookupOpenFoodFactsProduct(barcode);

    if (openFoodFactsProduct?.nome) {
      return res.json({
        ok: true,
        found: true,
        source: openFoodFactsProduct.fonte,
        product: openFoodFactsProduct
      });
    }

    const cosmosProduct = await lookupCosmosProduct(barcode);

    if (cosmosProduct?.nome) {
      return res.json({
        ok: true,
        found: true,
        source: cosmosProduct.fonte,
        product: cosmosProduct
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
    criadoEm: admin.firestore.FieldValue.serverTimestamp()
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
    if (req.profile.tipo !== "admin") {
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
  const tipo = String(req.body?.tipo ?? "").trim().toLowerCase();
  const nome = normalizeName(req.body?.nome);

  if (!email || !senha || !tipo) {
    return res.status(400).json({ erro: "Email, senha e tipo sao obrigatorios." });
  }

  if (!validRoles.has(tipo)) {
    return res.status(400).json({ erro: "Tipo de funcionario invalido." });
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
      criadoPor: req.profile.email
    });

    return res.status(201).json({
      ok: true,
      usuario: {
        id: user.uid,
        email,
        tipo
      }
    });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      return res.status(400).json({ erro: "Ja existe um usuario com esse email." });
    }

    return res.status(400).json({ erro: error.message || "Nao foi possivel criar o usuario." });
  }
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
app.get("/api/barcodes/:barcode", requireAuthenticated, barcodeLookup);
app.get("/api/admin-alerts/dashboard", requireAdmin, getAdminAlertsDashboard);
app.post("/api/admin-alerts/evaluate", requireAuthenticated, evaluateAdminAlerts);
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
