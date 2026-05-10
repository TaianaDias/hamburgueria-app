/**
 * Lê (e opcionalmente corrige) o documento usuarios/{uid} no Firestore via Admin SDK.
 * Não imprime segredos. Resolução do UID: `PHASE4_EMAIL` (preferido) ou `PHASE4_UID` explícito.
 * Uso: PHASE4_EMAIL=... node scripts/phase4-firestore-usuario.mjs [--remove-permissoes]
 * Conta de auditoria: usar sempre a conta **atual** no Firebase; contas antigas removidas não devem ser referenciadas.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadServiceAccount() {
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_FILE,
    path.join(root, "server", "serviceAccountKey.json"),
    path.join(root, "serviceAccountKey.json")
  ].filter(Boolean);

  for (const filePath of candidates) {
    if (!filePath || !fs.existsSync(filePath)) {
      continue;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  }
  return null;
}

function summarizePermissoes(perm) {
  if (perm == null) {
    return { shape: "absent" };
  }
  if (typeof perm !== "object" || Array.isArray(perm)) {
    return { shape: typeof perm };
  }
  const keys = Object.keys(perm);
  const falseLeaves = [];

  function walk(obj, prefix) {
    if (obj === false) {
      falseLeaves.push(prefix || "(root)");
      return;
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      walk(v, p);
    }
  }

  walk(perm, "");
  return { shape: "object", keys, falseLeaves };
}

async function main() {
  const uidArg = String(process.env.PHASE4_UID || "").trim();
  const emailArg = String(process.env.PHASE4_EMAIL || "").trim().toLowerCase();
  const removePermissoes = process.argv.includes("--remove-permissoes");

  if (!uidArg && !emailArg) {
    console.error("Defina PHASE4_UID ou PHASE4_EMAIL.");
    process.exit(1);
  }

  const sa = loadServiceAccount();
  if (!sa) {
    console.error("Service account não encontrado (server/serviceAccountKey.json ou FIREBASE_SERVICE_ACCOUNT_FILE).");
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }

  let uid = uidArg;
  if (!uid && emailArg) {
    const userRecord = await admin.auth().getUserByEmail(emailArg);
    uid = userRecord.uid;
  }

  const db = admin.firestore();
  const ref = db.collection("usuarios").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    console.error(`Documento usuarios/${uid} não existe.`);
    process.exit(1);
  }

  const data = snap.data() || {};
  const permSummary = summarizePermissoes(data.permissoes);

  const report = {
    uid,
    emailNoRelatorio: "(omitido — use apenas PHASE4_EMAIL local)",
    ativo: data.ativo,
    perfilPrincipal: data.perfilPrincipal,
    tipo: data.tipo,
    empresaId: data.empresaId,
    lojaId: data.lojaId,
    permissoes: permSummary
  };

  console.log(JSON.stringify({ before: report }, null, 2));

  if (removePermissoes && data.permissoes !== undefined) {
    await ref.update({ permissoes: admin.firestore.FieldValue.delete() });
    console.log(JSON.stringify({ applied: "permissoes removido com FieldValue.delete()" }, null, 2));
  } else if (removePermissoes) {
    console.log(JSON.stringify({ applied: "nada — campo permissoes já ausente" }, null, 2));
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
