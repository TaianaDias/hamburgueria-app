import { setTimeout as delay } from "node:timers/promises";
import { startServer } from "../server.js";

const port = Number(process.env.PORT || 3100);
const baseUrl = `http://127.0.0.1:${port}`;
const pathsToCheck = [
  "/api/health",
  "/login.html",
  "/index.html",
  "/estoque.html",
  "/fornecedores.html",
  "/operacao.html",
  "/producao-etiquetas.html",
  "/impressora.html",
  "/relatorio-diario.html",
  "/whatsapp-ia.html",
  "/inventario.html",
  "/saas.html",
  "/compras.html",
  "/alertas-reposicao.html",
  "/dashboard.html",
  "/dashboard-saas.html",
  "/funcionarios.html"
];

const server = startServer({ port, host: "127.0.0.1", startScheduler: false });

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

    await delay(500);
  }

  throw new Error("Timeout esperando o servidor subir.");
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
  await new Promise((resolve) => server.close(resolve));
}
