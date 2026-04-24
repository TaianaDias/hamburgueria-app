import cors from "cors";
import express from "express";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;
const validRoles = new Set(["admin", "estoque", "caixa"]);
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

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/bootstrap/status", getBootstrapStatus);
app.post("/api/bootstrap/register", bootstrapRegister);
app.get("/api/usuarios", requireAdmin, listUsers);
app.post("/api/usuarios", requireAdmin, createUser);
app.post("/criar-usuario", requireAdmin, createUser);

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

app.use(express.static(publicDir, {
  extensions: ["html"],
  index: false
}));

app.listen(port, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${port} com credenciais via ${firebaseCredentialSource.source}.`);
});
