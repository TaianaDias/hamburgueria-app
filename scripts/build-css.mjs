/**
 * Agrega e minifica CSS em camadas fixas (ordem = cascata).
 * Fontes continuam em public/*.css; o HTML passa a carregar só public/assets/*.min.css.
 */
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const outDir = path.join(rootDir, "public", "assets");

const bundles = [
  { entry: "styles/entries/core.css", outfile: "public/assets/app-core.min.css" },
  { entry: "styles/entries/login.css", outfile: "public/assets/app-login.min.css" },
  { entry: "styles/entries/dashboard-shell.css", outfile: "public/assets/app-dashboard.min.css" },
];

fs.mkdirSync(outDir, { recursive: true });

const watch = process.argv.includes("--watch");

async function runBuild() {
  const builds = bundles.map(({ entry, outfile }) =>
    esbuild.build({
      absWorkingDir: rootDir,
      entryPoints: [entry],
      bundle: true,
      outfile: path.join(rootDir, outfile),
      minify: true,
      logLevel: "info",
    })
  );
  await Promise.all(builds);
  console.log(`CSS: ${bundles.length} bundle(s) gerado(s) em public/assets/`);
}

if (watch) {
  const contexts = await Promise.all(
    bundles.map(({ entry, outfile }) =>
      esbuild.context({
        absWorkingDir: rootDir,
        entryPoints: [entry],
        bundle: true,
        outfile: path.join(rootDir, outfile),
        minify: true,
        logLevel: "info",
      })
    )
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("CSS: watch ativo (Ctrl+C para sair).");
} else {
  await runBuild();
}
