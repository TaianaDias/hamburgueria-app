import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const entries = await readdir(publicDir, { withFileTypes: true });
const htmlFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, "pt-BR"));

if (!htmlFiles.length) {
  throw new Error("Nenhum arquivo HTML foi encontrado em public/.");
}

const shouldRunDeepSyntaxCheck = process.env.GITHUB_ACTIONS === "true";

if (!shouldRunDeepSyntaxCheck) {
  console.log(
    `HTML encontrado em ${htmlFiles.length} arquivo(s). Validacao sintatica completa sera executada no GitHub Actions.`
  );
  process.exit(0);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "hamburgueria-html-check-"));

try {
  for (const fileName of htmlFiles) {
    const filePath = path.join(publicDir, fileName);
    const html = await readFile(filePath, "utf8");
    const moduleScripts = [...html.matchAll(/<script\s+type="module">([\s\S]*?)<\/script>/g)];

    for (let index = 0; index < moduleScripts.length; index += 1) {
      const scriptContent = moduleScripts[index][1].trim();

      if (!scriptContent) {
        continue;
      }

      const tempFile = path.join(
        tempDir,
        `${fileName.replace(/\.html$/i, "")}.module-${index + 1}.mjs`
      );

      await writeFile(tempFile, scriptContent, "utf8");

      const result = spawnSync(process.execPath, ["--check", tempFile], {
        encoding: "utf8"
      });

      if (result.error) {
        throw new Error(
          `Falha ao executar a validacao de sintaxe em ${fileName}: ${result.error.message}`
        );
      }

      if (result.status !== 0) {
        const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
        throw new Error(`Falha de sintaxe em ${fileName}:\n${details}`);
      }
    }
  }

  console.log(`HTML validado com sucesso: ${htmlFiles.length} arquivo(s).`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
