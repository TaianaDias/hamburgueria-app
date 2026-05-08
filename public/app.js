import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
        console.warn("Não foi possível carregar runtime-config.json.", error);
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

function normalizeDateValue(value) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateKey(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const day = String(referenceDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const ORDER_WEEKDAYS = Object.freeze([
  { key: "seg", label: "Seg", fullLabel: "Segunda", jsDay: 1 },
  { key: "ter", label: "Ter", fullLabel: "Terca", jsDay: 2 },
  { key: "qua", label: "Qua", fullLabel: "Quarta", jsDay: 3 },
  { key: "qui", label: "Qui", fullLabel: "Quinta", jsDay: 4 },
  { key: "sex", label: "Sex", fullLabel: "Sexta", jsDay: 5 },
  { key: "sab", label: "Sab", fullLabel: "Sabado", jsDay: 6 },
  { key: "dom", label: "Dom", fullLabel: "Domingo", jsDay: 0 }
]);

const ORDER_WEEKDAY_KEYS = new Map(ORDER_WEEKDAYS.map((entry) => [entry.key, entry]));

export function normalizeWeekdayList(values = []) {
  const rawValues = Array.isArray(values)
    ? values
    : String(values ?? "")
      .split(/[,\s;|/]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  const selected = new Set();

  rawValues.forEach((value) => {
    const normalizedValue = normalizeText(value).slice(0, 3);

    for (const weekday of ORDER_WEEKDAYS) {
      if (normalizeText(weekday.key) === normalizedValue || normalizeText(weekday.fullLabel).startsWith(normalizedValue)) {
        selected.add(weekday.key);
      }
    }
  });

  return ORDER_WEEKDAYS
    .map((weekday) => weekday.key)
    .filter((key) => selected.has(key));
}

export function formatWeekdayList(values = [], format = "short") {
  const selectedDays = normalizeWeekdayList(values);

  if (!selectedDays.length) {
    return "Não definido";
  }

  return selectedDays
    .map((key) => {
      const weekday = ORDER_WEEKDAY_KEYS.get(key);
      return format === "long" ? weekday?.fullLabel || key : weekday?.label || key;
    })
    .join(", ");
}

export function getCurrentWeekdayKey(referenceDate = new Date()) {
  const weekday = ORDER_WEEKDAYS.find((entry) => entry.jsDay === referenceDate.getDay());
  return weekday?.key || "";
}

export function isSupplierOrderFrequencyEnabled(entry = {}) {
  return Boolean(entry?.frequenciaAtiva) && normalizeWeekdayList(entry?.diasPedido).length > 0;
}

export function isSupplierOrderDueToday(entry = {}, referenceDate = new Date()) {
  if (!isSupplierOrderFrequencyEnabled(entry)) {
    return false;
  }

  const currentWeekday = getCurrentWeekdayKey(referenceDate);
  return normalizeWeekdayList(entry?.diasPedido).includes(currentWeekday);
}

export function isSupplierPromotionActive(entry = {}, referenceDate = new Date()) {
  if (!entry?.promocaoAtiva) {
    return false;
  }

  const hasPromotionalPrice = entry?.custoPromocionalCompra != null || entry?.custoPromocionalUnitario != null;

  if (!hasPromotionalPrice) {
    return false;
  }

  const today = getTodayDateKey(referenceDate);
  const startDate = normalizeDateValue(entry?.promocaoInicio);
  const endDate = normalizeDateValue(entry?.promocaoFim);

  if (startDate && today < startDate) {
    return false;
  }

  if (endDate && today > endDate) {
    return false;
  }

  return true;
}

export function getEffectiveSupplierPurchaseCost(entry = {}) {
  return Math.max(0, toNumber(entry?.custoCompraEfetivo ?? entry?.custoCompra ?? 0, 0));
}

export function getEffectiveSupplierUnitCost(entry = {}) {
  return Math.max(0, toNumber(entry?.custoUnitarioEfetivo ?? entry?.custoUnitario ?? 0, 0));
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
  const promotionalPurchaseCostFromUnit = entry?.custoPromocionalUnitario != null
    ? toNumber(entry.custoPromocionalUnitario, 0) * packageQuantity
    : null;
  const promotionalPurchaseCost = entry?.custoPromocionalCompra != null || promotionalPurchaseCostFromUnit != null
    ? Math.max(0, toNumber(
      entry?.custoPromocionalCompra ?? promotionalPurchaseCostFromUnit,
      promotionalPurchaseCostFromUnit ?? 0
    ))
    : null;
  const promotionalUnitCost = promotionalPurchaseCost != null
    ? calculateUnitCost(promotionalPurchaseCost, packageQuantity)
    : null;
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
  const promotionEnabled = Boolean(entry?.promocaoAtiva);
  const promotionStart = normalizeDateValue(entry?.promocaoInicio);
  const promotionEnd = normalizeDateValue(entry?.promocaoFim);
  const promotionApplies = isSupplierPromotionActive({
    promocaoAtiva: promotionEnabled,
    promocaoInicio: promotionStart,
    promocaoFim: promotionEnd,
    custoPromocionalCompra: promotionalPurchaseCost,
    custoPromocionalUnitario: promotionalUnitCost
  });
  const effectivePurchaseCost = promotionApplies && promotionalPurchaseCost != null
    ? promotionalPurchaseCost
    : purchaseCost;
  const effectiveUnitCost = promotionApplies && promotionalUnitCost != null
    ? promotionalUnitCost
    : unitCost;

  return {
    fornecedorId: String(entry?.fornecedorId ?? entry?.id ?? catalogSupplier?.id ?? "").trim(),
    nome: supplierName,
    cnpj: normalizeDocumentNumber(entry?.cnpj ?? entry?.cnpjFornecedor ?? catalogSupplier?.cnpj ?? ""),
    telefone: supplierPhone,
    telefoneNormalizado: normalizePhone(entry?.telefoneNormalizado ?? supplierPhone),
    conversao: packageQuantity,
    custoCompra: purchaseCost,
    custoUnitario: unitCost,
    custoPromocionalCompra: promotionalPurchaseCost,
    custoPromocionalUnitario: promotionalUnitCost,
    promocaoAtiva: promotionEnabled,
    promocaoInicio: promotionStart,
    promocaoFim: promotionEnd,
    promocaoAplicada: promotionApplies,
    custoCompraEfetivo: effectivePurchaseCost,
    custoUnitarioEfetivo: effectiveUnitCost,
    frequenciaAtiva: Boolean(entry?.frequenciaAtiva),
    diasPedido: normalizeWeekdayList(entry?.diasPedido),
    diasEntrega: normalizeWeekdayList(entry?.diasEntrega),
    quantidadePedidoPadrao: Math.max(0, toNumber(entry?.quantidadePedidoPadrao, 0)),
    unidadeUso: String(
      entry?.unidadeUso ??
      entry?.unidadeCompra ??
      product?.unidadeMedida ??
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
        unidadeUso: product.unidadeMedida ?? product.unidadeUso ?? product.unidadeCompra ?? "un",
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
    const unitCostDifference = getEffectiveSupplierUnitCost(left) - getEffectiveSupplierUnitCost(right);

    if (unitCostDifference !== 0) {
      return unitCostDifference;
    }

    const purchaseCostDifference = getEffectiveSupplierPurchaseCost(left) - getEffectiveSupplierPurchaseCost(right);

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
    return getEffectiveSupplierPurchaseCost(primarySupplier);
  }

  if (item?.custoCompra != null) {
    return Math.max(0, toNumber(item.custoCompra, 0));
  }

  return Math.max(0, getUnitCost(item) * getPackageQuantity(item));
}

export function getUnitCost(item) {
  const primarySupplier = getPrimaryProductSupplier(item);

  if (primarySupplier) {
    return getEffectiveSupplierUnitCost(primarySupplier);
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

  return String(item?.unidadeMedida ?? item?.unidadeUso ?? item?.unidadeCompra ?? "un").trim() || "un";
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
  return `${identity} | ${formatProfileRole(profile.perfilPrincipal || profile.tipo)}`;
}

const ROLE_PERMISSION_DEFAULTS = Object.freeze({
  admin: ["*"],
  gerente: [
    "estoque.ver", "estoque.entrada", "estoque.saida", "estoque.historico",
    "compras.verLista", "compras.sugerir", "compras.registrarCompra", "compras.verPrecos", "compras.aprovar",
    "producao.ver", "producao.criar", "producao.finalizar", "producao.baixarInsumos", "producao.verValidade",
    "etiquetas.gerar", "etiquetas.reimprimir",
    "relatorios.operacionais", "relatorios.financeiros",
    "fornecedores.ver", "fornecedores.editar",
    "treinamento.ver"
  ],
  compras: ["compras.verLista", "compras.sugerir", "compras.registrarCompra", "compras.verPrecos", "fornecedores.ver", "estoque.ver"],
  producao: ["producao.ver", "producao.criar", "producao.finalizar", "producao.baixarInsumos", "producao.verValidade", "etiquetas.gerar", "estoque.ver"],
  estoque: [
    "estoque.ver", "estoque.cadastrarInsumo", "estoque.editarInsumo", "estoque.entrada", "estoque.saida", "estoque.historico",
    "compras.verLista", "compras.sugerir",
    "producao.ver", "producao.criar"
  ],
  funcionario: ["estoque.ver", "estoque.entrada", "estoque.saida", "producao.ver", "etiquetas.gerar", "treinamento.ver"],
  visualizacao: ["estoque.ver", "compras.verLista", "producao.ver", "relatorios.operacionais", "treinamento.ver"],
  caixa: ["estoque.ver", "estoque.saida", "treinamento.ver"]
});

const FUNCTION_PERMISSION_DEFAULTS = Object.freeze({
  estoque: ROLE_PERMISSION_DEFAULTS.estoque,
  compras: ROLE_PERMISSION_DEFAULTS.compras,
  producao: ROLE_PERMISSION_DEFAULTS.producao,
  etiquetas: ["etiquetas.gerar", "etiquetas.reimprimir"],
  cmv: ["cmv.verFicha", "cmv.criarFicha", "cmv.editarFicha", "cmv.ver"],
  relatorios: ["relatorios.operacionais", "relatorios.financeiros", "relatorios.exportar"],
  treinamento: ["treinamento.ver", "treinamento.concluir"],
  fornecedores: ["fornecedores.ver", "fornecedores.cadastrar", "fornecedores.editar"],
  funcionarios: ["funcionarios.ver", "funcionarios.cadastrar", "funcionarios.editar"],
  configuracoes: ["configuracoes.ver", "configuracoes.editar", "configuracoes.gerenciarPlano"]
});

const ROLE_LABELS = Object.freeze({
  admin: "Admin",
  gerente: "Gerente",
  compras: "Compras",
  producao: "Produção",
  estoque: "Estoque",
  funcionario: "Funcionário",
  visualizacao: "Visualização",
  caixa: "Caixa"
});

export const PERMISSION_DENIED_MESSAGE = "Seu perfil não possui permissão para esta ação. Solicite liberação ao administrador.";

function normalizePermissionRole(value) {
  const normalized = normalizeText(value).replace(/\s+/g, "_") || "funcionario";
  const aliases = {
    administrador: "admin",
    dono: "admin",
    proprietario: "admin",
    proprietaria: "admin",
    visualização: "visualizacao",
    visualizacao: "visualizacao",
    funcionário: "funcionario",
    funcionario: "funcionario",
    ficha_tecnica: "cmv",
    ficha_tecnica_cmv: "cmv",
    ficha_técnica_cmv: "cmv"
  };

  return aliases[normalized] || normalized;
}

function getManualPermission(profile = {}, permission = "") {
  const parts = String(permission).split(".").filter(Boolean);
  const [moduleKey, ...actionParts] = parts;
  const actionKey = actionParts.join(".");

  if (!moduleKey || !actionKey) {
    return null;
  }

  const modulePermissions = profile.permissoes?.[moduleKey];

  if (!modulePermissions || typeof modulePermissions !== "object") {
    return null;
  }

  const directValue = modulePermissions[actionKey];

  if (typeof directValue === "boolean") {
    return directValue;
  }

  let nestedValue = modulePermissions;

  for (const key of actionParts) {
    if (!nestedValue || typeof nestedValue !== "object" || !(key in nestedValue)) {
      return null;
    }

    nestedValue = nestedValue[key];
  }

  return typeof nestedValue === "boolean" ? nestedValue : null;
}

function permissionListHas(permissionList = [], permission = "") {
  return permissionList.includes("*") || permissionList.includes(permission);
}

export function formatProfileRole(value) {
  const role = normalizePermissionRole(value);
  return ROLE_LABELS[role] || String(value || "Funcionário");
}

export function can(permission, profile = globalThis.window?.__burgerOpsProfile || null) {
  if (!profile || !permission) {
    return false;
  }

  const principalRole = normalizePermissionRole(profile.perfilPrincipal || profile.tipo);
  const principalPermissions = ROLE_PERMISSION_DEFAULTS[principalRole] || [];

  if (principalPermissions.includes("*")) {
    return true;
  }

  const manualValue = getManualPermission(profile, permission);

  if (manualValue === false) {
    return false;
  }

  if (manualValue === true) {
    return true;
  }

  if (permissionListHas(principalPermissions, permission)) {
    return true;
  }

  const additionalFunctions = Array.isArray(profile.funcoesAdicionais) ? profile.funcoesAdicionais : [];

  return additionalFunctions.some((functionKey) => {
    const normalizedKey = normalizePermissionRole(functionKey);
    return permissionListHas(FUNCTION_PERMISSION_DEFAULTS[normalizedKey] || [], permission);
  });
}

export function ensurePermission(permission, profile = globalThis.window?.__burgerOpsProfile || null) {
  if (can(permission, profile)) {
    return true;
  }

  window.alert(PERMISSION_DENIED_MESSAGE);
  return false;
}

export async function getUserContext(options = {}) {
  if (!userContextPromise || options.forceReload) {
    userContextPromise = loadUserContext();
  }

  return userContextPromise;
}

export async function requireAuth(options = {}) {
  const { adminOnly = false, permission = "" } = options;
  const context = await getUserContext();

  if (!context?.user) {
    window.location.href = "login.html";
    throw new Error("Usuário não autenticado.");
  }

  if (!context.profile) {
    await signOut(auth);
    window.alert("Usuário não autorizado.");
    window.location.href = "login.html";
    throw new Error("Usuário sem perfil.");
  }

  window.__burgerOpsProfile = context.profile;

  const hasAdminAccess = can("funcionarios.alterarPermissoes", context.profile);

  if ((adminOnly && !hasAdminAccess) || (permission && !can(permission, context.profile))) {
    window.alert(PERMISSION_DENIED_MESSAGE);
    window.location.href = "index.html";
    throw new Error("Permissão insuficiente.");
  }

  return context;
}

export async function logout() {
  await signOut(auth);
  window.location.href = "login.html";
}

export function bindLogoutButton(buttonId = "logout-button") {
  const targets = [document.getElementById(buttonId)].filter(Boolean);

  const runLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error(error);
      window.alert("Não foi possível encerrar a sessão.");
    }
  };

  targets.forEach((button) => {
    if (button.dataset.logoutBound === "true") {
      return;
    }

    button.dataset.logoutBound = "true";
    button.addEventListener("click", runLogout);
  });

  if (document.documentElement.dataset.logoutDelegated === "true") {
    return;
  }

  document.documentElement.dataset.logoutDelegated = "true";
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("[data-logout-button]");

    if (!button) {
      return;
    }

    event.preventDefault();
    runLogout();
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

const AUTOMATION_CONFIG_REF = doc(db, "configuracoes", "whatsappAutomation");
const AUTOMATION_LOG_COLLECTION = "automacaoLogs";

function formatAutomationDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Intl.DateTimeFormat("pt-BR").format(safeDate);
}

function formatAutomationQuantity(value) {
  return toNumber(value, 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 3
  });
}

function getAutomationAlertKey(type = "") {
  const map = {
    entrada: "stockIn",
    saida: "stockOut",
    stockIn: "stockIn",
    stockOut: "stockOut",
    lowStock: "lowStock",
    minStock: "lowStock",
    productionExit: "productionExit",
    productionPending: "productionExit",
    stockAdjustment: "stockAdjustment",
    manualAdjustment: "stockAdjustment",
    quantityCorrection: "quantityCorrection",
    productZeroed: "productZeroed",
    expiring: "expiring",
    expired: "expired",
    purchaseSuggestion: "purchaseSuggestion"
  };

  return map[type] || type;
}

function getAutomationLogStatusLabel(status = "") {
  const labels = {
    simulado: "Simulado",
    pendente_api: "Pendente API",
    pendente: "Pendente",
    enviado: "Enviado",
    falhou: "Falhou",
    enviado_futuro: "Enviado futuramente",
    erro_futuro: "Erro futuramente"
  };

  return labels[status] || status || "Pendente API";
}

export async function loadAutomationConfig() {
  const defaultConfig = {
    enabled: false,
    provider: "",
    webhookUrl: "",
    adminPhone: "",
    secondaryPhone: "",
    sendMode: "immediate",
    alertTypes: {
      stockIn: true,
      stockOut: true,
      productionExit: true,
      stockAdjustment: true,
      quantityCorrection: true,
      productZeroed: true,
      lowStock: true,
      expiring: true,
      expired: true,
      purchaseSuggestion: true,
      productionPending: true,
      labelPrinted: true
    }
  };

  try {
    const snapshot = await getDoc(AUTOMATION_CONFIG_REF);

    if (!snapshot.exists()) {
      return defaultConfig;
    }

    const data = snapshot.data() || {};
    return {
      ...defaultConfig,
      ...data,
      alertTypes: {
        ...defaultConfig.alertTypes,
        ...(data.alertTypes || {})
      }
    };
  } catch (error) {
    console.warn("Não foi possível carregar configuração da automação WhatsApp.", error);
    return defaultConfig;
  }
}

export function buildStockWhatsAppMessage(event = {}) {
  const dateLabel = formatAutomationDate(event.date || new Date());

  if (event.type === "stockIn") {
    return [
      "📦 Entrada de Estoque",
      "",
      `Produto: ${event.productName || "-"}`,
      `Quantidade adicionada: ${formatAutomationQuantity(event.quantity)} ${event.unit || "unidade"}(s)`,
      `Estoque anterior: ${formatAutomationQuantity(event.previousStock)}`,
      `Estoque atual: ${formatAutomationQuantity(event.currentStock)}`,
      `Fornecedor: ${event.supplier || "-"}`,
      `Responsável: ${event.responsibleUser || "-"}`,
      `Data: ${dateLabel}`
    ].join("\n");
  }

  if (event.type === "stockOut") {
    return [
      "📤 Saída de Estoque",
      "",
      `Produto: ${event.productName || "-"}`,
      `Quantidade retirada: ${formatAutomationQuantity(event.quantity)} ${event.unit || "unidade"}(s)`,
      `Estoque anterior: ${formatAutomationQuantity(event.previousStock)}`,
      `Estoque atual: ${formatAutomationQuantity(event.currentStock)}`,
      `Motivo: ${event.reason || "Movimentação de estoque"}`,
      `Responsável: ${event.responsibleUser || "-"}`,
      `Data: ${dateLabel}`
    ].join("\n");
  }

  const eventLabels = {
    productionExit: "📤 Carioquinha | Saída para Produção",
    stockAdjustment: "🛠️ Carioquinha | Ajuste Manual",
    quantityCorrection: "🧾 Carioquinha | Correção de Quantidade",
    productZeroed: "🚨 Carioquinha | Produto Zerado",
    expiring: "⏳ Carioquinha | Produto Vencendo",
    expired: "🚫 Carioquinha | Produto Vencido",
    purchaseSuggestion: "🛒 Carioquinha | Compra Sugerida"
  };

  if (eventLabels[event.type]) {
    return [
      eventLabels[event.type],
      "",
      `Produto: ${event.productName || "-"}`,
      `Quantidade: ${formatAutomationQuantity(event.quantity ?? event.currentStock)} ${event.unit || "unidade"}(s)`,
      `Estoque atual: ${formatAutomationQuantity(event.currentStock)}`,
      `Fornecedor: ${event.supplier || "-"}`,
      `Responsável: ${event.responsibleUser || "-"}`,
      `Ação recomendada: ${event.recommendation || event.recommendedAction || "Conferir operação"}`,
      `Data: ${dateLabel}`
    ].join("\n");
  }

  return [
    "⚠️ Alerta de Reposição",
    "",
    `Produto: ${event.productName || "-"}`,
    `Estoque atual: ${formatAutomationQuantity(event.currentStock)}`,
    `Estoque mínimo: ${formatAutomationQuantity(event.minStock)}`,
    `Fornecedor: ${event.supplier || "-"}`,
    `Ação recomendada: ${event.recommendation || "Comprar hoje"}`
  ].join("\n");
}

export async function registerAutomationLog({
  type,
  productName,
  message,
  status = "pendente_api",
  createdAt = new Date(),
  userId = "",
  empresaId = "",
  recipient = "",
  providerMessageId = ""
} = {}) {
  const profile = globalThis.window?.__burgerOpsProfile || {};
  const payload = {
    type,
    tipo: type,
    productName,
    produto: productName,
    message,
    mensagem: message,
    status,
    statusLabel: getAutomationLogStatusLabel(status),
    providerMessageId,
    destinatario: recipient,
    userId: userId || profile.userId || profile.id || "",
    empresaId: empresaId || profile.empresaId || "",
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt || new Date().toISOString()),
    criadoEm: serverTimestamp()
  };

  await addDoc(collection(db, AUTOMATION_LOG_COLLECTION), payload);
  return payload;
}

export async function sendWhatsAppPlaceholder(message, config = {}, event = {}) {
  // O envio real acontece no backend seguro.
  // O token da Evolution API deve ficar apenas no servidor.
  console.log("[WhatsApp pendente API]", message);
  let status = "pendente_api";
  let providerMessageId = "";
  let backendRegisteredLog = false;

  try {
    const endpointByType = {
      stockIn: "/whatsapp/stock-entry",
      stockOut: "/whatsapp/stock-exit",
      lowStock: "/whatsapp/low-stock",
      purchaseSuggestion: "/whatsapp/supplier-order-suggestion",
      productionExit: "/whatsapp/admin-stock-alert",
      stockAdjustment: "/whatsapp/admin-stock-alert",
      quantityCorrection: "/whatsapp/admin-stock-alert",
      productZeroed: "/whatsapp/admin-stock-alert",
      expiring: "/whatsapp/admin-stock-alert",
      expired: "/whatsapp/admin-stock-alert"
    };
    const endpoint = endpointByType[event.type] || "/api/whatsapp/send";
    const body = endpoint === "/api/whatsapp/send"
      ? {
        empresaId: event.empresaId || "",
        phone: config.adminPhone || "",
        secondaryPhone: config.secondaryPhone || "",
        message,
        alertType: event.type,
        metadata: {
          productName: event.productName || "",
          provider: config.provider || "",
          sendMode: config.sendMode || "immediate",
          webhookUrl: config.webhookUrl || ""
        }
      }
      : {
        ...event,
        message,
        adminPhone: config.adminPhone || "",
        secondaryPhone: config.secondaryPhone || "",
        provider: config.provider || "",
        sendMode: config.sendMode || "immediate",
        webhookUrl: config.webhookUrl || ""
      };
    const response = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(body)
    });

    status = response.status === "sent" ? "enviado" : "pendente_api";
    providerMessageId = response.providerMessageId || "";
    backendRegisteredLog = true;
  } catch (error) {
    status = "falhou";
    console.warn("Envio real não concluído. O estoque segue funcionando e o log local será salvo.", error);
  }

  if (!backendRegisteredLog) {
    await registerAutomationLog({
      type: event.type,
      productName: event.productName,
      message,
      status,
      createdAt: event.date || new Date(),
      userId: event.userId || "",
      empresaId: event.empresaId || "",
      recipient: config.adminPhone || "",
      providerMessageId
    });
  }

  return {
    status,
    message,
    providerMessageId
  };
}

export async function handleStockAutomationEvent(event = {}) {
  const alertKey = getAutomationAlertKey(event.type);
  const config = await loadAutomationConfig();
  const mandatoryAdminEvent = [
    "stockIn",
    "stockOut",
    "productionExit",
    "stockAdjustment",
    "quantityCorrection",
    "productZeroed",
    "lowStock",
    "expiring",
    "expired",
    "purchaseSuggestion"
  ].includes(alertKey);

  if (!config.enabled && !mandatoryAdminEvent) {
    return {
      skipped: true,
      reason: "automation_disabled"
    };
  }

  if (config.alertTypes?.[alertKey] === false && !mandatoryAdminEvent) {
    return {
      skipped: true,
      reason: "alert_type_disabled"
    };
  }

  const normalizedEvent = {
    ...event,
    type: alertKey,
    date: event.date || new Date()
  };
  const message = buildStockWhatsAppMessage(normalizedEvent);

  return sendWhatsAppPlaceholder(message, config, normalizedEvent);
}

export function registerServiceWorker() {
  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    navigator.serviceWorker.register("/sw.js")
      .then(async (registration) => {
        try {
          await registration.update();
        } catch (error) {
          console.warn("Falha ao atualizar o service worker.", error);
        }
      })
      .catch((error) => {
        console.warn("Falha ao registrar service worker.", error);
      });
  }
}

export async function getAuthToken() {
  const user = auth.currentUser ?? (await waitForAuthUser());

  if (!user) {
    throw new Error("Sessão expirada.");
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
        lastError = new Error(`Base ${baseUrl} não expõe a API esperada.`);
        continue;
      }

      if (!response.ok) {
        const error = new Error(payload?.erro || "Não foi possível completar a requisição.");
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
    "Não foi possível conectar ao backend. Verifique se o servidor desta instalação está online ou, em ambiente local, rode npm start."
  );
}

export async function apiFetchPublic(path, options = {}) {
  return performApiRequest(path, options, { requireAuth: false });
}

export async function apiFetch(path, options = {}) {
  return performApiRequest(path, options, { requireAuth: true });
}

export async function triggerReplenishmentEvaluation(reason = "app_event", options = {}) {
  try {
    return await apiFetch("/api/admin-alerts/evaluate", {
      method: "POST",
      body: JSON.stringify({
        reason,
        force: Boolean(options.force)
      })
    });
  } catch (error) {
    console.warn("Não foi possível reavaliar os alertas de reposição.", error);
    return null;
  }
}

export async function getRuntimeConfig() {
  return loadRuntimeConfig();
}

export function getMonthKey(value) {
  const raw = String(value ?? "").trim();
  return raw.length >= 7 ? raw.slice(0, 7) : "";
}

export function getMonthDate(monthKey) {
  return new Date(`${monthKey}-01T00:00:00`);
}

export function formatMonthLabel(monthKey) {
  if (!monthKey) {
    return "Mês não informado";
  }

  const parsed = getMonthDate(monthKey);

  if (Number.isNaN(parsed.getTime())) {
    return monthKey;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric"
  }).format(parsed);
}

export function calculatePurchaseReferenceTotal(purchase) {
  if (purchase?.valorReferenciaTotal != null) {
    return Math.max(0, toNumber(purchase.valorReferenciaTotal, 0));
  }

  const packageCount = Math.max(1, toNumber(purchase?.quantidadeEmbalagens, 1));
  const normalPackageValue = Math.max(
    0,
    toNumber(purchase?.valorNormalEmbalagem ?? purchase?.valorEmbalagem ?? purchase?.valorTotal, 0)
  );

  return normalPackageValue * packageCount;
}

export function calculatePurchaseDiscountTotal(purchase) {
  if (purchase?.descontoTotal != null) {
    return Math.max(0, toNumber(purchase.descontoTotal, 0));
  }

  return Math.max(0, calculatePurchaseReferenceTotal(purchase) - Math.max(0, toNumber(purchase?.valorTotal, 0)));
}

function compareTopItems(left, right, primaryField, secondaryField) {
  const primaryDifference = toNumber(right?.[primaryField], 0) - toNumber(left?.[primaryField], 0);

  if (primaryDifference !== 0) {
    return primaryDifference;
  }

  const secondaryDifference = toNumber(right?.[secondaryField], 0) - toNumber(left?.[secondaryField], 0);

  if (secondaryDifference !== 0) {
    return secondaryDifference;
  }

  return String(left?.nome || "").localeCompare(String(right?.nome || ""), "pt-BR");
}

export function aggregateMonthlyPurchases(purchases = []) {
  const monthlyMap = new Map();

  purchases.forEach((purchase) => {
    const monthKey = getMonthKey(purchase?.mesReferencia || purchase?.dataCompra);

    if (!monthKey) {
      return;
    }

    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        monthKey,
        totalPaid: 0,
        totalReference: 0,
        totalDiscount: 0,
        purchaseCount: 0,
        products: new Set(),
        productTotals: new Map()
      });
    }

    const aggregate = monthlyMap.get(monthKey);
    const totalPaid = Math.max(0, toNumber(purchase?.valorTotal, 0));
    const totalReference = calculatePurchaseReferenceTotal(purchase);
    const totalDiscount = calculatePurchaseDiscountTotal(purchase);
    const productKey = purchase?.produtoId || normalizeText(purchase?.produtoNome || "produto");
    const quantityUnits = Math.max(
      0,
      toNumber(purchase?.quantidadeUnidades, toNumber(purchase?.quantidadeEmbalagens, 0))
    );
    const productName = purchase?.produtoNome || "Produto";
    const usageUnit = String(purchase?.unidadeUso || "un").trim() || "un";

    aggregate.totalPaid += totalPaid;
    aggregate.totalReference += totalReference;
    aggregate.totalDiscount += totalDiscount;
    aggregate.purchaseCount += 1;
    aggregate.products.add(productKey);

    if (!aggregate.productTotals.has(productKey)) {
      aggregate.productTotals.set(productKey, {
        key: productKey,
        nome: productName,
        quantidade: 0,
        unidadeUso: usageUnit,
        totalPago: 0
      });
    }

    const productAggregate = aggregate.productTotals.get(productKey);
    productAggregate.quantidade += quantityUnits;
    productAggregate.totalPago += totalPaid;
  });

  const monthlySummaries = Array.from(monthlyMap.values())
    .map((entry) => {
      const items = Array.from(entry.productTotals.values());
      const topBoughtItem = items.length
        ? [...items].sort((left, right) => compareTopItems(left, right, "quantidade", "totalPago"))[0]
        : null;
      const mostExpensiveItem = items.length
        ? [...items].sort((left, right) => compareTopItems(left, right, "totalPago", "quantidade"))[0]
        : null;

      return {
        monthKey: entry.monthKey,
        totalPaid: entry.totalPaid,
        totalReference: entry.totalReference,
        totalDiscount: entry.totalDiscount,
        purchaseCount: entry.purchaseCount,
        uniqueProducts: entry.products.size,
        topBoughtItem,
        mostExpensiveItem
      };
    })
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey));

  const totalPaid = monthlySummaries.reduce((sum, month) => sum + month.totalPaid, 0);
  const totalDiscount = monthlySummaries.reduce((sum, month) => sum + month.totalDiscount, 0);
  const averagePaid = monthlySummaries.length ? totalPaid / monthlySummaries.length : 0;
  const highestMonth = monthlySummaries.length
    ? [...monthlySummaries].sort((left, right) => right.totalPaid - left.totalPaid)[0]
    : null;
  const lowestMonth = monthlySummaries.length
    ? [...monthlySummaries].sort((left, right) => left.totalPaid - right.totalPaid)[0]
    : null;
  const latestMonth = monthlySummaries.length ? monthlySummaries[monthlySummaries.length - 1] : null;
  const maxPaid = monthlySummaries.length
    ? Math.max(...monthlySummaries.map((month) => month.totalPaid))
    : 0;

  return {
    monthlySummaries,
    totalPaid,
    totalDiscount,
    averagePaid,
    highestMonth,
    lowestMonth,
    latestMonth,
    maxPaid
  };
}
