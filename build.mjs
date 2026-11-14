// Tek dosya derlemesi: src/main.js (three + rapier wasm dahil) → dist/Tidy-Up-Sanayi.html
// ve claudeedit klasörüne Tidy-Up-Sanayi-Konsept.html kopyası.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes("--dev");
const res = await build({
  entryPoints: [join(root, "src/main.js")],
  bundle: true,
  format: "iife",
  minify: !dev,
  write: false,
  target: "es2020",
  legalComments: "none",
  logLevel: "warning",
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = readFileSync(join(root, "src/index.html"), "utf8");
// icons: the tab icon is inlined (SVG + a 32 px PNG for Safari), so the single file makes no requests (a playable
// ad must not); the web build also links the home-screen icons and the manifest, copied next to it
const ico = (f) => readFileSync(join(root, "src/icons", f));
const inlineIcons = `<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,${ico("favicon-32.png").toString("base64")}">\n` +
  `<link rel="icon" type="image/svg+xml" sizes="any" href="data:image/svg+xml;base64,${ico("favicon.svg").toString("base64")}">`;
const webIcons = `\n<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png">\n<link rel="manifest" href="manifest.webmanifest">`;
const page = html.replace("<!--APP-->", () => `<script>/*! three.js (MIT) · @dimforge/rapier3d-compat (Apache-2.0) */\n${js}</script>`);
const out = page.replace("<!--ICONS-->", () => inlineIcons);
const webOut = page.replace("<!--ICONS-->", () => inlineIcons + webIcons);
mkdirSync(join(root, "dist"), { recursive: true });
const file = join(root, "dist/Tidy-Up-Sanayi.html");
writeFileSync(file, out);
if (!dev) {
  copyFileSync(file, join(root, "../Tidy-Up-Sanayi-Konsept.html"));
  // the web build (Vercel): deploy/index.html
  mkdirSync(join(root, "deploy"), { recursive: true });
  writeFileSync(join(root, "deploy/index.html"), webOut);
  for (const f of ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "favicon-32.png"]) copyFileSync(join(root, "src/icons", f), join(root, "deploy", f));
  writeFileSync(join(root, "deploy/manifest.webmanifest"), JSON.stringify({
    name: "Pit Stop Match", short_name: "Pit Stop", start_url: ".", display: "fullscreen", orientation: "portrait",
    background_color: "#8ec9f5", theme_color: "#8ec9f5",
    icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png" }],
  }, null, 1));
}
console.log(`yazıldı: ${file} (${(out.length / 1048576).toFixed(2)} MB)`);
