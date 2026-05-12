import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
for (const name of readdirSync(publicDir)) {
  if (!name.endsWith(".html")) {
    continue;
  }
  const path = join(publicDir, name);
  let html = readFileSync(path, "utf8");
  if (!html.includes("approved-body-wrap")) {
    continue;
  }
  if (name === "dashboard-saas.html") {
    continue;
  }
  const next = html.replace(/(<\/head>\s*)<body>\s*\n/, '$1<body class="premium-app-body dashboard-mobile-fix dashboard-approved-real">\n');
  if (next !== html) {
    writeFileSync(path, next, "utf8");
    console.log("body class:", name);
  }
}
