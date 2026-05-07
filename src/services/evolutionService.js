const WHATSAPP_LOG_COLLECTION = "whatsapp_logs";
const DEFAULT_INSTANCE = "cariocas-estoque";
const DEFAULT_BASE_URL = "http://localhost:8080";
const DEFAULT_TIMEOUT_MS = 12000;
const FIRESTORE_LOG_TIMEOUT_MS = 4000;
const WEBHOOK_EVENTS = Object.freeze([
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "MESSAGES_UPSERT",
  "SEND_MESSAGE"
]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return digits.startsWith("55") ? digits : `55${digits}`;
}

function validatePhone(value) {
  const phone = normalizePhone(value);

  if (!/^55\d{10,11}$/.test(phone)) {
    throw createServiceError(
      "Número de WhatsApp inválido. Use DDI + DDD + número, por exemplo 5521999999999.",
      400,
      "invalid_phone"
    );
  }

  return phone;
}

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(safeDate);
}

function formatQuantity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
    : "-";
}

function createServiceError(message, statusCode = 500, code = "evolution_error", details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    })
  ]);
}

function getEvolutionConfig() {
  return {
    baseUrl: normalizeText(process.env.EVOLUTION_BASE_URL || process.env.EVOLUTION_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    apiKey: normalizeText(
      process.env.EVOLUTION_API_KEY ||
      process.env.AUTHENTICATION_API_KEY ||
      process.env.EVOLUTION_API_TOKEN ||
      process.env.WHATSAPP_TOKEN
    ),
    instance: normalizeText(process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || process.env.WHATSAPP_INSTANCE_ID || DEFAULT_INSTANCE),
    instanceToken: normalizeText(process.env.EVOLUTION_INSTANCE_TOKEN || process.env.WHATSAPP_INSTANCE_TOKEN || ""),
    adminWhatsapp: normalizePhone(process.env.ADMIN_WHATSAPP || process.env.WHATSAPP_ADMIN_PHONE || ""),
    webhookUrl: normalizeText(process.env.EVOLUTION_WEBHOOK_URL || process.env.WHATSAPP_WEBHOOK_URL || ""),
    timeoutMs: Number(process.env.EVOLUTION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  };
}

function buildWebhookUrl(value = "") {
  const rawUrl = normalizeText(value);
  const webhookToken = normalizeText(process.env.EVOLUTION_WEBHOOK_TOKEN || process.env.WHATSAPP_WEBHOOK_TOKEN || "");

  if (!rawUrl || !webhookToken) {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl);

    if (!url.searchParams.has("token")) {
      url.searchParams.set("token", webhookToken);
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

function getProviderMessageId(payload = {}) {
  return payload?.key?.id || payload?.messageId || payload?.id || payload?.providerMessageId || "";
}

function isConnectionOpen(payload = {}) {
  const state = String(
    payload?.instance?.state ||
    payload?.instance?.status ||
    payload?.state ||
    payload?.status ||
    ""
  ).toLowerCase();

  return ["open", "connected", "online"].includes(state);
}

async function parseEvolutionResponse(response) {
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

export function createEvolutionService({ admin, logger = console } = {}) {
  if (!admin?.firestore) {
    throw new Error("Firebase Admin é obrigatório para registrar logs do WhatsApp.");
  }

  async function saveLog(payload = {}) {
    const now = new Date();
    const logPayload = {
      tipo: normalizeText(payload.tipo || payload.type || "whatsapp"),
      telefone: normalizePhone(payload.telefone || payload.phone || ""),
      mensagem: normalizeText(payload.mensagem || payload.message || ""),
      status: normalizeText(payload.status || "pendente"),
      erro: normalizeText(payload.erro || payload.error || ""),
      dataCriacao: admin.firestore.FieldValue.serverTimestamp(),
      dataCriacaoIso: now.toISOString(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      timestampIso: now.toISOString(),
      usuarioResponsavel: normalizeText(payload.usuarioResponsavel || payload.responsavel || ""),
      empresaId: normalizeText(payload.empresaId || ""),
      lojaId: normalizeText(payload.lojaId || ""),
      provider: "evolution",
      providerMessageId: normalizeText(payload.providerMessageId || ""),
      metadata: payload.metadata || {}
    };

    try {
      await withTimeout(
        admin.firestore().collection(WHATSAPP_LOG_COLLECTION).add(logPayload),
        FIRESTORE_LOG_TIMEOUT_MS,
        "Tempo limite ao salvar log do WhatsApp no Firestore."
      );
    } catch (error) {
      logger.warn("Não foi possível salvar log do WhatsApp no Firestore.", error);
    }

    return logPayload;
  }

  async function requestEvolution(endpoint, options = {}) {
    const config = getEvolutionConfig();

    if (!config.baseUrl) {
      throw createServiceError("EVOLUTION_BASE_URL não configurado.", 500, "missing_base_url");
    }

    if (!config.apiKey) {
      throw createServiceError("EVOLUTION_API_KEY não configurado.", 500, "missing_api_key");
    }

    if (!config.instance) {
      throw createServiceError("EVOLUTION_INSTANCE não configurada.", 500, "missing_instance");
    }

    const url = `${config.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers = {
      apikey: config.apiKey,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    };

    let response;

    try {
      response = await fetch(url, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(config.timeoutMs)
      });
    } catch (error) {
      throw createServiceError(
        `Evolution API indisponível em ${config.baseUrl}. Verifique se o Docker/serviço está online.`,
        502,
        "evolution_offline",
        error.message
      );
    }

    const payload = await parseEvolutionResponse(response);

    if (!response.ok) {
      const message = payload?.response?.message || payload?.message || payload?.error || JSON.stringify(payload);
      throw createServiceError(
        `Evolution API respondeu ${response.status}: ${message}`,
        response.status === 404 ? 404 : 502,
        response.status === 404 ? "instance_not_found" : "evolution_response_error",
        payload
      );
    }

    return payload;
  }

  async function createInstance() {
    const config = getEvolutionConfig();
    const body = {
      instanceName: config.instance,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      rejectCall: true,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false
    };

    if (config.webhookUrl) {
      body.webhook = {
        url: buildWebhookUrl(config.webhookUrl),
        byEvents: false,
        base64: false,
        events: WEBHOOK_EVENTS
      };
    }

    return requestEvolution("/instance/create", {
      method: "POST",
      body
    });
  }

  async function getConnectionState() {
    const { instance } = getEvolutionConfig();
    return requestEvolution(`/instance/connectionState/${encodeURIComponent(instance)}`);
  }

  async function getQrCode() {
    const { instance } = getEvolutionConfig();
    return requestEvolution(`/instance/connect/${encodeURIComponent(instance)}`);
  }

  async function configureWebhook(webhookUrl = "") {
    const { instance } = getEvolutionConfig();
    const url = buildWebhookUrl(webhookUrl || getEvolutionConfig().webhookUrl);

    if (!url) {
      throw createServiceError("Informe a URL do webhook para configurar a Evolution API.", 400, "missing_webhook_url");
    }

    return requestEvolution(`/webhook/set/${encodeURIComponent(instance)}`, {
      method: "POST",
      body: {
        webhook: {
          enabled: true,
          url,
          events: WEBHOOK_EVENTS,
          webhook_by_events: false,
          webhook_base64: false
        }
      }
    });
  }

  async function ensureConnected() {
    const state = await getConnectionState();

    if (!isConnectionOpen(state)) {
      throw createServiceError(
        "Instância Evolution API não conectada. Escaneie o QR Code antes de enviar mensagens.",
        409,
        "instance_not_connected",
        state
      );
    }

    return state;
  }

  async function sendText(phone, message, options = {}) {
    let targetPhone = normalizePhone(phone);
    const text = normalizeText(message);

    try {
      targetPhone = validatePhone(phone);

      if (!text) {
        throw createServiceError("Mensagem obrigatória para envio no WhatsApp.", 400, "missing_message");
      }

      await ensureConnected();
      const { instance } = getEvolutionConfig();
      const payload = await requestEvolution(`/message/sendText/${encodeURIComponent(instance)}`, {
        method: "POST",
        body: {
          number: targetPhone,
          text,
          linkPreview: false
        }
      });
      const providerMessageId = getProviderMessageId(payload);

      await saveLog({
        tipo: options.tipo || options.type || "mensagem",
        telefone: targetPhone,
        mensagem: text,
        status: "enviado",
        providerMessageId,
        usuarioResponsavel: options.usuarioResponsavel,
        empresaId: options.empresaId,
        lojaId: options.lojaId,
        metadata: options.metadata || payload
      });

      return {
        success: true,
        status: "sent",
        provider: "evolution",
        providerMessageId,
        phone: targetPhone,
        response: payload
      };
    } catch (error) {
      await saveLog({
        tipo: options.tipo || options.type || "mensagem",
        telefone: targetPhone,
        mensagem: text,
        status: error.code === "instance_not_connected" ? "pendente_conexao" : "erro",
        erro: error.message,
        usuarioResponsavel: options.usuarioResponsavel,
        empresaId: options.empresaId,
        lojaId: options.lojaId,
        metadata: {
          code: error.code,
          details: error.details || null,
          ...(options.metadata || {})
        }
      });

      throw error;
    }
  }

  async function sendToAdmins(message, options = {}) {
    const { adminWhatsapp } = getEvolutionConfig();

    if (!adminWhatsapp) {
      await saveLog({
        tipo: options.tipo || "notificacao_admin",
        telefone: "",
        mensagem: message,
        status: "erro",
        erro: "ADMIN_WHATSAPP não configurado no .env.",
        usuarioResponsavel: options.usuarioResponsavel,
        empresaId: options.empresaId,
        lojaId: options.lojaId,
        metadata: options.metadata || {}
      });
      throw createServiceError("ADMIN_WHATSAPP não configurado no .env.", 500, "missing_admin_whatsapp");
    }

    return sendText(adminWhatsapp, message, {
      ...options,
      tipo: options.tipo || "notificacao_admin"
    });
  }

  function buildStockEntryMessage(data = {}) {
    return [
      "✅ *Entrada no estoque*",
      `Produto: ${data.productName || data.produto || "-"}`,
      `Quantidade: ${formatQuantity(data.quantity || data.quantidade)} ${data.unit || data.unidade || "unidade"}`,
      `Unidade interna: ${data.internalUnit || data.unidadeInterna || data.unidadeUso || "-"}`,
      `Fornecedor: ${data.supplier || data.fornecedor || "-"}`,
      `Responsável: ${data.responsibleUser || data.responsavel || "-"}`,
      `Data: ${formatDateTime(data.date || data.data || new Date())}`
    ].join("\n");
  }

  function buildStockExitMessage(data = {}) {
    return [
      "📦 *Saída para produção*",
      `Produto: ${data.productName || data.produto || "-"}`,
      `Quantidade: ${formatQuantity(data.quantity || data.quantidade)} ${data.unit || data.unidade || "unidade"}`,
      `Destino: ${data.destination || data.destino || data.reason || "Produção"}`,
      `Responsável: ${data.responsibleUser || data.responsavel || "-"}`,
      `Data: ${formatDateTime(data.date || data.data || new Date())}`
    ].join("\n");
  }

  function buildLowStockMessage(data = {}) {
    const productName = data.productName || data.product || data.produto || "-";
    const currentStock = data.currentStock ?? data.quantidadeAtual;
    const minimumStock = data.minimumStock ?? data.minStock ?? data.estoqueMinimo;
    const supplier = data.supplier || data.fornecedor || data.fornecedorSugerido || "-";
    const recommendedAction = data.recommendedAction || data.recommendation || data.acaoRecomendada || "Realizar reposição";

    return [
      "⚠️ *Atenção: estoque mínimo atingido*",
      `Produto: ${productName}`,
      `Quantidade atual: ${formatQuantity(currentStock)} ${data.unit || data.unidade || ""}`.trim(),
      `Estoque mínimo: ${formatQuantity(minimumStock)} ${data.unit || data.unidade || ""}`.trim(),
      `Fornecedor sugerido: ${supplier}`,
      `Ação recomendada: ${recommendedAction}`
    ].join("\n");
  }

  function buildSupplierOrderSuggestionMessage(data = {}) {
    const itens = Array.isArray(data.items || data.itens) ? data.items || data.itens : [];
    const itemLines = itens.length
      ? itens.map((item) => `- ${item.productName || item.produto || item.nome || "Produto"}: ${formatQuantity(item.quantity || item.quantidade)} ${item.unit || item.unidade || "unidade"}`)
      : ["- Nenhum item informado"];

    return [
      "🛒 *Sugestão de pedido para fornecedor*",
      `Fornecedor: ${data.supplier || data.fornecedor || "-"}`,
      "Itens:",
      ...itemLines,
      "Mensagem gerada automaticamente pelo sistema Carioca's Estoque."
    ].join("\n");
  }

  function buildOperationalTextMessage({ type, message, ...data } = {}) {
    if (message) {
      return normalizeText(message);
    }

    if (type === "stockIn") {
      return buildStockEntryMessage(data);
    }

    if (type === "stockOut") {
      return buildStockExitMessage(data);
    }

    if (type === "lowStock") {
      return buildLowStockMessage(data);
    }

    if (type === "purchaseSuggestion") {
      return buildSupplierOrderSuggestionMessage(data);
    }

    return "";
  }

  async function sendStockEntryAlert(data = {}) {
    return sendToAdmins(buildStockEntryMessage(data), {
      tipo: "entrada_estoque",
      usuarioResponsavel: data.responsibleUser || data.responsavel,
      empresaId: data.empresaId,
      lojaId: data.lojaId,
      metadata: data
    });
  }

  async function sendStockExitAlert(data = {}) {
    return sendToAdmins(buildStockExitMessage(data), {
      tipo: "saida_estoque",
      usuarioResponsavel: data.responsibleUser || data.responsavel,
      empresaId: data.empresaId,
      lojaId: data.lojaId,
      metadata: data
    });
  }

  async function sendLowStockAlert(data = {}) {
    return sendToAdmins(buildLowStockMessage(data), {
      tipo: "low_stock",
      usuarioResponsavel: data.responsibleUser || data.responsavel,
      empresaId: data.empresaId,
      lojaId: data.lojaId,
      metadata: data
    });
  }

  async function sendSupplierOrderSuggestion(data = {}) {
    return sendToAdmins(buildSupplierOrderSuggestionMessage(data), {
      tipo: "sugestao_pedido_fornecedor",
      usuarioResponsavel: data.responsibleUser || data.responsavel,
      empresaId: data.empresaId,
      lojaId: data.lojaId,
      metadata: data
    });
  }

  return {
    WHATSAPP_LOG_COLLECTION,
    createInstance,
    getConnectionState,
    getQrCode,
    configureWebhook,
    sendText,
    sendStockEntryAlert,
    sendStockExitAlert,
    sendLowStockAlert,
    sendSupplierOrderSuggestion,
    sendToAdmins,
    saveLog,
    buildOperationalTextMessage,
    buildStockEntryMessage,
    buildStockExitMessage,
    buildLowStockMessage,
    buildSupplierOrderSuggestionMessage
  };
}
