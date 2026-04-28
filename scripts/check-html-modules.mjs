import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

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

for (const fileName of htmlFiles) {
  const filePath = path.join(publicDir, fileName);
  const html = await readFile(filePath, "utf8");
  const moduleScripts = [...html.matchAll(/<script\s+type="module">([\s\S]*?)<\/script>/g)];

  for (let index = 0; index < moduleScripts.length; index += 1) {
    const scriptContent = moduleScripts[index][1].trim();

    if (!scriptContent) {
      continue;
    }

    try {
      const importStrippedContent = scriptContent
        .replace(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g, "")
        .replace(/^\s*import\s+["'][^"']+["'];?\s*$/gm, "");
      const wrappedModule = `async function __codexHtmlModuleCheck__() {\n${importStrippedContent}\n}`;
      new Function(wrappedModule);
    } catch (error) {
      throw new Error(`Falha de sintaxe em ${fileName}:\n${error.message}`);
    }
  }
}

console.log(`HTML validado com sucesso: ${htmlFiles.length} arquivo(s).`);
