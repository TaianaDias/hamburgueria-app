import express from "express";

let firebaseAdmin = null;
let whatsappEvolutionService = null;
const ASSISTANT_NAME = "Carioquinha";
const ASSISTANT_LABEL = "Carioquinha | Carioca's Assistente Virtual";
const GREETING_LOG_TYPE = "saudacao_carioquinha";
const MENU_LOG_TYPE = "menu_carioquinha";

function getFirebaseAdmin() {
  if (!firebaseAdmin?.firestore) {
    throw new Error("Firebase Admin não inicializado nas rotas WhatsApp.");
  }

  return firebaseAdmin;
}

function getEvolutionService() {
  if (!whatsappEvolutionService?.sendText) {
    throw new Error("Evolution Service não inicializado nas rotas WhatsApp.");
  }

  return whatsappEvolutionService;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeLookupText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return digits.startsWith("55") ? digits : `55${digits}`;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value) {
  return toNumber(value, 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 2
  });
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-");
    return `${day}/${month}/${year}`;
  }

  const date = value?.toDate instanceof Function ? value.toDate() : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  if (value?.toDate instanceof Function) {
    return value.toDate();
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getProductName(product = {}) {
  return normalizeText(product.nome || product.name || product.productName || product.produtoNome || "Produto");
}

function getCurrentStock(product = {}) {
  return toNumber(product.quantidade ?? product.stock_boxes ?? product.estoqueAtual ?? product.currentStock, 0);
}

function getMinimumStock(product = {}) {
  return toNumber(product.minimo ?? product.minimum_boxes ?? product.estoqueMinimo ?? product.minStock, 0);
}

function getProductUnit(product = {}) {
  return normalizeText(product.unidadeCompra || product.unidadeMedida || product.unidadeUso || product.unit || "un");
}

function getSupplierName(product = {}) {
  return normalizeText(
    product.fornecedorNome ||
    product.fornecedorPrincipalNome ||
    product.fornecedor ||
    product.supplier ||
    product.fornecedores?.find?.((supplier) => supplier.principal)?.nome ||
    product.fornecedores?.[0]?.nome ||
    "Fornecedor não definido"
  );
}

function getProductSearchText(product = {}) {
  return normalizeLookupText([
    product.nome,
    product.name,
    product.productName,
    product.codigoInterno,
    product.sku,
    product.codigoBarras,
    product.marca
  ].filter(Boolean).join(" "));
}

function getUnitLabel(value = "") {
  const unit = normalizeLookupText(value);

  if (["cx", "caixas"].includes(unit)) {
    return "caixa";
  }

  if (["fardos"].includes(unit)) {
    return "fardo";
  }

  if (["pacotes", "pct", "pcts"].includes(unit)) {
    return "pacote";
  }

  if (["un", "unds", "unidade", "unidades"].includes(unit)) {
    return "unidade";
  }

  if (["kgs", "quilo", "quilos"].includes(unit)) {
    return "kg";
  }

  if (["litros", "lts", "lt"].includes(unit)) {
    return "litro";
  }

  return unit || "unidade";
}

function formatUnitQuantity(quantity, unit) {
  const label = getUnitLabel(unit);
  const plural = quantity === 1 || ["kg"].includes(label)
    ? label
    : `${label}s`;
  return `${formatNumber(quantity)} ${plural}`;
}

function parseMoneyValue(text = "") {
  const normalized = normalizeText(text);
  const moneyMatch = normalized.match(/(?:r\$|rs)\s*(\d+(?:[.,]\d{1,2})?)/i)
    || normalized.match(/\bpor\s*(\d+(?:[.,]\d{1,2})?)\b/i);

  return moneyMatch ? toNumber(moneyMatch[1].replace(",", "."), 0) : 0;
}

function parseStockMovementCommand(message = "") {
  const original = normalizeText(message);
  const lookup = normalizeLookupText(original);
  const isEntry = /\b(entrou|entrada|comprei|compramos|chegou|recebi|recebemos)\b/.test(lookup);
  const isExit = /\b(saiu|saida|retirou|retirei|baixou|baixa|usou|usei)\b/.test(lookup);

  if (!isEntry && !isExit) {
    return null;
  }

  const movementMatch = lookup.match(/\b(?:entrou|entrada|comprei|compramos|chegou|recebi|recebemos|saiu|saida|retirou|retirei|baixou|baixa|usou|usei)\s+(\d+(?:[.,]\d+)?)\s*([a-z]+)?/);
  const quantity = movementMatch ? toNumber(movementMatch[1].replace(",", "."), 0) : 0;
  const unit = getUnitLabel(movementMatch?.[2] || "");

  if (quantity <= 0) {
    return {
      type: isEntry ? "stockIn" : "stockOut",
      valid: false,
      reason: "missing_quantity"
    };
  }

  const packageMatch = lookup.match(/(?:com|c\/)\s*(\d+(?:[.,]\d+)?)\s*(?:unidades|unidade|unds|un)\s*(?:cada|por|em cada)?/);
  const unitsPerPackage = packageMatch ? toNumber(packageMatch[1].replace(",", "."), 0) : 0;
  const totalCost = isEntry ? parseMoneyValue(original) : 0;
  let productSearch = lookup
    .replace(/\b(?:entrou|entrada|comprei|compramos|chegou|recebi|recebemos|saiu|saida|retirou|retirei|baixou|baixa|usou|usei)\b/, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(?:caixas?|cx|fardos?|pacotes?|pct|pcts|unidades?|unds?|un|kg|kgs?|quilos?|litros?|lts?|lt)?/, " ")
    .replace(/(?:de|do|da|dos|das)\s+/, " ")
    .replace(/(?:com|c\/)\s*\d+(?:[.,]\d+)?\s*(?:unidades|unidade|unds|un)\s*(?:cada|por|em cada)?/g, " ")
    .replace(/(?:r\$|rs)\s*\d+(?:[.,]\d{1,2})?/g, " ")
    .replace(/\bpor\s*r?\s*\d+(?:[.,]\d{1,2})?\b/g, " ")
    .replace(/\bpor\s*\d+(?:[.,]\d{1,2})?\b/g, " ")
    .replace(/\b(?:para|pra)\s+(?:producao|produção|cozinha|estoque)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  productSearch = productSearch.replace(/^(de|do|da|dos|das)\s+/, "").trim();

  return {
    type: isEntry ? "stockIn" : "stockOut",
    valid: true,
    productSearch,
    quantity,
    unit,
    unitsPerPackage,
    totalUnits: unitsPerPackage > 0 ? quantity * unitsPerPackage : 0,
    totalCost,
    reason: isEntry ? "Entrada via WhatsApp" : "Produção",
    originalMessage: original
  };
}

function scoreProductMatch(commandText, product = {}) {
  const searchText = normalizeLookupText(commandText);
  const productText = getProductSearchText(product);

  if (!searchText || !productText) {
    return 0;
  }

  if (productText === searchText) {
    return 100;
  }

  if (productText.includes(searchText)) {
    return 80;
  }

  if (searchText.includes(productText)) {
    return 70;
  }

  const terms = searchText.split(" ").filter((term) => term.length >= 3);
  const hits = terms.filter((term) => productText.includes(term)).length;

  return terms.length ? Math.round((hits / terms.length) * 60) : 0;
}

function findBestStockProduct(items = [], commandText = "") {
  const matches = items
    .map((item) => ({
      item,
      score: scoreProductMatch(commandText, item)
    }))
    .filter((match) => match.score >= 35)
    .sort((left, right) => right.score - left.score);

  return {
    product: matches[0]?.item || null,
    score: matches[0]?.score || 0,
    suggestions: matches.slice(0, 4).map((match) => getProductName(match.item))
  };
}

function buildPendingMovementReply(command = {}) {
  const isEntry = command.type === "stockIn";
  const lines = [
    isEntry ? "📦 *Confirma entrada de estoque?*" : "📤 *Confirma saída de estoque?*",
    "",
    `Produto: ${command.productName}`,
    `Quantidade: ${formatUnitQuantity(command.quantity, command.unit)}`,
    `Estoque atual: ${formatNumber(command.previousStock)}`,
    `Estoque após confirmar: ${formatNumber(command.nextStock)}`
  ];

  if (isEntry && command.unitsPerPackage > 0) {
    lines.push(`Conversão informada: ${formatNumber(command.unitsPerPackage)} unidades por ${getUnitLabel(command.unit)}`);
    lines.push(`Total interno: ${formatNumber(command.totalUnits)} unidades`);
  }

  if (isEntry && command.totalCost > 0) {
    lines.push(`Valor total: R$ ${command.totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    lines.push(`Custo por ${getUnitLabel(command.unit)}: R$ ${(command.totalCost / Math.max(1, command.quantity)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }

  lines.push("", "Responda *SIM* para confirmar ou *NÃO* para cancelar.");
  return lines.join("\n");
}

async function findPendingWhatsAppCommand(phone) {
  const snapshot = await getFirebaseAdmin().firestore()
    .collection("comandosWhatsApp")
    .where("telefone", "==", normalizePhone(phone))
    .where("statusConfirmacao", "==", "pendente")
    .limit(10)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const pending = snapshot.docs
    .map((document) => ({
      id: document.id,
      ...document.data()
    }))
    .sort((left, right) => {
      const leftTime = left.criadoEm?.toMillis?.() || Date.parse(left.criadoEmIso || "") || 0;
      const rightTime = right.criadoEm?.toMillis?.() || Date.parse(right.criadoEmIso || "") || 0;
      return rightTime - leftTime;
    });

  return pending[0] || null;
}

function isConfirmationMessage(message = "") {
  const text = normalizeLookupText(message);
  return ["sim", "s", "confirmo", "confirmar", "confirma"].includes(text);
}

function isCancellationMessage(message = "") {
  const text = normalizeLookupText(message);
  return ["nao", "não", "n", "cancelar", "cancela"].includes(text);
}

function isGreetingMessage(message = "") {
  const text = normalizeLookupText(message);
  return ["oi", "ola", "olá", "menu", "inicio", "início", "iniciar", "bom dia", "boa tarde", "boa noite"].includes(text);
}

function isMenuMessage(message = "") {
  return ["menu", "inicio", "início", "iniciar"].includes(normalizeLookupText(message));
}

function buildCarioquinhaMenuReply() {
  return [
    `Olá! Eu sou o ${ASSISTANT_NAME}, assistente virtual da Carioca's. 🍔`,
    "Estou aqui para te ajudar!",
    "",
    "Digite a opção desejada:",
    "1️⃣ Consultar estoque",
    "2️⃣ Registrar entrada de produto",
    "3️⃣ Registrar saída para produção",
    "4️⃣ Ver itens em reposição",
    "5️⃣ Falar com um administrador",
    "",
    "Em que posso ajudá-lo(a)?"
  ].join("\n");
}

function buildCarioquinhaFallbackReply() {
  return [
    "Desculpe, não entendi sua solicitação. 😊",
    "Digite uma das opções do menu ou envie “menu” para começar."
  ].join("\n");
}

async function cancelPendingWhatsAppCommand(command, profile = {}) {
  const db = getFirebaseAdmin().firestore();

  await db.collection("comandosWhatsApp").doc(command.id).set({
    statusConfirmacao: "cancelado",
    canceladoPor: profile.email || profile.nome || command.telefone || "",
    canceladoEm: getFirebaseAdmin().firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return "Comando cancelado. Nenhuma alteração foi feita no estoque.";
}

async function createPendingStockMovement({ incoming, authorization, parsedCommand, product }) {
  const db = getFirebaseAdmin().firestore();
  const currentStock = getCurrentStock(product);
  const minimumStock = getMinimumStock(product);
  const isEntry = parsedCommand.type === "stockIn";
  const nextStock = isEntry
    ? currentStock + parsedCommand.quantity
    : currentStock - parsedCommand.quantity;

  if (!isEntry && nextStock < 0) {
    return {
      handled: true,
      reply: [
        "Não consegui registrar essa saída.",
        "",
        `Produto: ${getProductName(product)}`,
        `Estoque atual: ${formatNumber(currentStock)}`,
        `Quantidade solicitada: ${formatUnitQuantity(parsedCommand.quantity, parsedCommand.unit)}`,
        "",
        "O saldo ficaria negativo. Confira a quantidade e tente novamente."
      ].join("\n")
    };
  }

  const payload = {
    telefone: incoming.phone,
    mensagem: incoming.text,
    resposta: "",
    intencao: parsedCommand.type,
    origem: "webhook_evolution",
    statusConfirmacao: "pendente",
    autorizado: true,
    usuarioId: authorization.profile?.id || "",
    empresaId: authorization.profile?.empresaId || "",
    lojaId: authorization.profile?.lojaId || "",
    produtoId: product.id,
    produtoNome: getProductName(product),
    quantidade: parsedCommand.quantity,
    unidade: parsedCommand.unit,
    unidadesPorEmbalagem: parsedCommand.unitsPerPackage || 0,
    totalUnidades: parsedCommand.totalUnits || 0,
    custoTotal: parsedCommand.totalCost || 0,
    estoqueAnterior: currentStock,
    estoquePrevisto: nextStock,
    estoqueMinimo: minimumStock,
    fornecedor: getSupplierName(product),
    responsavel: authorization.profile?.email || authorization.profile?.nome || incoming.phone,
    criadoEm: getFirebaseAdmin().firestore.FieldValue.serverTimestamp(),
    criadoEmIso: new Date().toISOString()
  };
  const reply = buildPendingMovementReply({
    type: parsedCommand.type,
    productName: getProductName(product),
    quantity: parsedCommand.quantity,
    unit: parsedCommand.unit,
    unitsPerPackage: parsedCommand.unitsPerPackage,
    totalUnits: parsedCommand.totalUnits,
    totalCost: parsedCommand.totalCost,
    previousStock: currentStock,
    nextStock
  });

  const ref = await db.collection("comandosWhatsApp").add({
    ...payload,
    resposta: reply
  });

  return {
    handled: true,
    commandId: ref.id,
    reply
  };
}

async function applyPendingStockMovement(command, profile = {}) {
  const admin = getFirebaseAdmin();
  const db = admin.firestore();
  const productRef = db.collection("estoque").doc(command.produtoId);
  const commandRef = db.collection("comandosWhatsApp").doc(command.id);
  const historyRef = db.collection("historico").doc();
  const auditRef = db.collection("auditoriaOperacional").doc();
  const nowIso = new Date().toISOString();
  let result;

  await db.runTransaction(async (transaction) => {
    const [productSnapshot, commandSnapshot] = await Promise.all([
      transaction.get(productRef),
      transaction.get(commandRef)
    ]);

    if (!productSnapshot.exists) {
      throw new Error("Produto não encontrado no estoque.");
    }

    const freshCommand = commandSnapshot.data() || {};

    if (freshCommand.statusConfirmacao !== "pendente") {
      throw new Error("Esse comando já foi processado ou cancelado.");
    }

    const product = {
      id: productSnapshot.id,
      ...productSnapshot.data()
    };
    const previousStock = getCurrentStock(product);
    const quantity = Math.max(0, toNumber(command.quantidade, 0));
    const isEntry = command.intencao === "stockIn";
    const nextStock = isEntry ? previousStock + quantity : previousStock - quantity;

    if (!isEntry && nextStock < 0) {
      throw new Error(`Saldo insuficiente. Estoque atual: ${formatNumber(previousStock)}.`);
    }

    const unitCost = isEntry && toNumber(command.custoTotal, 0) > 0 && quantity > 0
      ? toNumber(command.custoTotal, 0) / quantity
      : toNumber(product.custoUnitario ?? product.custo ?? product.unit_cost, 0);
    const updates = {
      quantidade: nextStock,
      stock_boxes: nextStock,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
    };

    if (isEntry && toNumber(command.unidadesPorEmbalagem, 0) > 0) {
      updates.conversao = toNumber(command.unidadesPorEmbalagem, 0);
      updates.units_per_box = toNumber(command.unidadesPorEmbalagem, 0);
    }

    if (isEntry && toNumber(command.custoTotal, 0) > 0) {
      updates.last_entry_total_cost = toNumber(command.custoTotal, 0);
      updates.custoCompra = toNumber(command.custoTotal, 0) / Math.max(1, quantity);
      updates.last_box_price = updates.custoCompra;
      updates.custoUnitario = unitCost;
      updates.unit_cost = unitCost;
      updates.custo = unitCost;
    }

    transaction.update(productRef, updates);
    transaction.set(historyRef, {
      tipo: isEntry ? "entrada" : "saida",
      origem: "whatsapp",
      itemId: product.id,
      itemNome: getProductName(product),
      unidadeMovimentada: command.unidade || getProductUnit(product),
      quantidadeMovimentada: quantity,
      caixas: quantity,
      estoqueAnterior: previousStock,
      estoqueCaixas: nextStock,
      valorTotalEntrada: isEntry ? toNumber(command.custoTotal, 0) : 0,
      unidadesPorCaixa: toNumber(command.unidadesPorEmbalagem, 0),
      custoUnitario: unitCost,
      responsavel: command.responsavel || profile.email || profile.nome || command.telefone || "",
      comandoWhatsAppId: command.id,
      data: admin.firestore.FieldValue.serverTimestamp()
    });
    transaction.set(auditRef, {
      tipo: isEntry ? "whatsapp_entrada_estoque_confirmada" : "whatsapp_saida_estoque_confirmada",
      origem: "whatsapp",
      actor: command.responsavel || profile.email || profile.nome || command.telefone || "",
      telefone: command.telefone || "",
      produtoId: product.id,
      produtoNome: getProductName(product),
      quantidadeAnterior: previousStock,
      quantidadeNova: nextStock,
      quantidadeMovimentada: quantity,
      empresaId: command.empresaId || profile.empresaId || "",
      lojaId: command.lojaId || profile.lojaId || "",
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      criadoEmIso: nowIso
    });
    transaction.update(commandRef, {
      statusConfirmacao: "confirmado",
      estoqueAnteriorProcessado: previousStock,
      estoqueAtualProcessado: nextStock,
      confirmadoEm: admin.firestore.FieldValue.serverTimestamp(),
      confirmadoEmIso: nowIso
    });

    result = {
      isEntry,
      product,
      previousStock,
      nextStock,
      quantity,
      unit: command.unidade || getProductUnit(product),
      minimumStock: getMinimumStock(product),
      supplier: getSupplierName(product)
    };
  });

  await Promise.allSettled([
    getEvolutionService().sendAdminStockAlert(result.isEntry ? "stockIn" : "stockOut", {
      productName: getProductName(result.product),
      quantity: result.quantity,
      unit: result.unit,
      currentStock: result.nextStock,
      supplier: result.supplier,
      responsibleUser: command.responsavel || profile.email || profile.nome || command.telefone || "",
      reason: result.isEntry ? "WhatsApp" : "Produção",
      empresaId: command.empresaId || profile.empresaId || "",
      lojaId: command.lojaId || profile.lojaId || "",
      date: new Date()
    }),
    result.nextStock <= result.minimumStock
      ? getEvolutionService().sendAdminStockAlert("lowStock", {
        productName: getProductName(result.product),
        currentStock: result.nextStock,
        minimumStock: result.minimumStock,
        supplier: result.supplier,
        responsibleUser: command.responsavel || profile.email || profile.nome || command.telefone || "",
        empresaId: command.empresaId || profile.empresaId || "",
        lojaId: command.lojaId || profile.lojaId || "",
        date: new Date()
      })
      : Promise.resolve()
  ]);

  const replyLines = [
    result.isEntry ? "✅ Entrada registrada com sucesso." : "✅ Saída registrada com sucesso.",
    "",
    `Produto: ${getProductName(result.product)}`,
    `Quantidade: ${formatUnitQuantity(result.quantity, result.unit)}`,
    `Estoque anterior: ${formatNumber(result.previousStock)}`,
    `Estoque atual: ${formatNumber(result.nextStock)}`
  ];

  if (result.nextStock <= result.minimumStock) {
    replyLines.push("", "⚠️ Atenção: este produto está no estoque mínimo ou abaixo dele.");
  }

  return replyLines.join("\n");
}

async function handleStockMovementMessage({ incoming, authorization }) {
  const pendingCommand = await findPendingWhatsAppCommand(incoming.phone);

  if (pendingCommand && isConfirmationMessage(incoming.text)) {
    return {
      handled: true,
      reply: await applyPendingStockMovement(pendingCommand, authorization.profile || {})
    };
  }

  if (pendingCommand && isCancellationMessage(incoming.text)) {
    return {
      handled: true,
      reply: await cancelPendingWhatsAppCommand(pendingCommand, authorization.profile || {})
    };
  }

  if (isConfirmationMessage(incoming.text) || isCancellationMessage(incoming.text)) {
    return {
      handled: true,
      reply: "Não encontrei nenhum comando pendente para confirmar. Envie uma entrada ou saída de estoque primeiro."
    };
  }

  const parsedCommand = parseStockMovementCommand(incoming.text);

  if (!parsedCommand) {
    return { handled: false };
  }

  if (!parsedCommand.valid || !parsedCommand.productSearch) {
    return {
      handled: true,
      reply: [
        "Não consegui entender a movimentação.",
        "",
        "Exemplos:",
        "- Entrou 2 caixas de pão brioche com 96 unidades cada por R$142",
        "- Saiu 8 unidades de cheddar para produção"
      ].join("\n")
    };
  }

  const items = await loadStockItems();
  const match = findBestStockProduct(items, parsedCommand.productSearch);

  if (!match.product) {
    const suggestions = match.suggestions.length
      ? ["", "Talvez você quis dizer:", ...match.suggestions.map((name) => `- ${name}`)]
      : [];

    return {
      handled: true,
      reply: [
        "Não encontrei esse produto no estoque cadastrado.",
        `Busca feita: ${parsedCommand.productSearch}`,
        "",
        "Cadastre o insumo primeiro ou envie o nome mais parecido com o cadastro.",
        ...suggestions
      ].join("\n")
    };
  }

  return createPendingStockMovement({
    incoming,
    authorization,
    parsedCommand,
    product: match.product
  });
}

function extractTextFromEvolutionMessage(message = {}) {
  return normalizeText(
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.title ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  );
}

function extractIncomingMessage(body = {}) {
  const data = body.data || body;
  const key = data.key || body.key || {};
  const message = data.message || body.message || {};
  const remoteJid = normalizeText(key.remoteJid || data.remoteJid || data.sender || data.from || body.sender || body.from || "");
  const fromMe = Boolean(key.fromMe || data.fromMe || body.fromMe);
  const phone = normalizePhone(remoteJid || data.sender || body.sender || body.from);
  const text = extractTextFromEvolutionMessage(message) || normalizeText(data.text || data.body || body.text || body.messageText || body.message);
  const event = normalizeText(body.event || data.event || "");

  return {
    event,
    phone,
    text,
    fromMe,
    remoteJid,
    pushName: normalizeText(data.pushName || body.pushName || "")
  };
}

function toHttpStatus(error) {
  if (Number.isInteger(error?.statusCode)) {
    return error.statusCode;
  }

  if (error?.code === "evolution_offline") {
    return 502;
  }

  if (error?.code === "instance_not_connected") {
    return 409;
  }

  if (error?.code === "invalid_phone") {
    return 400;
  }

  return 500;
}

function sendRouteError(res, error) {
  return res.status(toHttpStatus(error)).json({
    ok: false,
    success: false,
    code: error?.code || "whatsapp_error",
    erro: error?.message || "Não foi possível concluir a operação no WhatsApp.",
    details: error?.details || null
  });
}

function getActor(req) {
  return req.profile?.nome || req.profile?.email || req.user?.email || req.body?.responsibleUser || req.body?.responsavel || "";
}

function enrichPayload(req) {
  return {
    ...(req.body || {}),
    responsibleUser: req.body?.responsibleUser || req.body?.responsavel || getActor(req),
    empresaId: req.body?.empresaId || req.profile?.empresaId || "",
    lojaId: req.body?.lojaId || req.profile?.lojaId || ""
  };
}

function getAllowedPhonesFromEnv() {
  return String(process.env.WHATSAPP_ALLOWED_PHONES || "")
    .split(/[,\s;|]+/)
    .map(normalizePhone)
    .filter(Boolean);
}

async function findAuthorizedContact(phone) {
  const normalizedPhone = normalizePhone(phone);
  const adminPhone = normalizePhone(process.env.ADMIN_WHATSAPP || process.env.WHATSAPP_ADMIN_PHONE || "");

  if (!normalizedPhone) {
    return { authorized: false, reason: "missing_phone" };
  }

  if (adminPhone && normalizedPhone === adminPhone) {
    return {
      authorized: true,
      source: "admin_env",
      profile: {
        nome: "Administrador",
        telefone: normalizedPhone,
        tipo: "admin",
        perfilPrincipal: "admin"
      }
    };
  }

  if (getAllowedPhonesFromEnv().includes(normalizedPhone)) {
    return {
      authorized: true,
      source: "allowed_env",
      profile: {
        nome: "Contato autorizado",
        telefone: normalizedPhone,
        tipo: "operacao"
      }
    };
  }

  const usersSnapshot = await getFirebaseAdmin().firestore().collection("usuarios").get();
  const userDocument = usersSnapshot.docs.find((document) => {
    const user = document.data() || {};
    return [
      user.telefone,
      user.whatsapp,
      user.phone,
      user.celular
    ].map(normalizePhone).filter(Boolean).includes(normalizedPhone);
  });

  if (!userDocument) {
    return { authorized: false, reason: "not_registered" };
  }

  const profile = {
    id: userDocument.id,
    ...userDocument.data()
  };

  if (profile.ativo === false) {
    return { authorized: false, reason: "inactive_user", profile };
  }

  return {
    authorized: true,
    source: "usuarios",
    profile
  };
}

async function loadStockItems() {
  const snapshot = await getFirebaseAdmin().firestore().collection("estoque").get();
  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data()
  }));
}

function buildLowStockReply(items = []) {
  const lowStockItems = items
    .filter((item) => getMinimumStock(item) > 0 && getCurrentStock(item) <= getMinimumStock(item))
    .sort((left, right) => (getCurrentStock(left) - getMinimumStock(left)) - (getCurrentStock(right) - getMinimumStock(right)))
    .slice(0, 8);

  if (!lowStockItems.length) {
    return "Seu estoque não possui itens abaixo do mínimo neste momento.";
  }

  return [
    "⚠️ *Itens abaixo do mínimo*",
    "",
    ...lowStockItems.map((item) => {
      const unit = getProductUnit(item);
      return `- ${getProductName(item)}: ${formatNumber(getCurrentStock(item))} ${unit} | mínimo ${formatNumber(getMinimumStock(item))} | ${getSupplierName(item)}`;
    }),
    "",
    "Ação recomendada: priorizar reposição dos itens acima."
  ].join("\n");
}

function buildPurchaseSuggestionReply(items = []) {
  const suggestions = items
    .filter((item) => getMinimumStock(item) > 0 && getCurrentStock(item) <= getMinimumStock(item))
    .sort((left, right) => (getCurrentStock(left) - getMinimumStock(left)) - (getCurrentStock(right) - getMinimumStock(right)))
    .slice(0, 8);

  if (!suggestions.length) {
    return "Hoje não encontrei sugestão urgente de compra. O estoque está dentro dos limites mínimos cadastrados.";
  }

  const groupedBySupplier = suggestions.reduce((groups, item) => {
    const supplier = getSupplierName(item);
    const current = getCurrentStock(item);
    const minimum = getMinimumStock(item);
    const ideal = toNumber(item.maximo ?? item.estoqueIdeal ?? item.idealStock, Math.max(minimum * 2, minimum + 1));
    const quantity = Math.max(1, Math.ceil(ideal - current));
    const unit = getProductUnit(item);

    if (!groups.has(supplier)) {
      groups.set(supplier, []);
    }

    groups.get(supplier).push(`- ${getProductName(item)}: comprar ${formatNumber(quantity)} ${unit}`);
    return groups;
  }, new Map());

  const lines = ["🛒 *Sugestão de compra para hoje*", ""];

  for (const [supplier, products] of groupedBySupplier.entries()) {
    lines.push(`*${supplier}*`, ...products, "");
  }

  lines.push("Mensagem gerada automaticamente pelo Carioca's Estoque.");
  return lines.join("\n");
}

function buildStockSummaryReply(items = []) {
  const totalItems = items.length;
  const lowStockCount = items.filter((item) => getMinimumStock(item) > 0 && getCurrentStock(item) <= getMinimumStock(item)).length;
  const noSupplierCount = items.filter((item) => getSupplierName(item) === "Fornecedor não definido").length;
  const emptyCount = items.filter((item) => getCurrentStock(item) <= 0).length;
  const health = totalItems ? Math.round(((totalItems - lowStockCount) / totalItems) * 100) : 100;

  return [
    "📊 *Resumo do estoque*",
    "",
    `Saúde do estoque: ${health}%`,
    `Itens cadastrados: ${totalItems}`,
    `Itens abaixo do mínimo: ${lowStockCount}`,
    `Itens zerados: ${emptyCount}`,
    `Sem fornecedor: ${noSupplierCount}`,
    "",
    lowStockCount ? "Digite *o que preciso comprar hoje?* para ver a lista de reposição." : "Nenhum item crítico no momento."
  ].join("\n");
}

function buildExpiringReply(items = []) {
  const now = new Date();
  const limit = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const expiring = items
    .map((item) => ({
      item,
      date: parseDateValue(item.validadeOriginal || item.validade || item.expirationDate)
    }))
    .filter(({ date }) => date && date <= limit)
    .sort((left, right) => left.date - right.date)
    .slice(0, 8);

  if (!expiring.length) {
    return "Não encontrei produtos vencendo nos próximos 3 dias com validade cadastrada.";
  }

  return [
    "⏳ *Produtos vencendo*",
    "",
    ...expiring.map(({ item, date }) => `- ${getProductName(item)}: ${formatDate(date)} | estoque ${formatNumber(getCurrentStock(item))} ${getProductUnit(item)}`)
  ].join("\n");
}

function buildHelpReply() {
  return buildCarioquinhaMenuReply();

  return [
    "Olá! Eu sou o robô operacional do Carioca's Estoque.",
    "",
    "Você pode me mandar:",
    "- O que preciso comprar hoje?",
    "- Quais itens estão baixos?",
    "- Resumo do estoque",
    "- Produtos vencendo",
    "- Ajuda",
    "",
    "Em breve também vou confirmar entradas e saídas de estoque pelo WhatsApp."
  ].join("\n");
}

async function buildOperationalReply(message) {
  const text = normalizeLookupText(message);
  const items = await loadStockItems();

  if (!text || text.includes("ajuda") || isGreetingMessage(message)) {
    return buildHelpReply();
  }

  if (text === "1") {
    return buildStockSummaryReply(items);
  }

  if (text === "2") {
    return "Para registrar entrada, envie por exemplo: Entrou 2 caixas de pão brioche com 96 unidades cada por R$142.";
  }

  if (text === "3") {
    return "Para registrar saída, envie por exemplo: Saiu 8 unidades de cheddar para produção.";
  }

  if (text === "4") {
    return buildLowStockReply(items);
  }

  if (text === "5") {
    return "Certo. Um administrador será avisado para acompanhar sua solicitação.";
  }

  if (text.includes("comprar") || text.includes("compra") || text.includes("reposicao") || text.includes("pedido")) {
    return buildPurchaseSuggestionReply(items);
  }

  if (text.includes("baixo") || text.includes("minimo") || text.includes("critico") || text.includes("ruptura")) {
    return buildLowStockReply(items);
  }

  if (text.includes("resumo") || text.includes("dashboard") || text.includes("estoque")) {
    return buildStockSummaryReply(items);
  }

  if (text.includes("venc")) {
    return buildExpiringReply(items);
  }

  return buildCarioquinhaFallbackReply();

  return [
    "Recebi sua mensagem, mas ainda não entendi o comando.",
    "",
    "Digite *ajuda* para ver os comandos disponíveis."
  ].join("\n");
}

export function registerWhatsAppRoutes(app, {
  evolutionService,
  requireAuthenticated,
  admin
} = {}) {
  if (!app || !evolutionService || !requireAuthenticated || !admin?.firestore) {
    throw new Error("registerWhatsAppRoutes exige app, evolutionService, requireAuthenticated e Firebase Admin.");
  }

  firebaseAdmin = admin;
  whatsappEvolutionService = evolutionService;

  const router = express.Router();

  router.use(requireAuthenticated);

  router.get("/status", async (req, res) => {
    try {
      const state = await evolutionService.getConnectionState();
      return res.json({
        ok: true,
        instance: state?.instance || state,
        connected: String(state?.instance?.state || state?.state || "").toLowerCase() === "open",
        raw: state
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.get("/qrcode", async (req, res) => {
    try {
      let qrCode;

      try {
        qrCode = await evolutionService.getQrCode();
      } catch (error) {
        if (error?.code !== "instance_not_found") {
          throw error;
        }

        await evolutionService.createInstance();
        qrCode = await evolutionService.getQrCode();
      }

      return res.json({
        ok: true,
        qrcode: qrCode,
        pairingCode: qrCode?.pairingCode || "",
        code: qrCode?.code || ""
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.post("/configure-webhook", async (req, res) => {
    try {
      const result = await evolutionService.configureWebhook(req.body?.webhookUrl || req.body?.url || "");

      return res.json({
        ok: true,
        configured: true,
        result
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.post("/send-test", async (req, res) => {
    const { phone, message } = req.body || {};

    try {
      const result = await evolutionService.sendText(phone, message, {
        tipo: "teste_integracao",
        usuarioResponsavel: getActor(req),
        empresaId: req.profile?.empresaId || "",
        lojaId: req.profile?.lojaId || ""
      });

      return res.json({
        ok: true,
        success: true,
        ...result
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.post("/stock-entry", async (req, res) => {
    try {
      const result = await evolutionService.sendStockEntryAlert(enrichPayload(req));

      return res.json({
        ok: true,
        success: true,
        ...result
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.post("/stock-exit", async (req, res) => {
    try {
      const result = await evolutionService.sendStockExitAlert(enrichPayload(req));

      return res.json({
        ok: true,
        success: true,
        ...result
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.post("/low-stock", async (req, res) => {
    try {
      const result = await evolutionService.sendLowStockAlert(enrichPayload(req));

      return res.json({
        ok: true,
        success: true,
        ...result
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  router.post("/supplier-order-suggestion", async (req, res) => {
    try {
      const result = await evolutionService.sendSupplierOrderSuggestion(enrichPayload(req));

      return res.json({
        ok: true,
        success: true,
        ...result
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });

  app.use("/whatsapp", router);

  app.post("/webhook/evolution", async (req, res) => {
    const expectedToken = String(process.env.EVOLUTION_WEBHOOK_TOKEN || process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();
    const receivedToken = String(
      req.headers["x-webhook-token"] ||
      req.query?.token ||
      String(req.headers.authorization || "").replace(/^Bearer\s+/i, "")
    ).trim();

    if (expectedToken && receivedToken !== expectedToken) {
      return res.status(401).json({ ok: false, erro: "Webhook Evolution não autorizado." });
    }

    try {
      const incoming = extractIncomingMessage(req.body || {});

      await evolutionService.saveLog({
        tipo: "webhook_evolution",
        telefone: incoming.phone,
        mensagem: incoming.text || incoming.event || "Evento recebido da Evolution API",
        status: "recebido",
        metadata: req.body || {}
      });

      if (incoming.fromMe) {
        return res.json({
          ok: true,
          received: true,
          ignored: true,
          reason: "from_me"
        });
      }

      if (!incoming.text) {
        return res.json({
          ok: true,
          received: true,
          ignored: true,
          reason: "empty_message"
        });
      }

      const authorization = await findAuthorizedContact(incoming.phone);

      if (!authorization.authorized) {
        const unauthorizedMessage = [
          "Número não autorizado para acessar o Carioca's Estoque.",
          "Solicite ao administrador o cadastro do seu WhatsApp na aba Funcionários."
        ].join("\n");

        await evolutionService.sendText(incoming.phone, unauthorizedMessage, {
          tipo: "resposta_automatica_nao_autorizado",
          usuarioResponsavel: "webhook_evolution",
          metadata: {
            reason: authorization.reason,
            incoming
          }
        }).catch((error) => {
          console.warn("Não foi possível responder número não autorizado.", error);
        });

        return res.json({
          ok: true,
          received: true,
          replied: false,
          authorized: false,
          reason: authorization.reason
        });
      }

      const movementResult = await handleStockMovementMessage({
        incoming,
        authorization
      });
      const reply = movementResult.handled
        ? movementResult.reply
        : await buildOperationalReply(incoming.text);
      const automaticReplyType = isGreetingMessage(incoming.text)
        ? (isMenuMessage(incoming.text) ? MENU_LOG_TYPE : GREETING_LOG_TYPE)
        : "resposta_automatica";
      const sendResult = await evolutionService.sendText(incoming.phone, reply, {
        tipo: movementResult.handled ? "resposta_movimentacao_estoque" : automaticReplyType,
        usuarioResponsavel: authorization.profile?.email || authorization.profile?.nome || incoming.phone,
        empresaId: authorization.profile?.empresaId || "",
        lojaId: authorization.profile?.lojaId || "",
        metadata: {
          incoming,
          authorizationSource: authorization.source
        }
      });

      await admin.firestore().collection("comandosWhatsApp").add({
        telefone: incoming.phone,
        mensagem: incoming.text,
        resposta: reply,
        intencao: normalizeLookupText(incoming.text),
        origem: "webhook_evolution",
        statusConfirmacao: "respondido",
        autorizado: true,
        usuarioId: authorization.profile?.id || "",
        empresaId: authorization.profile?.empresaId || "",
        lojaId: authorization.profile?.lojaId || "",
        criadoEm: admin.firestore.FieldValue.serverTimestamp()
      }).catch((error) => {
        console.warn("Não foi possível salvar comando WhatsApp respondido.", error);
      });

      return res.json({
        ok: true,
        received: true,
        replied: true,
        phone: incoming.phone,
        providerMessageId: sendResult.providerMessageId || ""
      });
    } catch (error) {
      return sendRouteError(res, error);
    }
  });
}
