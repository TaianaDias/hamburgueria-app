import { WHATSAPP_PROVIDERS, buildWhatsAppPreviewUrl, createWhatsAppNotifier } from "./notification-channels.js";

const SYSTEM_CONFIG_COLLECTION = "configuracoes";
const SYSTEM_CONFIG_ID = "sistema";
const ALERTS_COLLECTION = "alertasReposicao";
const ALERT_HISTORY_COLLECTION = "historicoAlertasReposicao";
const OUTBOUND_NOTIFICATIONS_COLLECTION = "notificacoesSaida";
const PURCHASES_COLLECTION = "comprasMensais";
const STOCK_COLLECTION = "estoque";
const SUPPLIERS_COLLECTION = "fornecedores";
const DEFAULT_EVALUATION_INTERVAL_MS = 15 * 60 * 1000;
const CONSUMPTION_LOOKBACK_DAYS = 30;
const WEEKLY_REPORT_LOOKBACK_DAYS = 7;

const ORDER_WEEKDAYS = Object.freeze([
  { key: "seg", fullLabel: "Segunda", jsDay: 1 },
  { key: "ter", fullLabel: "Terca", jsDay: 2 },
  { key: "qua", fullLabel: "Quarta", jsDay: 3 },
  { key: "qui", fullLabel: "Quinta", jsDay: 4 },
  { key: "sex", fullLabel: "Sexta", jsDay: 5 },
  { key: "sab", fullLabel: "Sabado", jsDay: 6 },
  { key: "dom", fullLabel: "Domingo", jsDay: 0 }
]);

const DEFAULT_ALERT_CONFIG = Object.freeze({
  enabled: true,
  autoEvaluation: true,
  evaluationIntervalMinutes: 60,
  scheduledHour: 8,
  notificationCooldownHours: 12,
  targetCoverageDays: 7,
  criticalPercentOfMinimum: 0.5,
  idealFallbackMultiplier: 2,
  weeklyReportEnabled: true,
  weeklyReportWeekday: "seg",
  weeklyReportHour: 9,
  whatsappProvider: "log"
});

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeDocumentNumber(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return digits.startsWith("55") ? digits : `55${digits}`;
}

function normalizeBarcode(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 24);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(toNumber(value, 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2
  }).format(toNumber(value, 0));
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatWeekdayList(values = []) {
  const normalized = normalizeWeekdayList(values);

  if (!normalized.length) {
    return "Nao definido";
  }

  return normalized
    .map((value) => ORDER_WEEKDAYS.find((entry) => entry.key === value)?.fullLabel || value)
    .join(", ");
}

function getDateOnlyKey(referenceDate = new Date()) {
  return referenceDate.toISOString().slice(0, 10);
}

function getHoursDifference(left, right) {
  return Math.abs(right.getTime() - left.getTime()) / (1000 * 60 * 60);
}

function getDaysDifference(left, right) {
  return Math.abs(right.getTime() - left.getTime()) / (1000 * 60 * 60 * 24);
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  if (value?.toDate instanceof Function) {
    return value.toDate();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTodayDateKey(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const day = String(referenceDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function normalizeWeekdayList(values = []) {
  const rawValues = Array.isArray(values)
    ? values
    : String(values ?? "")
      .split(/[,\s;|/]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  const selected = new Set();

  rawValues.forEach((value) => {
    const normalizedValue = normalizeText(value).slice(0, 3);

    ORDER_WEEKDAYS.forEach((weekday) => {
      if (
        normalizeText(weekday.key) === normalizedValue
        || normalizeText(weekday.fullLabel).startsWith(normalizedValue)
      ) {
        selected.add(weekday.key);
      }
    });
  });

  return ORDER_WEEKDAYS
    .map((weekday) => weekday.key)
    .filter((key) => selected.has(key));
}

function getCurrentWeekdayKey(referenceDate = new Date()) {
  return ORDER_WEEKDAYS.find((entry) => entry.jsDay === referenceDate.getDay())?.key || "";
}

function getNearestWeekdayDistance(values = [], referenceDate = new Date()) {
  const normalized = normalizeWeekdayList(values);

  if (!normalized.length) {
    return null;
  }

  const currentDay = referenceDate.getDay();
  let smallestDistance = null;

  normalized.forEach((key) => {
    const weekday = ORDER_WEEKDAYS.find((entry) => entry.key === key);

    if (!weekday) {
      return;
    }

    const distance = (weekday.jsDay - currentDay + 7) % 7;
    const normalizedDistance = distance === 0 ? 0 : distance;

    if (smallestDistance == null || normalizedDistance < smallestDistance) {
      smallestDistance = normalizedDistance;
    }
  });

  return smallestDistance;
}

function isPromotionActive(entry = {}, referenceDate = new Date()) {
  if (!entry.promocaoAtiva) {
    return false;
  }

  const hasPromotionalPrice = entry.custoPromocionalCompra != null || entry.custoPromocionalUnitario != null;

  if (!hasPromotionalPrice) {
    return false;
  }

  const today = getTodayDateKey(referenceDate);
  const startDate = normalizeDateValue(entry.promocaoInicio);
  const endDate = normalizeDateValue(entry.promocaoFim);

  if (startDate && today < startDate) {
    return false;
  }

  if (endDate && today > endDate) {
    return false;
  }

  return true;
}

function calculateUnitCost(custoCompra, quantidadePorEmbalagem) {
  const packageQuantity = Math.max(1, toNumber(quantidadePorEmbalagem, 1));
  const purchaseCost = Math.max(0, toNumber(custoCompra, 0));
  return purchaseCost / packageQuantity;
}

function getMonthKey(value) {
  const raw = String(value ?? "").trim();
  return raw.length >= 7 ? raw.slice(0, 7) : "";
}

function getFirestoreTimestampValue(admin) {
  return admin.firestore.FieldValue.serverTimestamp();
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

function normalizeProductSupplierEntry(entry = {}, product = {}, supplierCatalog = [], referenceDate = new Date()) {
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
  const promotionEnabled = Boolean(entry?.promocaoAtiva);
  const promotionStart = normalizeDateValue(entry?.promocaoInicio);
  const promotionEnd = normalizeDateValue(entry?.promocaoFim);
  const promotionApplies = isPromotionActive({
    promocaoAtiva: promotionEnabled,
    promocaoInicio: promotionStart,
    promocaoFim: promotionEnd,
    custoPromocionalCompra: promotionalPurchaseCost,
    custoPromocionalUnitario: promotionalUnitCost
  }, referenceDate);
  const effectivePurchaseCost = promotionApplies && promotionalPurchaseCost != null
    ? promotionalPurchaseCost
    : purchaseCost;
  const effectiveUnitCost = promotionApplies && promotionalUnitCost != null
    ? promotionalUnitCost
    : unitCost;

  return {
    fornecedorId: String(entry?.fornecedorId ?? entry?.id ?? catalogSupplier?.id ?? "").trim(),
    nome: String(
      entry?.nome
      ?? entry?.fornecedorNome
      ?? entry?.fornecedor
      ?? catalogSupplier?.nome
      ?? ""
    ).trim(),
    cnpj: normalizeDocumentNumber(entry?.cnpj ?? entry?.cnpjFornecedor ?? catalogSupplier?.cnpj ?? ""),
    telefone: String(entry?.telefone ?? entry?.telefoneFornecedor ?? catalogSupplier?.telefone ?? "").trim(),
    telefoneNormalizado: normalizePhone(entry?.telefoneNormalizado ?? entry?.telefone ?? catalogSupplier?.telefone ?? ""),
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
      entry?.unidadeUso
      ?? entry?.unidadeCompra
      ?? product?.unidadeMedida
      ?? product?.unidadeUso
      ?? product?.unidadeCompra
      ?? "un"
    ).trim() || "un",
    principal: Boolean(entry?.principal)
  };
}

function normalizeProductSuppliers(product = {}, supplierCatalog = [], referenceDate = new Date()) {
  const hasModernSuppliers = Array.isArray(product?.fornecedores);
  const hasLegacySupplier = Boolean(
    product?.fornecedorId
    || product?.fornecedorNome
    || product?.fornecedor
    || product?.cnpjFornecedor
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
        principal: true,
        frequenciaAtiva: product.frequenciaAtiva,
        diasPedido: product.diasPedido,
        diasEntrega: product.diasEntrega,
        quantidadePedidoPadrao: product.quantidadePedidoPadrao
      }]
      : [];
  const seen = new Set();
  const normalized = rawSuppliers
    .map((entry) => normalizeProductSupplierEntry(entry, product, supplierCatalog, referenceDate))
    .filter((entry) => {
      const key = entry.fornecedorId || entry.cnpj || normalizeText(entry.nome);

      if (!key || seen.has(key)) {
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

function getPrimarySupplier(product, supplierCatalog = [], referenceDate = new Date()) {
  const suppliers = normalizeProductSuppliers(product, supplierCatalog, referenceDate);
  return suppliers.find((entry) => entry.principal) || suppliers[0] || null;
}

function getCheapestSupplier(product, supplierCatalog = [], referenceDate = new Date()) {
  const suppliers = normalizeProductSuppliers(product, supplierCatalog, referenceDate);

  if (!suppliers.length) {
    return null;
  }

  return [...suppliers].sort((left, right) => {
    const unitCostDifference = left.custoUnitarioEfetivo - right.custoUnitarioEfetivo;

    if (unitCostDifference !== 0) {
      return unitCostDifference;
    }

    const purchaseCostDifference = left.custoCompraEfetivo - right.custoCompraEfetivo;

    if (purchaseCostDifference !== 0) {
      return purchaseCostDifference;
    }

    return left.nome.localeCompare(right.nome, "pt-BR");
  })[0];
}

function buildSupplierComparisonList(product, supplierCatalog = [], referenceDate = new Date()) {
  const suppliers = normalizeProductSuppliers(product, supplierCatalog, referenceDate);

  return suppliers
    .map((supplier) => {
      const nextDeliveryInDays = getNearestWeekdayDistance(supplier.diasEntrega, referenceDate);
      const nextOrderInDays = getNearestWeekdayDistance(supplier.diasPedido, referenceDate);

      return {
        fornecedorId: supplier.fornecedorId,
        nome: supplier.nome,
        telefone: supplier.telefone,
        telefoneNormalizado: supplier.telefoneNormalizado,
        custoCompra: supplier.custoCompraEfetivo,
        custoUnitario: supplier.custoUnitarioEfetivo,
        unidadeUso: supplier.unidadeUso,
        conversao: supplier.conversao,
        principal: supplier.principal,
        promocaoAtiva: supplier.promocaoAplicada,
        frequenciaAtiva: supplier.frequenciaAtiva,
        diasPedido: supplier.diasPedido,
        diasEntrega: supplier.diasEntrega,
        quantidadePedidoPadrao: supplier.quantidadePedidoPadrao,
        nextDeliveryInDays: nextDeliveryInDays == null ? null : Math.max(1, nextDeliveryInDays),
        nextOrderInDays: nextOrderInDays == null ? null : Math.max(0, nextOrderInDays),
        scheduleLabel: formatWeekdayList(supplier.diasPedido),
        deliveryLabel: formatWeekdayList(supplier.diasEntrega)
      };
    })
    .sort((left, right) => left.custoUnitario - right.custoUnitario);
}

function estimateDailyConsumption(productId, purchases = [], referenceDate = new Date()) {
  const lowerBound = new Date(referenceDate);
  lowerBound.setDate(lowerBound.getDate() - CONSUMPTION_LOOKBACK_DAYS);

  const totalUnits = purchases
    .filter((purchase) => purchase.produtoId === productId)
    .filter((purchase) => {
      const purchaseDate = parseDateValue(purchase.dataCompra || purchase.criadoEm);
      return purchaseDate && purchaseDate >= lowerBound;
    })
    .reduce((sum, purchase) => (
      sum + Math.max(0, toNumber(
        purchase.quantidadeUnidades,
        toNumber(purchase.quantidadeEmbalagens, 0)
      ))
    ), 0);

  return totalUnits > 0
    ? totalUnits / CONSUMPTION_LOOKBACK_DAYS
    : 0;
}

function estimateLeadTimeDays(supplier, referenceDate = new Date()) {
  if (!supplier) {
    return null;
  }

  const deliveryDistance = getNearestWeekdayDistance(supplier.diasEntrega, referenceDate);

  if (deliveryDistance != null) {
    return Math.max(1, deliveryDistance);
  }

  const orderDistance = getNearestWeekdayDistance(supplier.diasPedido, referenceDate);

  if (orderDistance != null) {
    return Math.max(1, orderDistance + 1);
  }

  return null;
}

function determineAlertLevel(input) {
  const {
    currentStock,
    minimumStock,
    criticalThreshold,
    daysCoverage,
    leadTimeDays,
    orderWindowDueToday,
    idealStock
  } = input;
  const reasons = [];

  if (currentStock <= criticalThreshold) {
    reasons.push("estoque critico");
  } else if (currentStock <= minimumStock) {
    reasons.push("estoque minimo");
  }

  if (daysCoverage != null && leadTimeDays != null) {
    if (daysCoverage <= leadTimeDays) {
      reasons.push("cobertura menor ou igual ao prazo de entrega");
    } else if (daysCoverage <= leadTimeDays + 2) {
      reasons.push("cobertura curta para o prazo de entrega");
    }
  }

  if (orderWindowDueToday && currentStock < idealStock) {
    reasons.push("dia programado de pedido");
  }

  if (currentStock <= criticalThreshold || (daysCoverage != null && leadTimeDays != null && daysCoverage <= leadTimeDays)) {
    return {
      level: "urgent",
      reasons
    };
  }

  if (
    currentStock <= minimumStock
    || (daysCoverage != null && leadTimeDays != null && daysCoverage <= leadTimeDays + 2)
    || (orderWindowDueToday && currentStock < idealStock)
  ) {
    return {
      level: "attention",
      reasons
    };
  }

  return {
    level: "normal",
    reasons: reasons.length ? reasons : ["estoque dentro do esperado"]
  };
}

function buildSuggestedPurchase(input, config) {
  const {
    currentStock,
    minimumStock,
    idealStock,
    dailyConsumption,
    leadTimeDays,
    supplier
  } = input;
  const fallbackIdealStock = Math.max(
    minimumStock,
    Math.ceil(minimumStock * Math.max(1, toNumber(config.idealFallbackMultiplier, 2)))
  );
  const targetIdealStock = Math.max(idealStock, fallbackIdealStock);
  const targetCoverageDays = Math.max(1, toNumber(config.targetCoverageDays, 7));
  const consumptionTarget = dailyConsumption > 0
    ? Math.ceil(dailyConsumption * (targetCoverageDays + Math.max(0, leadTimeDays ?? 0)))
    : 0;
  const targetUnits = Math.max(targetIdealStock, minimumStock, consumptionTarget);
  const unitsToBuy = Math.max(0, targetUnits - currentStock);
  const packageSize = Math.max(1, toNumber(supplier?.conversao, 1));
  const packagesToBuy = unitsToBuy > 0 ? Math.max(1, Math.ceil(unitsToBuy / packageSize)) : 0;
  const replenishmentUnits = packagesToBuy * packageSize;
  const estimatedCoverageDays = dailyConsumption > 0
    ? (currentStock + replenishmentUnits) / dailyConsumption
    : null;

  return {
    unitsToBuy,
    packagesToBuy,
    replenishmentUnits,
    packageSize,
    estimatedCoverageDays,
    estimatedSpend: supplier ? packagesToBuy * supplier.custoCompra : 0
  };
}

function buildSupplierOrderMessage(alert) {
  const recommendation = alert.suggestedPurchase;
  const supplier = alert.recommendedSupplier;

  if (!supplier?.telefoneNormalizado) {
    return "";
  }

  const lines = [
    "Pedido de reposicao",
    "",
    `Produto: ${alert.productName}`,
    `Estoque atual: ${formatNumber(alert.currentStock)} ${alert.usageUnit}`,
    `Sugestao de compra: ${recommendation.packagesToBuy} embalagem(ns)`,
    `Cobertura estimada apos compra: ${recommendation.estimatedCoverageDays != null ? `${formatNumber(recommendation.estimatedCoverageDays)} dia(s)` : "nao calculada"}`,
    "",
    "Favor confirmar disponibilidade e prazo de entrega."
  ];

  return buildWhatsAppPreviewUrl(supplier.telefoneNormalizado, lines.join("\n"));
}

function buildAdminNotificationMessage(alerts = []) {
  const lines = [
    "ALERTA DE REPOSICAO - CONTROLE DE ESTOQUE",
    "",
    "Os seguintes itens precisam de atencao:",
    ""
  ];

  alerts.forEach((alert) => {
    const urgencyLabel = alert.level === "urgent" ? "URGENTE" : "ATENCAO";
    const deliveryLabel = alert.recommendedSupplier?.leadTimeDays != null
      ? `${alert.recommendedSupplier.leadTimeDays} dia(s)`
      : "nao informado";
    const recommendation = alert.suggestedPurchase.packagesToBuy
      ? `Comprar ${alert.suggestedPurchase.packagesToBuy} embalagem(ns) para cobertura estimada de ${alert.suggestedPurchase.estimatedCoverageDays != null ? `${formatNumber(alert.suggestedPurchase.estimatedCoverageDays)} dia(s)` : "periodo alvo"}.`
      : "Revisar necessidade de compra manualmente.";

    lines.push(
      `${alert.level === "urgent" ? "🔴" : "🟡"} ${urgencyLabel} - ${alert.productName}`,
      `Estoque atual: ${formatNumber(alert.currentStock)} ${alert.usageUnit} | Minimo: ${formatNumber(alert.minimumStock)}`,
      `Fornecedor mais barato: ${alert.recommendedSupplier?.nome || "Nao definido"} - ${formatCurrency(alert.recommendedSupplier?.custoCompra ?? 0)}`,
      `Entrega estimada: ${deliveryLabel}${alert.recommendedSupplier?.promocaoAtiva ? " | promocao ativa" : ""}`,
      `Acao recomendada: ${recommendation}`,
      ""
    );
  });

  lines.push("Verifique fornecedores cadastrados, compare custo e realize o pedido de reposicao estrategica.");
  return lines.join("\n").trim();
}

function summarizeAlert(alert) {
  return {
    productId: alert.productId,
    productName: alert.productName,
    barcode: alert.barcode,
    currentStock: alert.currentStock,
    minimumStock: alert.minimumStock,
    idealStock: alert.idealStock,
    criticalThreshold: alert.criticalThreshold,
    usageUnit: alert.usageUnit,
    level: alert.level,
    reasons: alert.reasons,
    averageDailyConsumption: alert.averageDailyConsumption,
    daysCoverage: alert.daysCoverage,
    orderWindowDueToday: alert.orderWindowDueToday,
    recommendedSupplier: alert.recommendedSupplier,
    supplierComparisons: alert.supplierComparisons,
    suggestedPurchase: alert.suggestedPurchase,
    estimatedSavings: alert.estimatedSavings,
    supplierOrderUrl: alert.supplierOrderUrl,
    status: alert.status,
    resolvedAt: alert.resolvedAt || null,
    lastTriggeredAt: alert.lastTriggeredAt || null
  };
}

function computeAlertStatus(existingAlert, level, shouldDisplay) {
  if (level === "normal") {
    return "normal";
  }

  if (!shouldDisplay) {
    return existingAlert?.status || "resolved_manual";
  }

  return level === "urgent" ? "critical_open" : "attention_open";
}

function getWeekBucket(referenceDate = new Date()) {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start.toISOString().slice(0, 10);
}

export function createStockAlertService(options = {}) {
  const admin = options.admin;
  const firestore = admin.firestore();
  const logger = options.logger || console;
  const systemConfigRef = firestore.collection(SYSTEM_CONFIG_COLLECTION).doc(SYSTEM_CONFIG_ID);
  let schedulerHandle = null;
  let evaluationInFlight = false;

  async function getSystemConfig() {
    const snapshot = await systemConfigRef.get();
    const rawData = snapshot.data() || {};
    const alertConfig = {
      ...DEFAULT_ALERT_CONFIG,
      ...(rawData.alertasReposicao || {})
    };

    return {
      raw: rawData,
      alertConfig
    };
  }

  async function updateAlertConfig(nextConfig, actor = "system") {
    const { alertConfig } = await getSystemConfig();
    const payload = {
      alertasReposicao: {
        ...alertConfig,
        ...nextConfig,
        updatedAt: getFirestoreTimestampValue(admin),
        updatedBy: actor
      }
    };

    await systemConfigRef.set(payload, { merge: true });
    const updatedConfigResult = await getSystemConfig();
    return updatedConfigResult.alertConfig;
  }

  async function loadCollections() {
    const [
      configResult,
      stockSnapshot,
      suppliersSnapshot,
      purchasesSnapshot,
      alertsSnapshot,
      historySnapshot,
      notificationsSnapshot
    ] = await Promise.all([
      getSystemConfig(),
      firestore.collection(STOCK_COLLECTION).get(),
      firestore.collection(SUPPLIERS_COLLECTION).get(),
      firestore.collection(PURCHASES_COLLECTION).get(),
      firestore.collection(ALERTS_COLLECTION).get(),
      firestore.collection(ALERT_HISTORY_COLLECTION).orderBy("createdAt", "desc").limit(20).get(),
      firestore.collection(OUTBOUND_NOTIFICATIONS_COLLECTION).orderBy("createdAt", "desc").limit(1).get()
    ]);

    return {
      configResult,
      stockItems: stockSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
      suppliers: suppliersSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
      purchases: purchasesSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
      currentAlerts: new Map(alertsSnapshot.docs.map((document) => [document.id, { id: document.id, ...document.data() }])),
      history: historySnapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
      latestNotification: notificationsSnapshot.empty
        ? null
        : { id: notificationsSnapshot.docs[0].id, ...notificationsSnapshot.docs[0].data() }
    };
  }

  function buildAlertModel(product, supplierCatalog, purchases, currentAlerts, config, referenceDate = new Date()) {
    const currentStock = Math.max(0, toNumber(product.quantidade, 0));
    const minimumStock = Math.max(0, toNumber(product.minimo, 0));
    const idealStock = Math.max(minimumStock, toNumber(product.maximo, minimumStock));
    const criticalThreshold = Math.max(
      0,
      Math.floor(minimumStock * Math.max(0.1, toNumber(config.criticalPercentOfMinimum, 0.5)))
    );
    const dailyConsumption = estimateDailyConsumption(product.id, purchases, referenceDate);
    const supplierComparisons = buildSupplierComparisonList(product, supplierCatalog, referenceDate);
    const recommendedSupplier = supplierComparisons[0] || null;
    const leadTimeDays = recommendedSupplier?.nextDeliveryInDays ?? estimateLeadTimeDays(recommendedSupplier, referenceDate);
    const orderWindowDueToday = recommendedSupplier?.nextOrderInDays === 0;
    const daysCoverage = dailyConsumption > 0 ? currentStock / dailyConsumption : null;
    const levelData = determineAlertLevel({
      currentStock,
      minimumStock,
      criticalThreshold,
      daysCoverage,
      leadTimeDays,
      orderWindowDueToday,
      idealStock
    });
    const primarySupplier = getPrimarySupplier(product, supplierCatalog, referenceDate);
    const suggestedPurchase = buildSuggestedPurchase({
      currentStock,
      minimumStock,
      idealStock,
      dailyConsumption,
      leadTimeDays,
      supplier: recommendedSupplier
    }, config);
    const estimatedSavings = recommendedSupplier && primarySupplier
      ? Math.max(
        0,
        (primarySupplier.custoCompraEfetivo - recommendedSupplier.custoCompra) * suggestedPurchase.packagesToBuy
      )
      : 0;
    const existingAlert = currentAlerts.get(product.id);
    const snoozedUntil = parseDateValue(existingAlert?.snoozedUntil);
    const shouldDisplay = levelData.level !== "normal"
      && (!snoozedUntil || referenceDate >= snoozedUntil || levelData.level === "urgent");
    const status = computeAlertStatus(existingAlert, levelData.level, shouldDisplay);

    return {
      productId: product.id,
      productName: product.nome,
      barcode: product.codigoBarras || product.codigoBarrasNormalizado || "",
      currentStock,
      minimumStock,
      idealStock,
      criticalThreshold,
      usageUnit: product.unidadeMedida || product.unidadeUso || product.unidadeCompra || "un",
      averageDailyConsumption: dailyConsumption,
      daysCoverage,
      orderWindowDueToday,
      level: levelData.level,
      reasons: levelData.reasons,
      recommendedSupplier: recommendedSupplier
        ? {
          ...recommendedSupplier,
          leadTimeDays
        }
        : null,
      supplierComparisons,
      suggestedPurchase,
      estimatedSavings,
      supplierOrderUrl: buildSupplierOrderMessage({
        productName: product.nome,
        currentStock,
        usageUnit: product.unidadeMedida || product.unidadeUso || product.unidadeCompra || "un",
        recommendedSupplier: recommendedSupplier
          ? {
            ...recommendedSupplier,
            leadTimeDays
          }
          : null,
        suggestedPurchase
      }),
      existingAlert,
      status
    };
  }

  function shouldNotifyAlert(alert, config, referenceDate = new Date()) {
    if (alert.level === "normal" || alert.status === "resolved_manual") {
      return false;
    }

    const existingAlert = alert.existingAlert;

    if (!existingAlert || !existingAlert.lastTriggeredAt) {
      return true;
    }

    if (existingAlert.level !== alert.level) {
      return true;
    }

    const lastTriggeredAt = parseDateValue(existingAlert.lastTriggeredAt);

    if (!lastTriggeredAt) {
      return true;
    }

    const cooldownHours = Math.max(1, toNumber(config.notificationCooldownHours, 12));
    return getHoursDifference(lastTriggeredAt, referenceDate) >= cooldownHours;
  }

  async function appendHistoryEvent(productId, payload) {
    await firestore.collection(ALERT_HISTORY_COLLECTION).add(payload);
  }

  async function persistAlertResolution(alert, actor, referenceDate, reason) {
    const now = referenceDate.toISOString();
    await firestore.collection(ALERTS_COLLECTION).doc(alert.productId).set({
      productId: alert.productId,
      productName: alert.productName,
      level: "normal",
      status: "resolved_auto",
      open: false,
      resolvedAt: now,
      resolvedBy: actor,
      updatedAt: now,
      resolutionReason: reason
    }, { merge: true });

    await appendHistoryEvent(alert.productId, {
      productId: alert.productId,
      productName: alert.productName,
      eventType: "resolved_auto",
      actor,
      reason,
      createdAt: now
    });
  }

  async function persistAlertState(alert, actor, config, referenceDate) {
    const now = referenceDate.toISOString();
    const notificationCooldownHours = Math.max(1, toNumber(config.notificationCooldownHours, 12));
    const nextNotificationAt = new Date(referenceDate.getTime() + (notificationCooldownHours * 60 * 60 * 1000)).toISOString();
    const willNotify = shouldNotifyAlert(alert, config, referenceDate);
    const existingAlert = alert.existingAlert;
    const eventType = !existingAlert || existingAlert.level === "normal"
      ? "opened"
      : existingAlert.level !== alert.level
        ? "escalated"
        : "updated";

    await firestore.collection(ALERTS_COLLECTION).doc(alert.productId).set({
      productId: alert.productId,
      productName: alert.productName,
      barcode: alert.barcode,
      level: alert.level,
      status: alert.status,
      open: alert.status !== "resolved_manual",
      currentStock: alert.currentStock,
      minimumStock: alert.minimumStock,
      idealStock: alert.idealStock,
      criticalThreshold: alert.criticalThreshold,
      usageUnit: alert.usageUnit,
      averageDailyConsumption: alert.averageDailyConsumption,
      daysCoverage: alert.daysCoverage,
      reasons: alert.reasons,
      recommendedSupplier: alert.recommendedSupplier,
      supplierComparisons: alert.supplierComparisons,
      suggestedPurchase: alert.suggestedPurchase,
      estimatedSavings: alert.estimatedSavings,
      supplierOrderUrl: alert.supplierOrderUrl,
      updatedAt: now,
      lastEvaluatedAt: now,
      lastTriggeredAt: willNotify ? now : existingAlert?.lastTriggeredAt || null,
      nextNotificationAt: willNotify ? nextNotificationAt : existingAlert?.nextNotificationAt || nextNotificationAt,
      firstDetectedAt: existingAlert?.firstDetectedAt || now,
      lastDetectedBy: actor
    }, { merge: true });

    if (alert.status !== "resolved_manual") {
      await appendHistoryEvent(alert.productId, {
        productId: alert.productId,
        productName: alert.productName,
        eventType,
        actor,
        level: alert.level,
        currentStock: alert.currentStock,
        minimumStock: alert.minimumStock,
        createdAt: now
      });
    }

    return willNotify;
  }

  async function queueNotification(alerts, configResult, trigger, referenceDate = new Date()) {
    const adminWhatsapp = normalizePhone(configResult.raw.adminWhatsapp || "");

    if (!alerts.length) {
      return null;
    }

    const message = buildAdminNotificationMessage(alerts);
    const notifier = createWhatsAppNotifier({
      provider: configResult.alertConfig.whatsappProvider,
      env: process.env
    });
    const result = adminWhatsapp
      ? await notifier.send({
        recipient: adminWhatsapp,
        message
      })
      : {
        delivered: false,
        status: "missing_recipient",
        previewUrl: "",
        provider: notifier.provider
      };
    const notificationPayload = {
      channel: "whatsapp",
      provider: notifier.provider,
      recipient: adminWhatsapp,
      message,
      previewUrl: result.previewUrl || buildWhatsAppPreviewUrl(adminWhatsapp, message),
      status: result.status,
      delivered: result.delivered,
      trigger,
      type: "replenishment_alert",
      itemCount: alerts.length,
      alerts: alerts.map((alert) => ({
        productId: alert.productId,
        productName: alert.productName,
        level: alert.level
      })),
      createdAt: referenceDate.toISOString()
    };
    const docRef = await firestore.collection(OUTBOUND_NOTIFICATIONS_COLLECTION).add(notificationPayload);
    return {
      id: docRef.id,
      ...notificationPayload
    };
  }

  function buildWeeklyReport(purchases, alerts, referenceDate = new Date()) {
    const lowerBound = new Date(referenceDate);
    lowerBound.setDate(lowerBound.getDate() - WEEKLY_REPORT_LOOKBACK_DAYS);

    const recentPurchases = purchases.filter((purchase) => {
      const purchaseDate = parseDateValue(purchase.dataCompra || purchase.criadoEm);
      return purchaseDate && purchaseDate >= lowerBound;
    });

    const purchaseCountByProduct = new Map();
    const supplierTotals = new Map();

    recentPurchases.forEach((purchase) => {
      const productKey = purchase.produtoId || normalizeText(purchase.produtoNome || "produto");
      const quantity = Math.max(0, toNumber(
        purchase.quantidadeUnidades,
        toNumber(purchase.quantidadeEmbalagens, 0)
      ));
      const supplierKey = purchase.fornecedorId || normalizeText(purchase.fornecedorNome || "fornecedor");
      const supplierName = purchase.fornecedorNome || "Fornecedor";
      const supplierUnitCost = Math.max(0, toNumber(
        purchase.valorUnitarioUso,
        quantity > 0 ? toNumber(purchase.valorTotal, 0) / quantity : 0
      ));

      if (!purchaseCountByProduct.has(productKey)) {
        purchaseCountByProduct.set(productKey, {
          nome: purchase.produtoNome || "Produto",
          quantidade: 0
        });
      }

      purchaseCountByProduct.get(productKey).quantidade += quantity;

      if (!supplierTotals.has(supplierKey)) {
        supplierTotals.set(supplierKey, {
          nome: supplierName,
          totalUnitCost: 0,
          samples: 0
        });
      }

      const supplierAggregate = supplierTotals.get(supplierKey);
      supplierAggregate.totalUnitCost += supplierUnitCost;
      supplierAggregate.samples += 1;
    });

    const topMovingProduct = [...purchaseCountByProduct.values()]
      .sort((left, right) => right.quantidade - left.quantidade)[0] || null;
    const bestSupplier = [...supplierTotals.values()]
      .filter((item) => item.samples > 0)
      .sort((left, right) => (left.totalUnitCost / left.samples) - (right.totalUnitCost / right.samples))[0] || null;
    const touchedProducts = new Set(alerts.map((alert) => alert.productId)).size;
    const message = [
      "RELATORIO SEMANAL DE REPOSICAO",
      "",
      `${touchedProducts} item(ns) exigiram reposicao nesta semana.`,
      `Fornecedor com melhor custo medio: ${bestSupplier ? `${bestSupplier.nome} - ${formatCurrency(bestSupplier.totalUnitCost / bestSupplier.samples)}` : "Sem dados suficientes"}`,
      `Produto com maior giro: ${topMovingProduct ? `${topMovingProduct.nome} - ${formatNumber(topMovingProduct.quantidade)} unidades` : "Sem dados suficientes"}`
    ].join("\n");

    return {
      touchedProducts,
      bestSupplier: bestSupplier
        ? {
          nome: bestSupplier.nome,
          averageUnitCost: bestSupplier.totalUnitCost / bestSupplier.samples
        }
        : null,
      topMovingProduct,
      message
    };
  }

  async function maybeQueueWeeklyReport(context, trigger, referenceDate = new Date()) {
    const { alertConfig } = context.configResult;

    if (!alertConfig.weeklyReportEnabled) {
      return null;
    }

    const currentWeekday = getCurrentWeekdayKey(referenceDate);
    const currentHour = referenceDate.getHours();
    const weeklyBucket = getWeekBucket(referenceDate);
    const lastWeeklyReportAt = parseDateValue(alertConfig.lastWeeklyReportAt);
    const alreadySentThisWeek = lastWeeklyReportAt && getWeekBucket(lastWeeklyReportAt) === weeklyBucket;

    if (!alreadySentThisWeek) {
      const shouldSendWeekly = trigger === "force"
        || (currentWeekday === alertConfig.weeklyReportWeekday && currentHour >= toNumber(alertConfig.weeklyReportHour, 9));

      if (shouldSendWeekly) {
        const weeklyReport = buildWeeklyReport(context.purchases, context.activeAlerts, referenceDate);
        const adminWhatsapp = normalizePhone(context.configResult.raw.adminWhatsapp || "");
        const notifier = createWhatsAppNotifier({
          provider: alertConfig.whatsappProvider,
          env: process.env
        });
        const result = adminWhatsapp
          ? await notifier.send({
            recipient: adminWhatsapp,
            message: weeklyReport.message
          })
          : {
            delivered: false,
            status: "missing_recipient",
            previewUrl: "",
            provider: notifier.provider
          };

        await firestore.collection(OUTBOUND_NOTIFICATIONS_COLLECTION).add({
          channel: "whatsapp",
          provider: notifier.provider,
          recipient: adminWhatsapp,
          message: weeklyReport.message,
          previewUrl: result.previewUrl || buildWhatsAppPreviewUrl(adminWhatsapp, weeklyReport.message),
          status: result.status,
          delivered: result.delivered,
          trigger: `${trigger}_weekly_report`,
          type: "weekly_report",
          createdAt: referenceDate.toISOString()
        });

        await systemConfigRef.set({
          alertasReposicao: {
            ...alertConfig,
            lastWeeklyReportAt: referenceDate.toISOString()
          }
        }, { merge: true });

        return weeklyReport;
      }
    }

    return buildWeeklyReport(context.purchases, context.activeAlerts, referenceDate);
  }

  async function evaluateAlerts(options = {}) {
    const {
      force = false,
      actor = "system",
      trigger = "manual"
    } = options;

    if (evaluationInFlight) {
      return null;
    }

    evaluationInFlight = true;

    try {
      const referenceDate = new Date();
      const loaded = await loadCollections();
      const { alertConfig } = loaded.configResult;

      if (!alertConfig.enabled) {
        return {
          generatedAt: referenceDate.toISOString(),
          config: alertConfig,
          adminWhatsapp: normalizePhone(loaded.configResult.raw.adminWhatsapp || ""),
          supportedProviders: [...WHATSAPP_PROVIDERS],
          activeAlerts: [],
          attentionCount: 0,
          urgentCount: 0,
          estimatedSavings: 0,
          latestNotification: loaded.latestNotification,
          history: loaded.history,
          weeklyReport: buildWeeklyReport(loaded.purchases, [], referenceDate)
        };
      }

      if (!force && !alertConfig.autoEvaluation) {
        return {
          generatedAt: referenceDate.toISOString(),
          config: alertConfig,
          adminWhatsapp: normalizePhone(loaded.configResult.raw.adminWhatsapp || ""),
          supportedProviders: [...WHATSAPP_PROVIDERS],
          activeAlerts: [],
          attentionCount: 0,
          urgentCount: 0,
          estimatedSavings: 0,
          latestNotification: loaded.latestNotification,
          history: loaded.history,
          weeklyReport: buildWeeklyReport(loaded.purchases, [], referenceDate)
        };
      }

      const activeAlerts = [];
      const notificationsToQueue = [];

      for (const product of loaded.stockItems) {
        const alert = buildAlertModel(
          product,
          loaded.suppliers,
          loaded.purchases,
          loaded.currentAlerts,
          alertConfig,
          referenceDate
        );

        if (alert.level === "normal") {
          if (alert.existingAlert && alert.existingAlert.level !== "normal" && alert.existingAlert.open !== false) {
            await persistAlertResolution(alert, actor, referenceDate, "estoque normalizado");
          }

          continue;
        }

        const notified = await persistAlertState(alert, actor, alertConfig, referenceDate);

        if (alert.status !== "resolved_manual") {
          activeAlerts.push(summarizeAlert(alert));
        }

        if (notified) {
          notificationsToQueue.push(alert);
        }
      }

      const latestNotification = notificationsToQueue.length
        ? await queueNotification(notificationsToQueue, loaded.configResult, trigger, referenceDate)
        : loaded.latestNotification;

      await systemConfigRef.set({
        alertasReposicao: {
          ...alertConfig,
          lastEvaluatedAt: referenceDate.toISOString()
        }
      }, { merge: true });

      const weeklyReport = await maybeQueueWeeklyReport({
        ...loaded,
        activeAlerts
      }, force ? "force" : trigger, referenceDate);
      const urgentCount = activeAlerts.filter((alert) => alert.level === "urgent").length;
      const attentionCount = activeAlerts.filter((alert) => alert.level === "attention").length;
      const estimatedSavings = activeAlerts.reduce((sum, alert) => sum + Math.max(0, toNumber(alert.estimatedSavings, 0)), 0);

      return {
        generatedAt: referenceDate.toISOString(),
        config: alertConfig,
        adminWhatsapp: normalizePhone(loaded.configResult.raw.adminWhatsapp || ""),
        supportedProviders: [...WHATSAPP_PROVIDERS],
        activeAlerts: activeAlerts.sort((left, right) => {
          if (left.level !== right.level) {
            return left.level === "urgent" ? -1 : 1;
          }

          return left.currentStock - right.currentStock;
        }),
        attentionCount,
        urgentCount,
        estimatedSavings,
        latestNotification,
        history: loaded.history,
        weeklyReport
      };
    } finally {
      evaluationInFlight = false;
    }
  }

  function shouldRunScheduler(config, referenceDate = new Date()) {
    if (!config.enabled || !config.autoEvaluation) {
      return false;
    }

    const lastEvaluatedAt = parseDateValue(config.lastEvaluatedAt);

    if (!lastEvaluatedAt) {
      return true;
    }

    const intervalMinutes = Math.max(15, toNumber(config.evaluationIntervalMinutes, 60));

    if (getHoursDifference(lastEvaluatedAt, referenceDate) >= (intervalMinutes / 60)) {
      return true;
    }

    const sameDay = getDateOnlyKey(lastEvaluatedAt) === getDateOnlyKey(referenceDate);
    return !sameDay && referenceDate.getHours() >= toNumber(config.scheduledHour, 8);
  }

  function startScheduler() {
    if (schedulerHandle) {
      return;
    }

    const runScheduledCheck = async (trigger) => {
      try {
        const { alertConfig } = await getSystemConfig();

        if (shouldRunScheduler(alertConfig, new Date())) {
          await evaluateAlerts({
            force: false,
            actor: "scheduler",
            trigger
          });
        }
      } catch (error) {
        logger.error("Falha no agendador de alertas de reposicao.", error);
      }
    };

    void runScheduledCheck("startup");

    schedulerHandle = setInterval(() => {
      void runScheduledCheck("scheduler");
    }, DEFAULT_EVALUATION_INTERVAL_MS);

    if (schedulerHandle?.unref instanceof Function) {
      schedulerHandle.unref();
    }
  }

  async function markAlertResolved(productId, actor = "admin") {
    const alertRef = firestore.collection(ALERTS_COLLECTION).doc(productId);
    const snapshot = await alertRef.get();

    if (!snapshot.exists) {
      throw new Error("Alerta nao encontrado para este produto.");
    }

    const currentAlert = snapshot.data();
    const resolvedAt = new Date();
    const { alertConfig } = await getSystemConfig();
    const snoozedUntil = new Date(
      resolvedAt.getTime() + (Math.max(1, toNumber(alertConfig.notificationCooldownHours, 12)) * 60 * 60 * 1000)
    );

    await alertRef.set({
      open: false,
      status: "resolved_manual",
      resolvedAt: resolvedAt.toISOString(),
      resolvedBy: actor,
      snoozedUntil: snoozedUntil.toISOString(),
      updatedAt: resolvedAt.toISOString()
    }, { merge: true });

    await appendHistoryEvent(productId, {
      productId,
      productName: currentAlert.productName,
      eventType: "resolved_manual",
      actor,
      createdAt: resolvedAt.toISOString()
    });

    return true;
  }

  async function getDashboardData(options = {}) {
    const evaluation = await evaluateAlerts({
      force: Boolean(options.force),
      actor: options.actor || "dashboard",
      trigger: options.force ? "force" : "dashboard"
    });

    if (!evaluation) {
      const loaded = await loadCollections();
      const weeklyReport = buildWeeklyReport(loaded.purchases, [], new Date());
      return {
        generatedAt: new Date().toISOString(),
        config: loaded.configResult.alertConfig,
        adminWhatsapp: normalizePhone(loaded.configResult.raw.adminWhatsapp || ""),
        supportedProviders: [...WHATSAPP_PROVIDERS],
        activeAlerts: [],
        attentionCount: 0,
        urgentCount: 0,
        estimatedSavings: 0,
        latestNotification: loaded.latestNotification,
        history: loaded.history,
        weeklyReport
      };
    }

    return evaluation;
  }

  return {
    getDashboardData,
    evaluateAlerts,
    getSystemConfig,
    updateAlertConfig,
    markAlertResolved,
    startScheduler
  };
}
