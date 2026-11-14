// Phone check: the game under real touch input (CDP Input.dispatchTouchEvent) on several screen sizes.
// Per device: a screenshot after loading, a tap on the top item (into the tray), a one-finger drag (turns the
// room), a two-finger pinch (zooms), then a screenshot and the state.  usage: node tools/mobile.mjs <url> <outDir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [, , URL, OUT] = process.argv;
mkdirSync(OUT, { recursive: true });
const DEVICES = [
  ["iphone-se", 375, 667, 2], ["iphone-14", 390, 844, 3], ["pixel-7", 412, 915, 2.625],
  ["galaxy-s8", 360, 740, 3], ["ipad", 820, 1180, 2], ["phone-landscape", 844, 390, 3],
];
const CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
for (const [name, W, H, DPR] of DEVICES) {
  const prof = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "mob-"));
  const port = 9600 + Math.floor(Math.random() * 300);
  const p = spawn(CH, ["--headless=new", "--remote-debugging-port=" + port, "--use-angle=metal", "--ignore-gpu-blocklist", "--hide-scrollbars", "--mute-audio",
    "--window-size=" + W + "," + H, "--user-data-dir=" + prof, "about:blank"], { stdio: "ignore" });
  let tabs; for (let i = 0; i < 80; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.length) break; } catch {} await sleep(250); }
  const ws = new WebSocket(tabs.find((x) => x.type === "page").webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const logs = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === "Runtime.exceptionThrown") logs.push("EXC " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const touch = (type, pts) => send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 8, radiusY: 8, force: 1 })) });
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: name !== "ipad" || true, screenOrientation: W > H ? { type: "landscapePrimary", angle: 90 } : { type: "portraitPrimary", angle: 0 } });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  await send("Page.navigate", { url: URL });
  for (let i = 0; i < 120; i++) { if (await ev("window.__tidy && window.__tidy.state().phase === 'play'")) break; await sleep(250); }
  await sleep(1500);
  const shot = async (tag) => { const s = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, `${name}_${tag}.png`), Buffer.from(s.result.data, "base64")); };
  await shot("1_load");
  const layout = JSON.parse(await ev(`JSON.stringify((() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
    return { game: r('#game'), top: r('header.top'), tray: r('#tray-frame'), actions: r('.actions'), vw: innerWidth, vh: innerHeight }; })())`));
  // tap the top item
  const it = JSON.parse((await ev("JSON.stringify(__tidy.topScreen())")) || "null");
  if (it) { await touch("touchStart", [[it.x, it.y]]); await sleep(60); await touch("touchEnd", []); }
  await sleep(900);
  const tray1 = JSON.parse(await ev("JSON.stringify(__tidy.state().tray)"));
  // one-finger drag across the room
  const g = layout.game, cy = (g[1] + g[3]) / 2, x0 = g[0] + (g[2] - g[0]) * 0.8, x1 = g[0] + (g[2] - g[0]) * 0.2;
  const cam0 = JSON.parse(await ev("JSON.stringify(__tidy.cam())"));
  await touch("touchStart", [[x0, cy]]);
  for (let k = 1; k <= 12; k++) { await touch("touchMove", [[x0 + (x1 - x0) * k / 12, cy]]); await sleep(16); }
  await touch("touchEnd", []);
  await sleep(700);
  const cam1 = JSON.parse(await ev("JSON.stringify(__tidy.cam())"));
  // two-finger pinch out
  const cx = (g[0] + g[2]) / 2;
  await touch("touchStart", [[cx - 30, cy], [cx + 30, cy]]);
  for (let k = 1; k <= 10; k++) { await touch("touchMove", [[cx - 30 - 8 * k, cy], [cx + 30 + 8 * k, cy]]); await sleep(16); }
  await touch("touchEnd", []);
  await sleep(900);
  const cam2 = JSON.parse(await ev("JSON.stringify(__tidy.cam())"));
  const scale = await ev("window.visualViewport ? visualViewport.scale : 1");
  await shot("2_after");
  const r = { name, W, H, layout, tapped: it?.type, tray: tray1, turn: +(cam1.az - cam0.az).toFixed(1), zoom: cam2.zoom, pan: cam2.pan, pageScale: scale, errors: JSON.parse(await ev("JSON.stringify(window.__errors || [])")), logs };
  results.push(r);
  console.log(JSON.stringify(r));
  ws.close(); p.kill();
}
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
