import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function resolveApiBaseUrl() {
  if (window.location.protocol === "file:") {
    return "http://localhost:3000";
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }

  return window.location.origin;
}

export const API_BASE_URL = resolveApiBaseUrl();
let cachedApiBaseUrl = API_BASE_URL;
let runtimeConfigPromise;

function addApiCandidate(candidates, value) {
  if (!value) {
    return;
  }

  try {
    const normalized = new URL(value).origin;

    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  } catch (error) {
    console.warn("Base de API ignorada.", value, error);
  }
}

function buildApiBaseCandidates() {
  const candidates = [];
  const isFile = window.location.protocol === "file:";
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname;

  addApiCandidate(candidates, cachedApiBaseUrl);

  if (!isFile) {
    addApiCandidate(candidates, window.location.origin);
  }

  if (hostname) {
    addApiCandidate(candidates, `${protocol}//${hostname}:3000`);
  }

  addApiCandidate(candidates, "http://localhost:3000");
  addApiCandidate(candidates, "http://127.0.0.1:3000");
  addApiCandidate(candidates, "http://10.0.2.2:3000");

  return candidates;
}

async function loadRuntimeConfig() {
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = (async () => {
      try {
        const response = await fetch("./runtime-config.json", { cache: "no-store" });

        if (!response.ok) {
          return {};
        }

        return await response.json();
      } catch (error) {
        console.warn("Nao foi possivel carregar runtime-config.json.", error);
        return {};
      }
    })();
  }

  return runtimeConfigPromise;
}

async function buildRuntimeApiBaseCandidates() {
  const candidates = buildApiBaseCandidates();
  const runtimeConfig = await loadRuntimeConfig();

  addApiCandidate(candidates, runtimeConfig.apiBaseUrl);

  if (Array.isArray(runtimeConfig.apiBaseUrlFallbacks)) {
    runtimeConfig.apiBaseUrlFallbacks.forEach((value) => addApiCandidate(candidates, value));
  }

  return candidates;
}

function isProbablyWrongOrigin(path, response, contentType) {
  if (!path.startsWith("/api/")) {
    return false;
  }

  if (response.status === 404) {
    return true;
  }

  return !contentType.includes("application/json");
}

function waitForAuthUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    }, () => resolve(null));
  });
}

let userContextPromise;

async function loadUserContext() {
  const user = await waitForAuthUser();

  if (!user) {
    return null;
  }

  const profileSnapshot = await getDoc(doc(db, "usuarios", user.uid));

  return {
    user,
    profile: profileSnapshot.exists() ? { id: profileSnapshot.id, ...profileSnapshot.data() } : null
  };
}

export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calculateUnitCost(custoCompra, quantidadePorEmbalagem) {
  const packageQuantity = Math.max(1, toNumber(quantidadePorEmbalagem, 1));
  const purchaseCost = Math.max(0, toNumber(custoCompra, 0));
  return purchaseCost / packageQuantity;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeDocumentNumber(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return digits.startsWith("55") ? digits : `55${digits}`;
}

function findSupplierInCatalog(candidate = {}, supplierCatalog = []) {
  const supplierId = String(candidate?.fornecedorId ?? candidate?.id ?? "").trim();

  if (supplierId) {
    const byId = supplierCatalog.find((supplier) => supplier.id === supplierId);

    if (byId) {
      return byId;
    }
  }

  const cnpj = normalizeDocumentNumber(candidate?.cnpj ?? candidate?.cnpjFornecedor ?? "");

  if (cnpj) {
    const byDocument = supplierCatalog.find((supplier) => normalizeDocumentNumber(supplier.cnpj) === cnpj);

    if (byDocument) {
      return byDocument;
    }
  }

  const name = normalizeText(candidate?.nome ?? candidate?.fornecedorNome ?? candidate?.fornecedor ?? "");

  if (!name) {
    return null;
  }

  return supplierCatalog.find((supplier) => normalizeText(supplier.nome) === name) || null;
}

function normalizeProductSupplierEntry(entry = {}, product = {}, supplierCatalog = []) {
  const catalogSupplier = findSupplierInCatalog(entry, supplierCatalog);
  const packageQuantity = Math.max(1, toNumber(
    entry?.conversao ?? entry?.quantidadePorCompra ?? product?.conversao ?? product?.quantidadePorCompra ?? 1,
    1
  ));
  const purchaseCostFromUnit = entry?.custoUnitario != null
    ? toNumber(entry.custoUnitario, 0) * packageQuantity
    : null;
  const fallbackPurchaseCost = product?.custoCompra != null
    ? toNumber(product.custoCompra, 0)
    : toNumber(product?.custoUnitario ?? product?.custo ?? 0, 0) * packageQuantity;
  const purchaseCost = Math.max(0, toNumber(
    entry?.custoCompra ?? purchaseCostFromUnit ?? fallbackPurchaseCost,
    fallbackPurchaseCost
  ));
  const unitCost = entry?.custoUnitario != null
    ? Math.max(0, toNumber(entry.custoUnitario, 0))
    : calculateUnitCost(purchaseCost, packageQuantity);
  const supplierName = String(
    entry?.nome ??
    entry?.fornecedorNome ??
    entry?.fornecedor ??
    catalogSupplier?.nome ??
    ""
  ).trim();
  const supplierPhone = String(
    entry?.telefone ??
    entry?.telefoneFornecedor ??
    catalogSupplier?.telefone ??
    ""
  ).trim();

  return {
    fornecedorId: String(entry?.fornecedorId ?? entry?.id ?? catalogSupplier?.id ?? "").trim(),
    nome: supplierName,
    cnpj: normalizeDocumentNumber(entry?.cnpj ?? entry?.cnpjFornecedor ?? catalogSupplier?.cnpj ?? ""),
    telefone: supplierPhone,
    telefoneNormalizado: normalizePhone(entry?.telefoneNormalizado ?? supplierPhone),
    conversao: packageQuantity,
    custoCompra: purchaseCost,
    custoUnitario: unitCost,
    unidadeUso: String(
      entry?.unidadeUso ??
      entry?.unidadeCompra ??
      product?.unidadeUso ??
      product?.unidadeCompra ??
      "un"
    ).trim() || "un",
    principal: Boolean(entry?.principal)
  };
}

export function normalizeProductSuppliers(product = {}, supplierCatalog = []) {
  const hasModernSuppliers = Array.isArray(product?.fornecedores);
  const hasLegacySupplier = Boolean(
    product?.fornecedorId ||
    product?.fornecedorNome ||
    product?.fornecedor ||
    product?.cnpjFornecedor
  );
  const rawSuppliers = hasModernSuppliers
    ? product.fornecedores
    : hasLegacySupplier
      ? [{
        fornecedorId: product.fornecedorId || "",
        nome: product.fornecedorNome || product.fornecedor || "",
        cnpj: product.cnpjFornecedor || "",
        conversao: product.conversao,
        custoCompra: product.custoCompra,
        custoUnitario: product.custoUnitario ?? product.custo,
        unidadeUso: product.unidadeUso ?? product.unidadeCompra ?? "un",
        principal: true
      }]
      : [];
  const seen = new Set();
  const normalized = rawSuppliers
    .map((entry) => normalizeProductSupplierEntry(entry, product, supplierCatalog))
    .filter((entry) => {
      const key = entry.fornecedorId || entry.cnpj || normalizeText(entry.nome);

      if (!key) {
        return false;
      }

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  const principalIndex = normalized.findIndex((entry) => entry.principal);

  if (principalIndex >= 0) {
    return normalized.map((entry, index) => ({
      ...entry,
      principal: index === principalIndex
    }));
  }

  if (!normalized.length) {
    return [];
  }

  return normalized.map((entry, index) => ({
    ...entry,
    principal: index === 0
  }));
}

export function getPrimaryProductSupplier(item, supplierCatalog = []) {
  const suppliers = normalizeProductSuppliers(item, supplierCatalog);
  return suppliers.find((entry) => entry.principal) || suppliers[0] || null;
}

export function getCheapestProductSupplier(item, supplierCatalog = []) {
  const suppliers = normalizeProductSuppliers(item, supplierCatalog);

  if (!suppliers.length) {
    return null;
  }

  return [...suppliers].sort((left, right) => {
    const unitCostDifference = toNumber(left.custoUnitario, Number.POSITIVE_INFINITY)
      - toNumber(right.custoUnitario, Number.POSITIVE_INFINITY);

    if (unitCostDifference !== 0) {
      return unitCostDifference;
    }

    const purchaseCostDifference = toNumber(left.custoCompra, Number.POSITIVE_INFINITY)
      - toNumber(right.custoCompra, Number.POSITIVE_INFINITY);

    if (purchaseCostDifference !== 0) {
      return purchaseCostDifference;
    }

    return left.nome.localeCompare(right.nome, "pt-BR");
  })[0];
}

export function summarizeProductSuppliers(item, supplierCatalog = []) {
  const suppliers = normalizeProductSuppliers(item, supplierCatalog);
  return {
    suppliers,
    primarySupplier: suppliers.find((entry) => entry.principal) || suppliers[0] || null,
    cheapestSupplier: getCheapestProductSupplier(item, supplierCatalog)
  };
}

export function getPackageQuantity(item) {
  const primarySupplier = getPrimaryProductSupplier(item);

  if (primarySupplier) {
    return Math.max(1, toNumber(primarySupplier.conversao, 1));
  }

  return Math.max(1, toNumber(item?.conversao ?? item?.quantidadePorCompra ?? 1, 1));
}

export function getPurchaseCost(item) {
  const primarySupplier = getPrimaryProductSupplier(item);

  if (primarySupplier) {
    return Math.max(0, toNumber(primarySupplier.custoCompra, 0));
  }

  if (item?.custoCompra != null) {
    return Math.max(0, toNumber(item.custoCompra, 0));
  }

  return Math.max(0, getUnitCost(item) * getPackageQuantity(item));
}

export function getUnitCost(item) {
  const primarySupplier = getPrimaryProductSupplier(item);

  if (primarySupplier) {
    return Math.max(0, toNumber(primarySupplier.custoUnitario, 0));
  }

  if (item?.custoCompra != null) {
    return calculateUnitCost(item.custoCompra, getPackageQuantity(item));
  }

  return toNumber(item?.custoUnitario ?? item?.custo ?? 0, 0);
}

export function getUsageUnit(item) {
  const primarySupplier = getPrimaryProductSupplier(item);

  if (primarySupplier) {
    return String(primarySupplier.unidadeUso || "un").trim() || "un";
  }

  return String(item?.unidadeUso ?? item?.unidadeCompra ?? "un").trim() || "un";
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(toNumber(value, 0));
}

export function formatPercent(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(toNumber(value, 0));
}

export function formatDocumentNumber(value) {
  const digits = normalizeDocumentNumber(value);

  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }

  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }

  return digits;
}

export function describeProfile(profile) {
  if (!profile) {
    return "";
  }

  const identity = profile.nome ? `${profile.nome} | ${profile.email}` : profile.email;
  return `${identity} | ${profile.tipo}`;
}

export async function getUserContext(options = {}) {
  if (!userContextPromise || options.forceReload) {
    userContextPromise = loadUserContext();
  }

  return userContextPromise;
}

export async function requireAuth(options = {}) {
  const { adminOnly = false } = options;
  const context = await getUserContext();

  if (!context?.user) {
    window.location.href = "login.html";
    throw new Error("Usuario nao autenticado.");
  }

  if (!context.profile) {
    await signOut(auth);
    window.alert("Usuario nao autorizado.");
    window.location.href = "login.html";
    throw new Error("Usuario sem perfil.");
  }

  if (adminOnly && context.profile.tipo !== "admin") {
    window.alert("Acesso restrito.");
    window.location.href = "index.html";
    throw new Error("Permissao insuficiente.");
  }

  return context;
}

export async function logout() {
  await signOut(auth);
  window.location.href = "login.html";
}

export function bindLogoutButton(buttonId = "logout-button") {
  const button = document.getElementById(buttonId);

  if (!button) {
    return;
  }

  button.addEventListener("click", async () => {
    try {
      await logout();
    } catch (error) {
      console.error(error);
      window.alert("Nao foi possivel encerrar a sessao.");
    }
  });
}

export function setStatus(targetId, message, type = "info") {
  const target = document.getElementById(targetId);

  if (!target) {
    return;
  }

  target.textContent = message ?? "";
  target.className = `status ${type}`;
  target.hidden = !message;
}

export function registerServiceWorker() {
  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Falha ao registrar service worker.", error);
    });
  }
}

export async function getAuthToken() {
  const user = auth.currentUser ?? (await waitForAuthUser());

  if (!user) {
    throw new Error("Sessao expirada.");
  }

  return user.getIdToken();
}

async function performApiRequest(path, options = {}, settings = {}) {
  const { requireAuth = false } = settings;
  const candidates = await buildRuntimeApiBaseCandidates();
  let lastError = null;
  let authToken = "";

  if (requireAuth) {
    authToken = await getAuthToken();
  }

  for (const baseUrl of candidates) {
    const headers = new Headers(options.headers || {});

    if (requireAuth) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }

    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    try {
      const response = await fetch(new URL(path, baseUrl), {
        ...options,
        headers
      });

      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : null;

      if (isProbablyWrongOrigin(path, response, contentType)) {
        lastError = new Error(`Base ${baseUrl} nao expoe a API esperada.`);
        continue;
      }

      if (!response.ok) {
        const error = new Error(payload?.erro || "Nao foi possivel completar a requisicao.");
        error.status = response.status;
        throw error;
      }

      cachedApiBaseUrl = baseUrl;
      return payload;
    } catch (error) {
      if (error?.status) {
        throw error;
      }

      lastError = error;
    }
  }

  throw new Error(
    "Nao foi possivel conectar ao backend. Verifique se o servidor desta instalacao esta online ou, em ambiente local, rode npm start."
  );
}

export async function apiFetchPublic(path, options = {}) {
  return performApiRequest(path, options, { requireAuth: false });
}

export async function apiFetch(path, options = {}) {
  return performApiRequest(path, options, { requireAuth: true });
}

export async function getRuntimeConfig() {
  return loadRuntimeConfig();
}

export function parseRecipeIngredients(recipe) {
  if (Array.isArray(recipe?.ingredientes)) {
    return recipe.ingredientes.map((item) => ({
      nome: item.nome,
      qtd: toNumber(item.qtd, 0)
    }));
  }

  if (typeof recipe?.itens !== "string") {
    return [];
  }

  return recipe.itens
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [nome, qtd] = line.split(":");
      return {
        nome: nome?.trim() || "",
        qtd: toNumber(qtd, 0)
      };
    })
    .filter((item) => item.nome);
}
