// Fizik laboratuvarı: oyundaki eşya zarflarıyla yığını çizimsiz simüle eder, ayar varyantlarını karşılaştırır.
// Kullanım: node tools/lab/physlab.mjs [eşyaSayısıTürü=34]
import RAPIER from "@dimforge/rapier3d-compat";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

await RAPIER.init();
const R = RAPIER;
const here = dirname(fileURLToPath(import.meta.url));
const SHAPES = JSON.parse(readFileSync(join(here, "shapes.json"), "utf8"));
const PILE = { x0: -2.35, x1: 3.35, z0: -0.75, z1: 3.75 };
const nTypes = Number(process.argv[2] || 34);

function rng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function quatFromEuler(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return { x: s1 * c2 * c3 + c1 * s2 * s3, y: c1 * s2 * c3 - s1 * c2 * s3, z: c1 * c2 * s3 + s1 * s2 * c3, w: c1 * c2 * c3 - s1 * s2 * s3 };
}

function supportHull(points, dirCount = 72, round = 0.012) {
  const n = points.length / 3;
  const dirs = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < dirCount; i++) {
    const y = 1 - (i / (dirCount - 1)) * 2, r = Math.sqrt(1 - y * y), a = golden * i;
    dirs.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) dirs.push(d);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) dirs.push([sx * 0.577, sy * 0.577, sz * 0.577]);
  const pick = new Set();
  for (const [dx, dy, dz] of dirs) {
    let best = -Infinity, bi = 0;
    for (let i = 0; i < n; i++) { const d = points[i * 3] * dx + points[i * 3 + 1] * dy + points[i * 3 + 2] * dz; if (d > best) { best = d; bi = i; } }
    pick.add(bi);
  }
  let cx = 0, cy = 0, cz = 0;
  for (const i of pick) { cx += points[i * 3]; cy += points[i * 3 + 1]; cz += points[i * 3 + 2]; }
  cx /= pick.size; cy /= pick.size; cz /= pick.size;
  const out = new Float32Array(pick.size * 3);
  let k = 0;
  for (const i of pick) {
    const x = points[i * 3] - cx, y = points[i * 3 + 1] - cy, z = points[i * 3 + 2] - cz;
    const len = Math.hypot(x, y, z) || 1, s = Math.max(0.35, 1 - round / len);
    out[k++] = cx + x * s; out[k++] = cy + y * s; out[k++] = cz + z * s;
  }
  return out;
}
function bbox(points) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], points[i + k]); mx[k] = Math.max(mx[k], points[i + k]); }
  return { mn, mx };
}
function makeCollider(S, cfg) {
  if (cfg.shape === "box") {
    const { mn, mx } = bbox(S.raw);
    const hx = (mx[0] - mn[0]) / 2, hy = (mx[1] - mn[1]) / 2, hz = (mx[2] - mn[2]) / 2;
    const rr = Math.min(0.02, hx * 0.4, hy * 0.4, hz * 0.4);
    return R.ColliderDesc.roundCuboid(hx - rr, hy - rr, hz - rr, rr).setTranslation((mx[0] + mn[0]) / 2, (mx[1] + mn[1]) / 2, (mx[2] + mn[2]) / 2);
  }
  if (cfg.dirs) {
    const pts = supportHull(new Float32Array(S.raw), cfg.dirs, cfg.round ?? 0.012);
    return cfg.round === 0 ? R.ColliderDesc.convexHull(pts) : R.ColliderDesc.roundConvexHull(pts, cfg.round ?? 0.012);
  }
  const pts = new Float32Array(cfg.raw ? S.raw : S.points);
  return cfg.round === 0 ? R.ColliderDesc.convexHull(pts) : R.ColliderDesc.roundConvexHull(pts, cfg.round ?? S.round);
}

function run(cfg) {
  const world = new R.World({ x: 0, y: cfg.g ?? -14, z: 0 });
  const STEP = cfg.step ?? 1 / 120;
  world.timestep = STEP;
  const ip = world.integrationParameters;
  if (cfg.iters) ip.numSolverIterations = cfg.iters;
  if (cfg.pgs) ip.numInternalPgsIterations = cfg.pgs;
  if (cfg.allowed != null) ip.normalizedAllowedLinearError = cfg.allowed;
  if (cfg.predict != null) ip.normalizedPredictionDistance = cfg.predict;
  if (cfg.freq != null) ip.contact_natural_frequency = cfg.freq;
  if (cfg.lu) world.lengthUnit = cfg.lu;
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed());
  world.createCollider(R.ColliderDesc.cuboid(9, 0.5, 9).setTranslation(0, -0.5, 0).setFriction(0.95), ground);
  const pad = 0.15, h = 1.6, t = 0.25;
  const { x0, x1, z0, z1 } = PILE;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2 + pad, hz = (z1 - z0) / 2 + pad;
  if (cfg.fence !== false) for (const [px, pz, sx, sz] of [[cx, z0 - pad - t, hx + t, t], [cx, z1 + pad + t, hx + t, t], [x0 - pad - t, cz, t, hz + t], [x1 + pad + t, cz, t, hz + t]]) {
    world.createCollider(R.ColliderDesc.cuboid(sx, h, sz).setTranslation(px, h, pz).setFriction(0.3), ground);
  }
  const types = Object.keys(SHAPES).slice(0, nTypes);
  const list = [];
  for (const ty of types) for (let k = 0; k < 3; k++) list.push(ty);
  const r = rng(505);
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const bodies = [];
  let spawned = 0, time = 0, acc = 0;
  const spawnRate = cfg.spawnRate ?? 70;
  const stats = [];
  let winMaxV = 0, fast = 0, globalT = 0, herdT = 0, herdN = 0;
  const T = cfg.seconds ?? Number(process.env.SECS || 12);
  const g = () => (r() + r() + r()) / 1.5 - 1;
  const spread = Math.min(0.46, Math.max(0.2, 0.16 + list.length * 0.0028));
  for (let frame = 0; time < T; frame++) {
    const dt = 1 / 60;
    time += dt;
    // doğurma
    const want = Math.min(list.length, Math.floor(time * spawnRate));
    while (spawned < want) {
      const ty = list[spawned];
      const S = SHAPES[ty];
      const pos = cfg.spawn === "column"
        ? { x: cx + g() * (x1 - x0) * spread, y: 2.0 + r() * 1.0 + spawned * (cfg.colStep ?? 0.05), z: cz + g() * (z1 - z0) * spread }
        : { x: cx + g() * (x1 - x0) * spread, y: 2.0 + r() * 2.2 + spawned * 0.012, z: cz + g() * (z1 - z0) * spread };
      const q = quatFromEuler(r() * 6.28, r() * 6.28, r() * 6.28);
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setRotation(q)
        .setLinearDamping(cfg.ld ?? 0.45).setAngularDamping(cfg.ad ?? 1.6).setCanSleep(true));
      let col = makeCollider(S, cfg);
      col.setFriction(cfg.fr ?? 0.8).setRestitution(0).setDensity(1);
      world.createCollider(col, body);
      body.setLinvel({ x: 0, y: cfg.v0 ?? -4, z: 0 }, true);
      bodies.push({ body, still: 0, ty });
      spawned++;
    }
    if (cfg.picks && time > 5 && frame % 30 === 0 && bodies.length > 6) {
      // en üstteki eşyayı al, çevresini uyandır (oyundaki gibi)
      let hi = -1, hy = -1;
      bodies.forEach((b, i) => { const y = b.body.translation().y; if (y > hy) { hy = y; hi = i; } });
      const p = bodies[hi].body.translation();
      world.removeRigidBody(bodies[hi].body);
      bodies.splice(hi, 1);
      for (const b of bodies) { const q = b.body.translation(); if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 1.7 * 1.7 && q.y >= p.y - 0.5) b.body.wakeUp(); }
    }
    acc += dt;
    while (acc >= STEP) {
      world.step();
      acc -= STEP;
      if (cfg.adapt) for (const b of bodies) {
        if (b.body.isSleeping()) continue;
        const lv = b.body.linvel(), av = b.body.angvel();
        const sp = Math.hypot(lv.x, lv.y, lv.z), sw = Math.hypot(av.x, av.y, av.z);
        const slow = sp < cfg.adapt.v && sw < cfg.adapt.w;
        b.slowT = slow ? (b.slowT || 0) + STEP : 0;
        const k = Math.min(1, (b.slowT || 0) / cfg.adapt.ramp);
        b.body.setLinearDamping((cfg.ld ?? 0.45) + k * cfg.adapt.ld);
        b.body.setAngularDamping((cfg.ad ?? 1.6) + k * cfg.adapt.ad);
      }
      if (cfg.herd) {
        let slow = 0, n = bodies.length, worst = 0;
        for (const b of bodies) {
          if (b.body.isSleeping()) { slow++; continue; }
          const lv = b.body.linvel(), av = b.body.angvel();
          const v = Math.hypot(lv.x, lv.y, lv.z), w = Math.hypot(av.x, av.y, av.z);
          if (v < cfg.herd.v && w < cfg.herd.w) slow++; else worst = Math.max(worst, v);
        }
        const ok = spawned === list.length && n - slow <= cfg.herd.allow && worst < cfg.herd.maxV;
        herdT = ok ? herdT + STEP : 0;
        if (herdT > cfg.herd.t) { for (const b of bodies) if (!b.body.isSleeping()) b.body.sleep(); herdT = 0; herdN++; }
      }
      if (cfg.globalSleep) {
        let mv = 0, mw = 0, n = 0;
        for (const b of bodies) { if (b.body.isSleeping()) continue; n++; const lv = b.body.linvel(), av = b.body.angvel(); mv = Math.max(mv, Math.hypot(lv.x, lv.y, lv.z)); mw = Math.max(mw, Math.hypot(av.x, av.y, av.z)); }
        globalT = n && mv < cfg.globalSleep.v && mw < cfg.globalSleep.w && spawned === list.length ? globalT + STEP : 0;
        if (globalT > cfg.globalSleep.t) { for (const b of bodies) b.body.sleep(); globalT = 0; }
      }
      if (cfg.settle) for (const b of bodies) {
        if (b.body.isSleeping()) { b.still = 0; continue; }
        const lv = b.body.linvel(), av = b.body.angvel();
        const slow = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z < cfg.settle.lv && av.x * av.x + av.y * av.y + av.z * av.z < cfg.settle.av;
        b.still = slow ? b.still + STEP : Math.max(0, b.still - STEP * 2);
        if (b.still > cfg.settle.t) { b.body.sleep(); b.still = 0; }
      }
    }
    for (const b of bodies) { const v = b.body.linvel(); const s = Math.hypot(v.x, v.y, v.z); winMaxV = Math.max(winMaxV, s); if (time > 3 && s > (cfg.picks ? 5 : 3)) fast++; }
    if (frame % 60 === 59) {
      let awake = 0, ymin = 9, under = 0;
      for (const b of bodies) { if (!b.body.isSleeping()) awake++; const y = b.body.translation().y; ymin = Math.min(ymin, y); if (y < -0.3) under++; }
      stats.push(`${Math.round(time)}s:${awake}/${winMaxV.toFixed(1)}${under ? "!" + under : ""}`);
      winMaxV = 0;
    }
  }
  const movers = bodies.map((b) => { const v = b.body.linvel(), w = b.body.angvel(), p = b.body.translation(); return { ty: b.ty, v: Math.hypot(v.x, v.y, v.z), w: Math.hypot(w.x, w.y, w.z), p: [p.x, p.y, p.z].map((x) => x.toFixed(2)).join(",") }; })
    .filter((m) => m.v > 0.04 || m.w > 0.1).sort((a, b) => b.v - a.v).slice(0, 10).map((m) => `${m.ty}(v${m.v.toFixed(2)} w${m.w.toFixed(2)} @${m.p})`);
  world.free();
  return { stats: stats.join(" ") + ` herd:${herdN}`, fast, movers };
}

const variants = {
  d26Picks: { picks: true, lu: 1.5, dirs: 12, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 2, ad: 4 } },
  d26: { lu: 1.5, dirs: 12, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 2, ad: 4 } },
  d40: { lu: 1.5, dirs: 26, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 2, ad: 4 } },
  d40r3: { lu: 1.5, dirs: 26, round: 0.03, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 2, ad: 4 } },
  box: { lu: 1.5, shape: "box", adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 2, ad: 4 } },
  fr12: { lu: 1.5, fr: 1.2, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 2, ad: 4 } },
  it8: { lu: 1.5, iters: 8, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 2, ad: 4 } },
  adStrong: { lu: 1.5, adapt: { v: 0.4, w: 1.2, ramp: 0.4, ld: 3, ad: 10 } },
  lu15: { lu: 1.5 },
  lu2a: { lu: 2, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 2, ad: 4 } },
  lu15a: { lu: 1.5, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 2, ad: 4 } },
  lu2Picks: { picks: true, lu: 2 },
  lu2aPicks: { picks: true, lu: 2, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 2, ad: 4 } },
  lu15aPicks: { picks: true, lu: 1.5, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 2, ad: 4 } },
  adaptPicks: { picks: true, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 4, ad: 8 } },
  plainPicks: { picks: true },
  herdOnlyPicks: { picks: true, herd: { v: 0.15, w: 0.4, allow: 3, maxV: 0.6, t: 0.35 } },
  herdPicks: { picks: true, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 4, ad: 8 }, herd: { v: 0.15, w: 0.4, allow: 3, maxV: 0.6, t: 0.35 } },
  herd: { adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 4, ad: 8 }, herd: { v: 0.15, w: 0.4, allow: 3, maxV: 0.6, t: 0.35 } },
  herdNoAdapt: { herd: { v: 0.15, w: 0.4, allow: 3, maxV: 0.6, t: 0.35 } },
  lu2: { lu: 2 },
  damp: { ld: 0.9, ad: 2.8 },
  adapt: { adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 4, ad: 8 } },
  adaptGlobal: { adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 4, ad: 8 }, globalSleep: { v: 0.12, w: 0.25, t: 0.4 } },
  adaptGlobalI6: { iters: 6, adapt: { v: 0.35, w: 0.8, ramp: 0.6, ld: 4, ad: 8 }, globalSleep: { v: 0.12, w: 0.25, t: 0.4 } },
  global: { globalSleep: { v: 0.15, w: 0.3, t: 0.4 } },
  current: { iters: 8, pgs: 1, allowed: 0.003, predict: 0.008, freq: 24, settle: { lv: 0.012, av: 0.04, t: 0.45 } },
  defaults60: { step: 1 / 60 },
  defaults120: {},
  noRound: { iters: 8, round: 0 },
  rawHull: { iters: 8, raw: true, round: 0.008 },
  column: { iters: 8, spawn: "column", settle: { lv: 0.012, av: 0.04, t: 0.45 } },
  slowSpawn: { iters: 8, spawnRate: 25, settle: { lv: 0.012, av: 0.04, t: 0.45 } },
};
const only = process.argv[3];
for (const [name, cfg] of Object.entries(variants)) {
  if (only && !only.split(",").includes(name)) continue;
  const t0 = Date.now();
  const r = run(cfg);
  console.log(name.padEnd(12), `${Date.now() - t0}ms`, "fast>3:", r.fast, "|", r.stats);
  if (process.env.MOVERS) console.log("   movers:", r.movers.join("  "));
}
