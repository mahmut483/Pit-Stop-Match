// src/icons/favicon.svg → the PNG icons (headless Chrome rasterises the SVG): favicon-32.png / favicon-16.png
// (transparent, the gear fills the square), apple-touch-icon.png 180 and icon-192 / icon-512 (the gear on the
// game's sky gradient: iOS fills a transparent home-screen icon with black). Written to src/icons/.
//   usage: node tools/icons.mjs
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const D = join(root, "src", "icons");
const svg = readFileSync(join(D, "favicon.svg"), "utf8");
const uri = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
const JOBS = [
  ["favicon-16.png", 16, false], ["favicon-32.png", 32, false], ["favicon-48.png", 48, false],
  ["apple-touch-icon.png", 180, true], ["icon-192.png", 192, true], ["icon-512.png", 512, true],
];
const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prof = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "ico-"));
const port = 9990 + Math.floor(Math.random() * 9);
const p = spawn(CH, ["--headless=new", "--remote-debugging-port=" + port, "--hide-scrollbars", "--window-size=600,600", "--user-data-dir=" + prof, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs; for (let i = 0; i < 60; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.length) break; } catch {} await sleep(250); }
const ws = new WebSocket(tabs.find((x) => x.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const [name, size, bg] of JOBS) {
  await send("Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  // a home-screen icon: sky gradient behind, the gear at 86 % (iOS rounds the corners itself)
  const pad = bg ? Math.round(size * 0.07) : 0;
  const html = `<html><body style="margin:0;width:${size}px;height:${size}px;${bg ? "background:linear-gradient(180deg,#8ec9f5,#b9b8f0);" : "background:transparent;"}">
    <img src="${uri}" style="position:absolute;left:${pad}px;top:${pad}px;width:${size - 2 * pad}px;height:${size - 2 * pad}px"></body></html>`;
  await send("Page.navigate", { url: "data:text/html;base64," + Buffer.from(html).toString("base64") });
  await sleep(400);
  const s = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  writeFileSync(join(D, name), Buffer.from(s.result.data, "base64"));
  console.log(name, size);
}
ws.close(); p.kill();
