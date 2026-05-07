import express from "express";

let firebaseAdmin = null;

function getFirebaseAdmin() {
  if (!firebaseAdmin?.firestore) {
    throw new Error("Firebase Admin não inicializado nas rotas WhatsApp.");
  }

  return firebaseAdmin;
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

  if (!text || text.includes("ajuda") || text.includes("menu") || text.includes("oi") || text.includes("ola")) {
    return buildHelpReply();
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

      const reply = await buildOperationalReply(incoming.text);
      const sendResult = await evolutionService.sendText(incoming.phone, reply, {
        tipo: "resposta_automatica",
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
