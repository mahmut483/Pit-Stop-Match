// tools/catalog-entry.js → tek dosya tools/catalog.html
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = await build({
  entryPoints: [join(root, "tools/catalog-entry.js")],
  bundle: true, format: "iife", minify: true, write: false, absWorkingDir: root, logLevel: "warning",
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Katalog</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:linear-gradient(180deg,#f3ecfb 0%,#e4eefc 100%);font-family:"Arial Rounded MT Bold",system-ui,sans-serif;color:#24407f}
canvas{position:absolute;inset:0;z-index:1}
.lab{position:absolute;z-index:2;transform:translate(-50%,0);font-size:13px;font-weight:900;text-align:center;white-space:nowrap;text-shadow:0 1px 0 #fff}
.lab small{display:block;font-size:10px;opacity:.6}
.slot{position:absolute;z-index:0;border-radius:14px;background:#efe2c8;box-shadow:inset 0 3px 0 #d9c39c}
</style></head><body><script>${js}</script></body></html>`;
writeFileSync(join(root, "tools/catalog.html"), html);
console.log("catalog.html", (html.length / 1024).toFixed(0) + " KB");
