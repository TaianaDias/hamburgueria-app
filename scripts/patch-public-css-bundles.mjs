/**
 * Substitui cadeias de <link> dos CSS fonte por bundles em public/assets/
 * (idempotente: já patchado não muda).
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const reDashboard = new RegExp(
  String.raw`<link rel="stylesheet" href="style\.css">\s*\n<link rel="stylesheet" href="style-legacy\.css">\s*\n<link rel="stylesheet" href="dashboard-saas-page\.css">\s*\n<link rel="stylesheet" href="dashboard-approved-real\.css">`,
  "g"
);

const reLogin = new RegExp(
  String.raw`<link rel="stylesheet" href="style\.css">\s*\n<link rel="stylesheet" href="style-legacy\.css">\s*\n<link rel="stylesheet" href="dashboard-approved-real\.css">`,
  "g"
);

const reCore = new RegExp(
  String.raw`<link rel="stylesheet" href="style\.css">\s*\n<link rel="stylesheet" href="style-legacy\.css">`,
  "g"
);

const rePrintTwin = new RegExp(
  String.raw`<link rel="stylesheet" href="style\.css">\s*\n\s*<link rel="stylesheet" href="style-legacy\.css">`,
  "g"
);

async function patchFile(filePath) {
  let html = await readFile(filePath, "utf8");
  const before = html;

  html = html.replace(reDashboard, '<link rel="stylesheet" href="assets/app-dashboard.min.css">');
  html = html.replace(reLogin, '<link rel="stylesheet" href="assets/app-login.min.css">');
  html = html.replace(reCore, '<link rel="stylesheet" href="assets/app-core.min.css">');
  html = html.replace(rePrintTwin, '<link rel="stylesheet" href="assets/app-core.min.css">');

  if (html !== before) {
    await writeFile(filePath, html, "utf8");
    return true;
  }
  return false;
}

const entries = await readdir(publicDir, { withFileTypes: true });
const htmlFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".html")).map((e) => e.name);

let changed = 0;
for (const name of htmlFiles.sort()) {
  const filePath = path.join(publicDir, name);
  if (await patchFile(filePath)) {
    changed += 1;
    console.log(`patch: ${name}`);
  }
}

console.log(`CSS links: ${changed} arquivo(s) atualizado(s) em public/.`);
