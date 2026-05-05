import {
  formatCurrency,
  normalizeText,
  toNumber
} from "./app.js";

export const OPERATIONAL_COLLECTIONS = Object.freeze({
  producoes: "producoes",
  etiquetas: "etiquetasHistorico",
  impressoras: "configuracoesImpressora",
  whatsapp: "comandosWhatsApp",
  inventarios: "inventarios",
  auditoria: "auditoriaOperacional",
  saas: "configuracoesSaas"
});

export function getDateKey(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const day = String(referenceDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

export function generateLotCode(productName, referenceDate = new Date(), index = 1) {
  const prefix = normalizeText(productName)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.slice(0, 3))
    .join("")
    .slice(0, 9)
    .toUpperCase() || "LOTE";
  const day = String(referenceDate.getDate()).padStart(2, "0");
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const year = String(referenceDate.getFullYear()).slice(-2);
  return `${prefix}-${day}${month}${year}-${String(index).padStart(3, "0")}`;
}

export function calculateExpirationDate(hours, referenceDate = new Date()) {
  const expirationHours = Math.max(1, toNumber(hours, 72));
  return new Date(referenceDate.getTime() + expirationHours * 60 * 60 * 1000);
}

export function inferOperationalCommand(message = "") {
  const text = normalizeText(message);
  const quantityMatch = text.match(/(\d+(?:[,.]\d+)?)/);
  const quantity = quantityMatch ? toNumber(quantityMatch[1].replace(",", "."), 0) : 0;
  const moneyMatch = text.match(/r?\$?\s*(\d+(?:[,.]\d{1,2})?)/);
  const cost = moneyMatch ? toNumber(moneyMatch[1].replace(",", "."), 0) : 0;
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
      quantidade: quantity,
      custoTotal: cost,
      textoOriginal: message
    },
    confirmationText: buildConfirmationText(intent, quantity, cost)
  };
}

function buildConfirmationText(intent, quantity, cost) {
  const amount = quantity > 0 ? `${quantity} unidade(s)` : "a movimentacao informada";
  const costText = cost > 0 ? ` com valor de ${formatCurrency(cost)}` : "";

  if (intent === "entrada_estoque") {
    return `Confirma entrada de ${amount}${costText}?`;
  }

  if (intent === "saida_producao") {
    return `Confirma saída para producao de ${amount}?`;
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

export function buildDailySummary({ estoque = [], producoes = [], etiquetas = [], desperdicios = [], compras = [] } = {}) {
  const criticalItems = estoque.filter((item) => toNumber(item.quantidade, 0) <= toNumber(item.minimo, 0));
  const stockValue = estoque.reduce((total, item) => {
    const unitCost = toNumber(item.custoUnitario ?? item.custo ?? item.unit_cost, 0);
    return total + toNumber(item.quantidade, 0) * unitCost;
  }, 0);
  const healthPercent = estoque.length
    ? Math.round(((estoque.length - criticalItems.length) / estoque.length) * 100)
    : 100;
  const wasteCost = desperdicios.reduce((total, item) => total + toNumber(item.custoTotal ?? item.valorTotal, 0), 0);
  const purchaseCost = compras.reduce((total, item) => total + toNumber(item.valorTotal, 0), 0);

  return {
    healthPercent,
    criticalCount: criticalItems.length,
    stockValue,
    productionCount: producoes.length,
    labelCount: etiquetas.reduce((total, item) => total + Math.max(1, toNumber(item.quantidade, 1)), 0),
    wasteCost,
    purchaseCost,
    aiSummary: [
      `Seu estoque esta ${healthPercent}% saudavel.`,
      criticalItems.length ? `${criticalItems.length} item(ns) precisam de atencao.` : "Nenhum item critico no momento.",
      producoes.length ? `${producoes.length} producao(oes) registradas hoje.` : "Nenhuma producao registrada hoje.",
      purchaseCost > 0 ? `Compras do dia somam ${formatCurrency(purchaseCost)}.` : "Sem compras registradas hoje."
    ].join(" ")
  };
}
