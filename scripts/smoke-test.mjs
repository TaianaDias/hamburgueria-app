import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

if (process.env.GITHUB_ACTIONS !== "true") {
  console.log("Smoke test completo sera executado no GitHub Actions.");
  process.exit(0);
}

const port = Number(process.env.PORT || 3100);
const baseUrl = `http://127.0.0.1:${port}`;
const pathsToCheck = [
  "/api/health",
  "/login.html",
  "/index.html",
  "/estoque.html",
  "/fornecedores.html",
  "/receitas.html",
  "/compras.html",
  "/dashboard.html",
  "/funcionarios.html"
];

const server = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port)
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let combinedLogs = "";

server.stdout.on("data", (chunk) => {
  combinedLogs += chunk.toString();
});

server.stderr.on("data", (chunk) => {
  combinedLogs += chunk.toString();
});

async function waitForServer() {
  const timeoutAt = Date.now() + 20000;

  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);

      if (response.ok) {
        return;
      }
    } catch (error) {
      // Ignora tentativas enquanto o servidor ainda sobe.
    }

    if (server.exitCode != null) {
      throw new Error(`O servidor encerrou antes do teste.\n${combinedLogs}`.trim());
    }

    await delay(500);
  }

  throw new Error(`Timeout esperando o servidor subir.\n${combinedLogs}`.trim());
}

try {
  await waitForServer();

  for (const currentPath of pathsToCheck) {
    const response = await fetch(`${baseUrl}${currentPath}`);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Falha no smoke test para ${currentPath}: ${response.status}\n${body}`.trim());
    }
  }

  console.log(`Smoke test concluido com sucesso em ${pathsToCheck.length} rota(s).`);
} finally {
  if (server.exitCode == null) {
    server.kill("SIGTERM");
    await delay(500);
  }

  if (server.exitCode == null) {
    server.kill("SIGKILL");
  }
}
