function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function buildWhatsAppPreviewUrl(recipient, message) {
  const normalizedRecipient = normalizePhone(recipient);

  if (!normalizedRecipient || !message) {
    return "";
  }

  return `https://wa.me/${normalizedRecipient}?text=${encodeURIComponent(message)}`;
}

export const WHATSAPP_PROVIDERS = Object.freeze([
  "log",
  "twilio",
  "z-api",
  "evolution",
  "ultramsg",
  "meta"
]);

function buildNotConfiguredResult(provider, payload, missingKeys = []) {
  return {
    delivered: false,
    status: "pending_configuration",
    provider,
    missingKeys,
    previewUrl: buildWhatsAppPreviewUrl(payload.recipient, payload.message)
  };
}

function buildLoggedResult(provider, payload) {
  return {
    delivered: false,
    status: "logged",
    provider,
    previewUrl: buildWhatsAppPreviewUrl(payload.recipient, payload.message)
  };
}

export function createWhatsAppNotifier(options = {}) {
  const provider = WHATSAPP_PROVIDERS.includes(options.provider)
    ? options.provider
    : "log";
  const env = options.env || process.env;

  async function send(payload) {
    switch (provider) {
      case "twilio":
        if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
          return buildNotConfiguredResult("twilio", payload, [
            "TWILIO_ACCOUNT_SID",
            "TWILIO_AUTH_TOKEN",
            "TWILIO_WHATSAPP_FROM"
          ]);
        }

        return {
          ...buildLoggedResult("twilio", payload),
          status: "ready_for_provider_integration"
        };

      case "z-api":
        if (!env.ZAPI_INSTANCE_ID || !env.ZAPI_INSTANCE_TOKEN || !env.ZAPI_CLIENT_TOKEN) {
          return buildNotConfiguredResult("z-api", payload, [
            "ZAPI_INSTANCE_ID",
            "ZAPI_INSTANCE_TOKEN",
            "ZAPI_CLIENT_TOKEN"
          ]);
        }

        return {
          ...buildLoggedResult("z-api", payload),
          status: "ready_for_provider_integration"
        };

      case "evolution":
        if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_TOKEN || !env.EVOLUTION_INSTANCE_NAME) {
          return buildNotConfiguredResult("evolution", payload, [
            "EVOLUTION_API_URL",
            "EVOLUTION_API_TOKEN",
            "EVOLUTION_INSTANCE_NAME"
          ]);
        }

        return {
          ...buildLoggedResult("evolution", payload),
          status: "ready_for_provider_integration"
        };

      case "ultramsg":
        if (!env.ULTRAMSG_INSTANCE_ID || !env.ULTRAMSG_TOKEN) {
          return buildNotConfiguredResult("ultramsg", payload, [
            "ULTRAMSG_INSTANCE_ID",
            "ULTRAMSG_TOKEN"
          ]);
        }

        return {
          ...buildLoggedResult("ultramsg", payload),
          status: "ready_for_provider_integration"
        };

      case "meta":
        if (!env.META_WHATSAPP_PHONE_NUMBER_ID || !env.META_WHATSAPP_TOKEN) {
          return buildNotConfiguredResult("meta", payload, [
            "META_WHATSAPP_PHONE_NUMBER_ID",
            "META_WHATSAPP_TOKEN"
          ]);
        }

        return {
          ...buildLoggedResult("meta", payload),
          status: "ready_for_provider_integration"
        };

      case "log":
      default:
        return buildLoggedResult("log", payload);
    }
  }

  return {
    provider,
    supportedProviders: WHATSAPP_PROVIDERS,
    send
  };
}
