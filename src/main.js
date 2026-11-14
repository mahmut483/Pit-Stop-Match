// Tidy Up · Sanayi — oyun döngüsü: oda + fizik yığını + 7 yuvalı tepsi (üçlü eşleştirme).
// Eşleşen tür kuyruklu yıldızla odadaki yerine uçar, bağlı dağınıklık toparlanır, temizlik eşyası kiri siler.
// Çizim iki katman: oda (#board) arayüzün altında, tepsi eşyaları ve efektler (#dock) arayüzün üstünde.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildRoom, PILE, MESS_PARTS, CLEANERS, ROOM } from "./room.js";
import { fadeObject } from "./fade.js";
import { ITEMS } from "./items.js";
import { LEVELS } from "./levels.js";
import { initPhysics, PileWorld, supportHull } from "./physics.js";
import { popItem } from "./pop.js";
import { hullPoints, boundsOf, getHighlightMat, D2R } from "./kit.js";
import { GRIME, GRIME_CATS, setDirt, cleanCategory, updateGrime, grimeShared, isDirty } from "./grime.js";
import { Tweens, Particles, Sound, Confetti, ease, ringTexture, glowTexture, screenSprite } from "./fx.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const SLOTS = 7;
const ITEM_SCALE = 1.2; // eşyalar odaya göre biraz iri: dokunması kolay
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const store = {
  get(k, d) { try { const v = localStorage.getItem("tidy-sanayi:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("tidy-sanayi:" + k, JSON.stringify(v)); } catch { /* özel pencere */ } },
};

// ── İki çizici: oda ve tepsi bindirmesi ─────────────────────────────────────────────────
const gameEl = $("#game");
const canvas = $("#board");
const dockCanvas = $("#dock");
const hitEl = $("#hit");
const lite = params.get("lite") === "1";

function makeRenderer(cv) {
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: "high-performance" });
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 1.0;
  return r;
}
const renderer = makeRenderer(canvas);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const orenderer = makeRenderer(dockCanvas);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(24, 1, 0.5, 200);
const hemi = new THREE.HemisphereLight("#fff6e8", "#b9c6de", 1.55);
const sun = new THREE.DirectionalLight("#fff1dc", 2.35);
sun.position.set(3.5, 13, 8.5);
sun.castShadow = true;
sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -9.5, right: 9.5, top: 9.5, bottom: -9.5, near: 1, far: 40 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.025;
sun.shadow.radius = 3;
const fill = new THREE.DirectionalLight("#dfe8ff", 0.55);
fill.position.set(10, 4, -3);
scene.add(hemi, sun, sun.target, fill);

const overlay = new THREE.Scene();
overlay.environment = new THREE.PMREMGenerator(orenderer).fromScene(new RoomEnvironment(), 0.04).texture;
overlay.environmentIntensity = 0.45;
const ocam = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
overlay.add(new THREE.HemisphereLight("#fffaf0", "#c4cde0", 1.75));
const odir = new THREE.DirectionalLight("#fff4e2", 2.0);
odir.position.set(-0.35, 0.8, 1);
overlay.add(odir);

const tweens = new Tweens();
const worldFx = new Particles(900, false);
const overlayFx = new Particles(600, true);
const confetti = new Confetti(280);
scene.add(worldFx.points);
overlay.add(overlayFx.points, confetti.points);
const sprites = new Set(); // bindirmedeki geçici halka/kuyruklu yıldızlar
const sound = new Sound();
sound.on = store.get("sound", true) && params.get("sound") !== "0";
sound.setVolume(store.get("volume", 0.8));
let vibrate = store.get("vibrate", true);
let timeScale = 1;

const room = buildRoom();
// the shop is black and white so the colourful items to collect (and the ones put back) stand out
fadeObject(room.root);
scene.add(room.root);

// ── Eşya prototipleri ───────────────────────────────────────────────────────────────────
const protos = new Map();
function proto(type) {
  let p = protos.get(type);
  if (p) return p;
  const def = ITEMS[type];
  if (!def) throw new Error("unknown item type: " + type);
  const model = def.build().build();
  // every item a bit bigger, small ones more (tea glass ≈ +40%, tyre/mop ≈ +10%)
  model.updateMatrixWorld(true);
  const raw = boundsOf(model).radius;
  const grow = 1.1 + 0.3 * Math.min(1, Math.max(0, (0.6 - raw) / 0.36));
  model.scale.setScalar(ITEM_SCALE * grow);
  model.updateMatrixWorld(true);
  const b = boundsOf(model);
  const wrap = new THREE.Group();
  const inner = model.clone();
  inner.position.copy(b.center).negate();
  wrap.add(inner);
  const shape = supportHull(hullPoints(wrap, 0.012, 4000));
  const ic = def.icon || [12, -30, 0];
  const iconQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(ic[0] * D2R, ic[1] * D2R, ic[2] * D2R));
  wrap.quaternion.copy(iconQuat);
  wrap.updateMatrixWorld(true);
  const ib = new THREE.Box3().setFromObject(wrap);
  const iconSize = Math.max(ib.max.x - ib.min.x, ib.max.y - ib.min.y);
  p = { type, model, center: b.center.clone(), size: b.size.clone(), radius: b.radius, shape, iconQuat, iconSize };
  protos.set(type, p);
  return p;
}

// ── Durum ───────────────────────────────────────────────────────────────────────────────
const S = {
  levelIndex: 0, level: null, phase: "loading",
  items: [], tray: [], history: [], decor: new Map(), resolvers: [],
  placed: 0, total: 0,
  physics: null, dropQueue: [], dropT: 0, rng: Math.random,
  combo: 0, lastMatch: -10, startTime: 0, now: 0, spawned: 0,
};
let uid = 0;
const LOG = (window.__tidyLog = []);
const log = (...a) => { if (LOG.length < 400) LOG.push(Math.round(performance.now()) + " " + a.join(" ")); };

// ── Kamera ──────────────────────────────────────────────────────────────────────────────
const cam = {
  baseAz: 45, baseEl: 36, margin: 0,
  az: 45, el: 36, zoom: 1, pan: new THREE.Vector2(),
  tAz: 45, tEl: 36, tZoom: 1, tPan: new THREE.Vector2(),
  dist: 30, target: new THREE.Vector3(0, 1.4, 0), rate: 12, shake: 0,
};
const camOverride = params.get("cam") ? params.get("cam").split(",").map(Number) : null;
// As in the reference: drag turns the room all the way round, the height is limited, wheel / pinch zoom into
// the centre only (no panning). A wall the camera has moved behind is not drawn (camera layers, see below).
const EL_MIN = 14, EL_MAX = 76, ZOOM_MIN = 0.6, ZOOM_MAX = 2.8;
const wrapDeg = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _shakePan = new THREE.Vector2();
const view = { w: 1, h: 1, availTop: 0, availBot: 1, shift: 0 };

function placeCamera(az, el, dist, target, pan) {
  const a = az * D2R, e = el * D2R;
  camera.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(dist).add(target);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  if (pan && (pan.x || pan.y)) {
    _v.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(pan.x);
    _v2.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(pan.y);
    camera.position.add(_v).add(_v2);
  }
  camera.updateMatrixWorld(true);
}

function fitCamera() {
  const { w, h, availTop, availBot } = view;
  const availH = Math.max(100, availBot - availTop), availW = w * (1.04 - 2 * cam.margin);
  camera.aspect = w / h;
  camera.fov = 24;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  const b = room.bounds;
  const corners = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const target = b.getCenter(new THREE.Vector3());
  let dist = 30;
  const extents = (d) => {
    placeCamera(cam.baseAz, cam.baseEl, d, target);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of corners) { _v.copy(c).project(camera); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
    return { x0, x1, y0, y1 };
  };
  for (let iter = 0; iter < 4; iter++) {
    let lo = 4, hi = 300;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      const e = extents(mid);
      if ((e.x1 - e.x0) <= (2 * availW) / w && (e.y1 - e.y0) <= (2 * availH) / h) hi = mid; else lo = mid;
    }
    dist = hi;
    const e = extents(dist);
    const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2;
    const halfH = dist * Math.tan((camera.fov * D2R) / 2), halfW = halfH * camera.aspect;
    _v.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(cx * halfW);
    _v2.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(cy * halfH);
    target.add(_v).add(_v2);
  }
  cam.dist = dist;
  cam.target.copy(target);
  view.shift = (availTop + availBot) / 2 - h / 2;
  camera.setViewOffset(w, h, 0, -view.shift, w, h);
  camera.updateProjectionMatrix();
}

let camMoved = false;
function updateCamera(dt) {
  const k = 1 - Math.exp(-dt * cam.rate);
  const before = cam.az + cam.el * 7 + cam.zoom * 13 + cam.pan.x * 17 + cam.pan.y * 19;
  cam.az += (cam.tAz - cam.az) * k;
  cam.el += (cam.tEl - cam.el) * k;
  cam.zoom += (cam.tZoom - cam.zoom) * k;
  cam.pan.lerp(cam.tPan, k);
  const after = cam.az + cam.el * 7 + cam.zoom * 13 + cam.pan.x * 17 + cam.pan.y * 19;
  camMoved = Math.abs(after - before) > 1e-4;
  let pan = cam.pan;
  if (cam.shake > 0.001) {
    cam.shake *= Math.exp(-dt * 7);
    pan = _shakePan.set(cam.pan.x + (Math.random() - 0.5) * cam.shake, cam.pan.y + (Math.random() - 0.5) * cam.shake);
  }
  placeCamera(cam.az, cam.el, cam.dist / cam.zoom, cam.target, pan);
  updateWalls();
}
// back to the first view the short way round (the azimuth is not wrapped while turning)
function resetCamera() {
  cam.rate = 7;
  cam.az = cam.baseAz + wrapDeg(cam.az - cam.baseAz);
  cam.tAz = cam.baseAz; cam.tEl = cam.baseEl; cam.tZoom = 1; cam.tPan.set(0, 0);
  setTimeout(() => (cam.rate = 12), 700);
}
// aim at an azimuth the short way round from where the camera is now
function aimAz(a) { cam.tAz = cam.az + wrapDeg(a - cam.az); }

// ── Duvarlar: kamera bir duvarın dışına geçince o duvar ve üstündekiler çizilmez (referanstaki gibi) ──
const WALL_LAYER = { left: 1, right: 2 };
const wallHidden = { left: false, right: false };
function setWallLayer(obj, wall) {
  obj.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) o.layers.set(WALL_LAYER[wall]); });
}
room.root.traverse((o) => { if (o.userData.wall) setWallLayer(o, o.userData.wall); });
for (const L of Object.values(WALL_LAYER)) { camera.layers.enable(L); sun.shadow.camera.layers.enable(L); }
function updateWalls() {
  const left = camera.position.x < ROOM.x0 - ROOM.wallT, right = camera.position.z < ROOM.z0 - ROOM.wallT;
  if (left === wallHidden.left && right === wallHidden.right) return;
  wallHidden.left = left; wallHidden.right = right;
  camera.layers.set(0);
  if (!left) camera.layers.enable(WALL_LAYER.left);
  if (!right) camera.layers.enable(WALL_LAYER.right);
}

// zoom into the centre of the view (no panning, as in the reference)
function zoomBy(factor) { cam.tZoom = THREE.MathUtils.clamp(cam.tZoom * factor, ZOOM_MIN, ZOOM_MAX); }

// ── Boyutlandırma ve tepsi yuvaları ─────────────────────────────────────────────────────
let slots = [];
const slotEls = [...document.querySelectorAll("#tray .slot")];
function measure() {
  const gr = gameEl.getBoundingClientRect();
  view.w = Math.max(1, gr.width);
  view.h = Math.max(1, gr.height);
  const prog = $(".progress").getBoundingClientRect();
  const tray = $("#tray-frame").getBoundingClientRect();
  view.availTop = prog.bottom - gr.top + 6;
  view.availBot = tray.top - gr.top - 12;
  slots = slotEls.map((s) => {
    const r = s.getBoundingClientRect();
    return { x: r.left - gr.left + r.width / 2, y: r.top - gr.top + r.height / 2, size: Math.min(r.width, r.height) };
  });
}
let overlayDirty = true, overlayWasDrawn = false;
// adaptive resolution: a phone that cannot hold the frame rate drops its pixel ratio a step (never below 1)
let dprCap = lite ? 1.5 : 2;
function resize() {
  measure();
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  for (const r of [renderer, orenderer]) { r.setPixelRatio(dpr); r.setSize(view.w, view.h, false); }
  for (const c of [canvas, dockCanvas]) { c.style.width = view.w + "px"; c.style.height = view.h + "px"; }
  ocam.left = 0; ocam.right = view.w; ocam.top = 0; ocam.bottom = -view.h;
  ocam.updateProjectionMatrix();
  fitCamera();
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  grimeShared.uRes.value.copy(buf);
  worldFx.mat.uniforms.scale.value = buf.y / (2 * Math.tan((camera.fov * D2R) / 2));
  overlayFx.mat.uniforms.scale.value = dpr;
  confetti.mat.uniforms.scale.value = dpr;
  overlayDirty = true;
}
window.addEventListener("resize", () => requestAnimationFrame(resize));

// ── Dünya ↔ ekran ───────────────────────────────────────────────────────────────────────
function worldToScreen(p) {
  _v.copy(p).project(camera);
  return new THREE.Vector2((_v.x * 0.5 + 0.5) * view.w, (-_v.y * 0.5 + 0.5) * view.h);
}
function pxPerUnitAt(p) {
  const a = worldToScreen(p);
  _v2.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(0.5).add(p);
  const b = worldToScreen(_v2);
  return a.distanceTo(b) * 2;
}
function slotTarget(i) {
  const s = slots[Math.min(i, slots.length - 1)];
  return s ? new THREE.Vector3(s.x, -s.y, 0) : new THREE.Vector3(view.w / 2, -view.h + 60, 0);
}
function iconScale(item) {
  const s = slots[0] ? slots[0].size : 44;
  return (s * 0.78) / Math.max(0.2, proto(item.type).iconSize);
}
function flashSlot(i, cls) {
  const el = slotEls[i];
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// Bindirmede geçici sprite (halka/kuyruklu yıldız) — tween bitince kaldırılır
function spawnSprite(tex, color, additive) {
  const m = screenSprite(tex, color, additive);
  overlay.add(m);
  sprites.add(m);
  return m;
}
function killSprite(m) { overlay.remove(m); sprites.delete(m); m.geometry.dispose(); m.material.dispose(); }
function ringAt(x, y, { color = "#ffd75e", from = 20, to = 150, dur = 0.45, additive = false } = {}) {
  const m = spawnSprite(ringTexture(), color, additive);
  m.position.set(x, y, 350);
  m.scale.setScalar(from);
  return tweens.add({ dur, ease: ease.outCubic, update: (e) => { m.scale.setScalar(from + (to - from) * e); m.material.opacity = 1 - e; }, done: () => killSprite(m) });
}

// ── Eşya oluşturma ──────────────────────────────────────────────────────────────────────
function makeItem(type) {
  const P = proto(type);
  const obj = new THREE.Group();
  const m = P.model.clone();
  m.position.copy(P.center).negate();
  obj.add(m);
  popItem(m);
  const item = { id: ++uid, type, obj, status: "pile", body: null, radius: P.radius, fly: null, punch: 0 };
  obj.traverse((o) => { if (o.isMesh) { o.userData.item = item; o.userData.baseMat = o.material; } });
  return item;
}
function setHighlight(item, on) {
  if (!item) return;
  item.obj.traverse((o) => { if (o.isMesh) o.material = on ? getHighlightMat(o.userData.baseMat) : o.userData.baseMat; });
  item.highlight = on;
}

// ── Bölüm kurulumu ──────────────────────────────────────────────────────────────────────
function clearLevel() {
  tweens.clear();
  worldFx.clear();
  overlayFx.clear();
  confetti.clear();
  for (const m of [...sprites]) killSprite(m);
  for (const it of S.items) it.obj.parent && it.obj.parent.remove(it.obj);
  if (S.physics) S.physics.dispose();
  S.physics = null;
  for (const list of S.decor.values()) for (const d of list) d.parent && d.parent.remove(d);
  S.decor.clear();
  S.items = []; S.tray = []; S.history = []; S.resolvers = [];
  overlayDirty = true;
}

function buildDecor(type, visible) {
  const homes = room.homes[type];
  if (!homes || !ITEMS[type]) return [];
  const P = proto(type);
  const list = [];
  for (const h of homes) {
    const d = P.model.clone();
    const r = h.rot || [0, 0, 0];
    d.position.set(...h.pos);
    d.quaternion.setFromEuler(new THREE.Euler(r[0] * D2R, r[1] * D2R, r[2] * D2R));
    if (h.scale) d.scale.multiplyScalar(h.scale);
    if (h.parent && room.rigs[h.parent]) {
      const rig = room.rigs[h.parent];
      d.updateMatrix();
      const m = new THREE.Matrix4().copy(rig.closedWorldMatrix()).invert().multiply(d.matrix);
      m.decompose(d.position, d.quaternion, d.scale);
      rig.obj.add(d);
    } else {
      room.root.add(d);
    }
    d.userData.baseScale = d.scale.clone();
    d.visible = visible;
    // already on the shelf from the start = scenery (black and white); the ones the player puts back keep their colour
    if (visible) fadeObject(d);
    const wall = h.wall || (h.parent && room.rigs[h.parent] && room.rigs[h.parent].obj.userData.wall);
    if (wall) setWallLayer(d, wall);
    list.push(d);
  }
  return list;
}

function assignResolvers(level, rng) {
  const used = new Set();
  const res = [];
  for (const part of level.mess) {
    if (!room.rigs[part]) continue;
    const cands = (MESS_PARTS[part] || []).filter((t) => level.types.includes(t));
    let by = cands.find((t) => !used.has(t)) || cands[0];
    if (!by) {
      const free = level.types.filter((t) => !used.has(t));
      const pool = free.length ? free : level.types;
      by = pool[Math.floor(rng() * pool.length)];
    }
    used.add(by);
    res.push({ part, by, done: false });
  }
  return res;
}

function loadLevel(index) {
  clearLevel();
  const L = LEVELS[index];
  S.levelIndex = index;
  S.level = L;
  const seed = params.get("seed") ? Number(params.get("seed")) : L.seed;
  S.rng = mulberry32(seed);
  S.placed = 0;
  S.total = L.types.length;
  S.combo = 0;
  S.spawned = 0;

  for (const [id, rig] of Object.entries(room.rigs)) rig.set(L.mess.includes(id) ? 0 : 1);
  for (const c of GRIME_CATS) setDirt(c, L.dirt.includes(c));
  for (const type of Object.keys(room.homes)) {
    if (!ITEMS[type]) continue;
    S.decor.set(type, buildDecor(type, !L.types.includes(type)));
  }
  S.resolvers = assignResolvers(L, S.rng);

  S.physics = new PileWorld(PILE);
  const list = [];
  for (const t of L.types) for (let k = 0; k < 3; k++) list.push(makeItem(t));
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(S.rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  S.items = list;
  S.dropQueue = list.slice();
  S.dropT = 0;
  S.phase = "drop";
  hideResult();
  startTutorial();
  updateHud(true);
  // giriş kamera hareketi: biraz uzaktan ve yandan süzülerek yerine oturur
  cam.tAz = cam.baseAz; cam.tEl = cam.baseEl; cam.tZoom = 1; cam.tPan.set(0, 0);
  cam.az = cam.baseAz - 14; cam.el = cam.baseEl + 6; cam.zoom = 0.86; cam.pan.set(0, 0);
  if (camOverride) {
    const [a, e, z] = camOverride;
    if (!isNaN(a)) cam.az = cam.tAz = cam.baseAz + a;
    if (!isNaN(e)) cam.el = cam.tEl = cam.baseEl + e;
    if (!isNaN(z)) cam.zoom = cam.tZoom = z;
  }
  cam.rate = 2.4;
  setTimeout(() => (cam.rate = 12), 1600);
  log("load", L.id);
}

function spawnNext() {
  const it = S.dropQueue.shift();
  if (!it) return;
  const { x0, x1, z0, z1 } = PILE;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const g = () => (S.rng() + S.rng() + S.rng()) / 1.5 - 1;
  const spread = THREE.MathUtils.clamp(0.16 + S.items.length * 0.0028, 0.2, 0.46);
  const pos = new THREE.Vector3(cx + g() * (x1 - x0) * spread, 2.0 + S.rng() * 2.2 + S.spawned * 0.012, cz + g() * (z1 - z0) * spread);
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(S.rng() * 6.28, S.rng() * 6.28, S.rng() * 6.28));
  it.obj.position.copy(pos);
  it.obj.quaternion.copy(quat);
  scene.add(it.obj);
  const body = S.physics.addItem(it, proto(it.type).shape, pos, quat);
  body.setLinvel({ x: 0, y: -4, z: 0 }, true);
  it.status = "pile";
  S.spawned++;
  if (S.spawned % 9 === 1) sound.thud();
}

// Fizik adımları arasında ara değerleme: yüksek tazeleme hızlı ekranda bile pürüzsüz hareket
function syncPile() {
  const a = S.physics.alpha;
  for (const it of S.items) {
    if (it.status !== "pile" || !it.body) continue;
    const b = it.body;
    if (b.isSleeping()) {
      if (!it.slept) { const t = b.translation(), r = b.rotation(); it.obj.position.set(t.x, t.y, t.z); it.obj.quaternion.set(r.x, r.y, r.z, r.w); it.slept = true; }
      continue;
    }
    it.slept = false;
    const t = b.translation(), r = b.rotation();
    if (t.y < -3) {
      b.setTranslation({ x: (PILE.x0 + PILE.x1) / 2, y: 3, z: (PILE.z0 + PILE.z1) / 2 }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      continue;
    }
    _v.set(t.x, t.y, t.z);
    it.obj.position.set(it.prevP.x, it.prevP.y, it.prevP.z).lerp(_v, a);
    _q1.set(it.prevQ.x, it.prevQ.y, it.prevQ.z, it.prevQ.w);
    _q2.set(r.x, r.y, r.z, r.w);
    it.obj.quaternion.slerpQuaternions(_q1, _q2, a);
  }
}

// ── Toplama: yığından tepsiye ───────────────────────────────────────────────────────────
function insertIndex(type) {
  let last = -1;
  S.tray.forEach((it, i) => { if (it.type === type) last = i; });
  return last >= 0 ? last + 1 : S.tray.length;
}

function pickItem(item, opts = {}) {
  if (!item || item.status !== "pile" || S.phase !== "play") return false;
  if (S.tray.length >= SLOTS) { sound.deny(); replay($("#tray-frame"), "shake"); return false; }
  setHighlight(item, false);
  item.obj.scale.setScalar(1);
  const wp = item.obj.position.clone();
  const wq = item.obj.quaternion.clone();
  S.history.push({ item, pos: wp.clone(), quat: wq.clone() });
  S.physics.removeItem(item);
  const sp = worldToScreen(wp);
  const scale0 = pxPerUnitAt(wp);
  const vq = camera.quaternion.clone().invert().multiply(wq);
  scene.remove(item.obj);
  overlay.add(item.obj);
  item.obj.position.set(sp.x, -sp.y, 200);
  item.obj.quaternion.copy(vq);
  item.obj.scale.setScalar(scale0);
  item.status = "flying";
  item.fly = { t: 0, dur: opts.fast ? 0.34 : 0.44, from: item.obj.position.clone(), fromQ: vq, fromS: scale0, spin: (Math.random() < 0.5 ? -1 : 1) * 0.6 };
  S.tray.splice(insertIndex(item.type), 0, item);
  log("pick", item.type, item.id, "tray=" + S.tray.length);
  sound.pick();
  tutorialStep();
  if (vibrate && navigator.vibrate) try { navigator.vibrate(10); } catch { /* yok */ }
  ringAt(sp.x, -sp.y, { color: "#ffffff", from: 16, to: 70, dur: 0.32 });
  ringAt(sp.x, -sp.y, { color: "#ffd75e", from: 8, to: 46, dur: 0.26 });
  overlayFx.burst(new THREE.Vector3(sp.x, -sp.y, 300), 7, { screen: true, color: "#ffffff", speed: 140, size: 9, life: 0.35, gravity: 0 });
  overlayDirty = true;
  updateHud();
  return true;
}

function updateTray(dt) {
  const k = 1 - Math.exp(-dt * 16);
  for (let i = 0; i < S.tray.length; i++) {
    const it = S.tray[i];
    const target = slotTarget(i);
    const s1 = iconScale(it);
    const iq = proto(it.type).iconQuat;
    if (it.status === "flying") {
      const f = it.fly;
      f.t += dt;
      const kk = Math.min(1, f.t / f.dur);
      const e = ease.inOutCubic(kk);
      it.obj.position.lerpVectors(f.from, target, e);
      it.obj.position.y += Math.sin(Math.PI * kk) * 80;
      it.obj.position.z = 200;
      _q1.setFromAxisAngle(_v.set(0, 0, 1), f.spin * Math.sin(Math.PI * kk));
      it.obj.quaternion.slerpQuaternions(f.fromQ, iq, ease.outCubic(kk)).premultiply(_q1);
      it.obj.scale.setScalar((f.fromS + (s1 - f.fromS) * e) * (1 + 0.28 * Math.sin(Math.PI * kk)));
      if (kk >= 1 && it.fly) {
        it.status = "tray";
        it.fly = null;
        it.punch = 1;
        log("land", it.type, it.id);
        sound.land();
        flashSlot(i, "glow");
        overlayFx.burst(new THREE.Vector3(target.x, target.y, 300), 6, { screen: true, color: "#fff7d6", speed: 110, size: 9, life: 0.35, gravity: 0 });
        checkTray();
      }
    } else if (it.status === "tray") {
      it.obj.position.lerp(target, k);
      it.obj.position.z = 0;
      it.obj.quaternion.slerp(iq, k);
      it.punch = Math.max(0, it.punch - dt * 4);
      const p = it.punch > 0 ? 1 + 0.2 * Math.sin((1 - it.punch) * Math.PI * 2.2) * it.punch : 1;
      it.obj.scale.setScalar(s1 * p);
    }
  }
}

function checkTray() {
  const groups = new Map();
  for (const it of S.tray) if (it.status === "tray") { if (!groups.has(it.type)) groups.set(it.type, []); groups.get(it.type).push(it); }
  for (const [type, arr] of groups) if (arr.length >= 3) { matchTrio(type, arr.slice(0, 3)); return; }
  if (S.tray.length >= SLOTS && S.tray.every((it) => it.status === "tray") && S.phase === "play") lose();
}

function matchTrio(type, trio) {
  for (const it of trio) it.status = "matching";
  log("match", type, trio.map((t) => t.id).join(","));
  S.combo = S.now - S.lastMatch < 4.5 ? S.combo + 1 : 1;
  S.lastMatch = S.now;
  sound.match(S.combo);
  const idx = trio.map((it) => S.tray.indexOf(it));
  const starts = trio.map((it) => it.obj.position.clone());
  const s0 = trio.map((it) => it.obj.scale.x);
  const mid = starts[1].clone();
  // 1) hafif yukarı kalkış, 2) ortada birleşme, 3) patlama
  tweens.add({
    dur: 0.12, ease: ease.outCubic,
    update: (e) => trio.forEach((it, i) => { it.obj.position.set(starts[i].x, starts[i].y + 16 * e, 260 + i); it.obj.scale.setScalar(s0[i] * (1 + 0.12 * e)); }),
  }).then(() => tweens.add({
    dur: 0.16, ease: ease.inCubic,
    update: (e) => trio.forEach((it, i) => { it.obj.position.set(starts[i].x + (mid.x - starts[i].x) * e, starts[i].y + 16, 260 + i); }),
  })).then(() => tweens.add({
    dur: 0.13, ease: ease.inCubic,
    update: (e) => trio.forEach((it, i) => it.obj.scale.setScalar(s0[i] * 1.12 * (1 + 0.25 * e) * (1 - e))),
  })).then(() => {
    const p = new THREE.Vector3(mid.x, mid.y + 16, 300);
    ringAt(p.x, p.y, { color: "#ffcf4d", from: 24, to: 170, dur: 0.5 });
    ringAt(p.x, p.y, { color: "#ffffff", from: 10, to: 110, dur: 0.38 });
    overlayFx.burst(p, 26, { screen: true, palette: ["#fff2a8", "#ffd27a", "#ffffff", "#b8f0dc"], speed: 300, size: 15, life: 0.65, gravity: -300 });
    for (const i of idx) flashSlot(i, "match");
    for (const it of trio) { overlay.remove(it.obj); it.status = "gone"; }
    S.tray = S.tray.filter((it) => !trio.includes(it));
    onTypeMatched(type, p);
    if (S.combo >= 2) showCombo(S.combo);
    updateHud();
    checkTray();
  });
}

// ── Eşleşme sonrası: kuyruklu yıldız → yerine yerleş, toparla, temizle ───────────────────
function decorCenter(d) {
  d.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(d).getCenter(new THREE.Vector3());
}
function revealOne(d) {
  return tweens.add({
    dur: 0.55, ease: ease.outBack,
    update: (e) => { d.visible = true; d.scale.copy(d.userData.baseScale).multiplyScalar(Math.max(0.001, e)); },
    done: () => {
      const c = decorCenter(d);
      worldFx.burst(c, 16, { palette: ["#fff3b0", "#ffffff", "#ffd98a"], speed: 2.6, size: 0.24, life: 0.75, gravity: -1.4 });
      worldFx.burst(c, 6, { color: "#ffffff", speed: 0.6, size: 0.55, life: 0.45, gravity: 0, fade: 0.6 });
    },
  });
}
function comet(from, toWorld, delay = 0) {
  return new Promise((resolve) => {
    const m = spawnSprite(glowTexture(), "#ffcf5a", false);
    const core = spawnSprite(glowTexture(), "#ffffff", false);
    m.scale.setScalar(0.001);
    core.scale.setScalar(0.001);
    m.position.set(from.x, from.y, 380);
    const to = worldToScreen(toWorld);
    const end = new THREE.Vector2(to.x, -to.y);
    const ctrl = new THREE.Vector2((from.x + end.x) / 2 + (Math.random() - 0.5) * 80, Math.max(from.y, end.y) + 140);
    let last = 0;
    tweens.add({
      dur: 0.62, delay, ease: ease.inOutCubic,
      update: (e, k) => {
        const u = 1 - e;
        const x = u * u * from.x + 2 * u * e * ctrl.x + e * e * end.x;
        const y = u * u * from.y + 2 * u * e * ctrl.y + e * e * end.y;
        const sc = (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, k * 1.4))) * (k < 0.08 ? k / 0.08 : 1);
        m.position.set(x, y, 380);
        m.scale.setScalar(58 * sc);
        core.position.set(x, y, 381);
        core.scale.setScalar(26 * sc);
        if (k - last > 0.025) { last = k; overlayFx.burst(new THREE.Vector3(x, y, 300), 3, { screen: true, palette: ["#ffd75e", "#ffffff", "#ffb347"], speed: 34, size: 12, life: 0.45, gravity: 0, drag: 4 }); }
      },
      done: () => { killSprite(m); killSprite(core); resolve(); },
    });
  });
}

async function onTypeMatched(type, from) {
  S.placed++;
  replay($("#progress-fill"), "shine");
  replay($("#progress"), "bump");
  updateHud();
  const last = S.placed >= S.total;
  if (last) S.phase = "won";
  const list = S.decor.get(type) || [];
  sound.whoosh(0.05);
  const arrivals = list.map((d, i) => comet(from, decorCenter(d), i * 0.07).then(() => {
    if (i === 0) { sound.place(); sound.sparkle(0.05); }
    return revealOne(d);
  }));
  await tweens.wait(0.55);
  S.resolvers.filter((r) => r.by === type && !r.done).forEach((r, i) => resolvePart(r, 0.1 + i * 0.25));
  const cat = CLEANERS[type];
  if (cat && isDirty(cat)) { sound.clean(); cleanCategory(cat, 1.5); }
  if (last) { await Promise.all(arrivals); win(); }
}

function resolvePart(r, delay = 0) {
  if (r.done) return Promise.resolve();
  r.done = true;
  const rig = room.rigs[r.part];
  const from = rig.t;
  return tweens.add({
    dur: rig.hideWhenMessy ? 0.55 : 0.7, delay, ease: ease.outBack,
    update: (e) => rig.set(from + (1 - from) * e),
    done: () => {
      rig.obj.updateMatrixWorld(true);
      const p = new THREE.Box3().setFromObject(rig.obj).getCenter(new THREE.Vector3());
      worldFx.burst(p, 18, { palette: ["#f4ead8", "#e8dcc6", "#ffffff"], speed: 1.8, size: 0.32, life: 0.85, gravity: 0.6, drag: 3 });
      worldFx.burst(p, 10, { color: "#fff3b0", speed: 2.8, size: 0.2, life: 0.55 });
      sound.fix();
    },
  });
}

// ── Kazanma / kaybetme ──────────────────────────────────────────────────────────────────
async function win() {
  S.phase = "won";
  const elapsed = S.now - S.startTime;
  await tweens.wait(0.5);
  const pending = S.resolvers.filter((r) => !r.done);
  pending.forEach((r, i) => resolvePart(r, i * 0.18));
  const dirty = GRIME_CATS.filter(isDirty);
  if (dirty.length) { sound.clean(); dirty.forEach((c) => cleanCategory(c, 1.4)); }
  await tweens.wait(pending.length || dirty.length ? 1.5 : 0.2);
  // kutlama: kamera hafif yaklaşır, konfeti, korna
  cam.rate = 1.6;
  aimAz(cam.baseAz + 7); cam.tZoom = Math.max(cam.tZoom, 1.06); cam.tPan.set(0, 0);
  confetti.burst(view.w, view.h, 170);
  overlayDirty = true;
  sound.win();
  sound.honk(0.75);
  const stars = 3;
  const best = store.get("stars", {});
  best[S.level.id] = Math.max(best[S.level.id] || 0, stars);
  store.set("stars", best);
  await tweens.wait(0.8);
  showResult(true, { stars, elapsed });
  setTimeout(() => (cam.rate = 12), 2500);
}

function lose() {
  if (S.phase !== "play") return;
  S.phase = "lost";
  sound.lose();
  replay($("#tray-frame"), "shake");
  setTimeout(() => showResult(false), 700);
}

function fmtTime(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

function showResult(won, info = {}) {
  const last = S.levelIndex + 1 >= LEVELS.length;
  const res = $("#result");
  res.hidden = false;
  res.classList.toggle("won", won);
  replay(res.querySelector(".card"));
  $("#result-badge").innerHTML = won ? ICON_WRENCH : ICON_UNDO;
  $("#result-title").textContent = won ? "Master work!" : "Tray full!";
  $("#result-message").textContent = won
    ? (last ? "The shop is spotless. Every work order is done!" : "The shop is spotless, everything in its place.")
    : "Line up three of the same part before the tray fills up.";
  const pri = $("#result-primary");
  pri.classList.toggle("breathe", won);
  if (won) {
    $("#stats").innerHTML = `<span>Time ${fmtTime(info.elapsed || 0)}</span>`;
    const stars = [...document.querySelectorAll("#stars svg")];
    stars.forEach((s) => s.classList.remove("in", "lit"));
    stars.forEach((s, i) => setTimeout(() => {
      s.classList.add("in");
      if (i < (info.stars || 0)) { s.classList.add("lit"); sound.star(i); }
    }, 350 + i * 260));
    pri.textContent = last ? "Play again" : "Next level";
    pri.onclick = () => goLevel(last ? 0 : S.levelIndex + 1);
  } else {
    pri.textContent = "Try again";
    pri.onclick = () => goLevel(S.levelIndex);
  }
}
function hideResult() { $("#result").hidden = true; }

function pileItems() { return S.items.filter((it) => it.status === "pile"); }
function topFirst(list) { return list.slice().sort((a, b) => b.obj.position.y - a.obj.position.y); }

// ── Arayüz ──────────────────────────────────────────────────────────────────────────────
const ICON_WRENCH = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M21.7 6.6a1 1 0 0 0-1.6-.3l-2.6 2.6-2.1-.5-.5-2.1 2.6-2.6a1 1 0 0 0-.3-1.6A6 6 0 0 0 9.4 9.6l-6.5 6.5a2.6 2.6 0 0 0 3.7 3.7l6.5-6.5a6 6 0 0 0 8.6-6.7Z"/></svg>`;
const ICON_UNDO = `<svg viewBox="0 0 24 24"><path d="M9 7 4.5 11.5 9 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 11.5h8.5a5 5 0 0 1 0 10H11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
const COMBO_WORDS = ["Nice!", "Great!", "Super!", "Amazing!", "Master work!"];

// CSS animasyonunu yeniden başlat (sınıf verilmezse öğenin kendi animasyonu)
function replay(el, cls) {
  if (!el) return;
  if (!cls) { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; return; }
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

let warned = false;
function updateHud() {
  const pct = S.total ? (S.placed / S.total) * 100 : 0;
  $("#progress-fill").style.width = pct + "%";
  $("#progress-caption").textContent = `${S.placed} / ${S.total}`;
  const n = S.tray.length;
  const frame = $("#tray-frame");
  frame.classList.toggle("warn", n === 5);
  frame.classList.toggle("danger", n >= 6 && S.phase === "play");
  if (n >= 6 && !warned && S.phase === "play") { warned = true; sound.warn(); }
  if (n < 6) warned = false;
}

function showCombo(n) {
  const el = $("#combo");
  el.innerHTML = `<span>${COMBO_WORDS[Math.min(n - 2, COMBO_WORDS.length - 1)]}<small>x${n}</small></span>`;
  sound.sparkle();
}


// İlk seviyede yol gösteren el: üstteki eşyayı işaret eder
let tutorial = null;
function startTutorial() {
  tutorial = S.levelIndex === 0 && !store.get("tutDone", false) ? { picks: 0 } : null;
  $("#tutorial").hidden = !tutorial;
}
function tutorialStep() {
  if (!tutorial) return;
  tutorial.picks++;
  if (tutorial.picks >= 3) { tutorial = null; $("#tutorial").hidden = true; store.set("tutDone", true); }
}
function updateTutorial() {
  if (!tutorial) return;
  const el = $("#tutorial");
  if (S.phase !== "play") { el.style.opacity = 0; return; }
  const want = S.tray.length ? S.tray[S.tray.length - 1].type : null;
  const pile = pileItems();
  const it = topFirst(want ? pile.filter((p) => p.type === want) : pile)[0] || topFirst(pile)[0];
  if (!it) return;
  const p = worldToScreen(it.obj.position);
  el.style.opacity = 1;
  el.style.transform = `translate(${p.x}px, ${p.y}px)`;
}

// Bölüm geçişi: kepenk iner, bölüm kurulur, kepenk kalkar
let transitioning = false;
async function goLevel(i) {
  if (transitioning) return;
  transitioning = true;
  hideResult();
  const L = $("#loading");
  $("#loading-message").textContent = `Level ${i + 1} · ${LEVELS[i].title}`;
  L.classList.add("open");
  L.hidden = false;
  void L.offsetWidth;
  replay(L.querySelector(".load-bar i"));
  L.classList.remove("open");
  sound.shutter(false);
  await sleep(820);
  loadLevel(i);
  await sleep(120);
  L.classList.add("open");
  sound.shutter(true);
  setTimeout(() => { L.hidden = true; }, 850);
  transitioning = false;
}


// Debug state that the removed settings panel used to toggle (kept off)
const showColliders = false;
let colliderLines = null;
const fpsEl = null;

// ── Dokunma: seç, döndür, kaydır, yakınlaştır ───────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const TAP_OFFSETS = [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7], [6, 6], [-6, 6], [6, -6], [-6, -6], [13, 0], [-13, 0], [0, 13], [0, -13]];
function itemAt(clientX, clientY) {
  if (S.phase !== "play") return null;
  const rect = canvas.getBoundingClientRect();
  const objs = S.items.filter((it) => it.status === "pile").map((it) => it.obj);
  if (!objs.length) return null;
  for (const [dx, dy] of TAP_OFFSETS) {
    ndc.set(((clientX + dx - rect.left) / rect.width) * 2 - 1, -((clientY + dy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(objs, true);
    if (hits.length) return hits[0].object.userData.item;
  }
  return null;
}

const pointers = new Map();
let gesture = null;
let pressed = null;
function release() { if (pressed) { setHighlight(pressed, false); pressed.obj.scale.setScalar(1); pressed = null; } }
hitEl.addEventListener("contextmenu", (e) => e.preventDefault());
for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
hitEl.addEventListener("pointerdown", (e) => {
  sound.unlock();
  try { hitEl.setPointerCapture(e.pointerId); } catch { /* sentetik olay */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    if (e.pointerType === "mouse" && e.button !== 0) { pointers.delete(e.pointerId); return; }   // left button only
    gesture = { type: "tap", x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY };
    pressed = itemAt(e.clientX, e.clientY);
    if (pressed) { setHighlight(pressed, true); pressed.obj.scale.setScalar(1.1); }
  } else if (pointers.size === 2) {
    release();
    const [a, b] = [...pointers.values()];
    gesture = { type: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
});
hitEl.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (!gesture) return;
  if (gesture.type === "tap" && Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) > 9) { gesture.type = "rotate"; release(); }
  const dx = e.clientX - gesture.lx, dy = e.clientY - gesture.ly;
  if (gesture.type === "rotate") {
    gesture.lx = e.clientX; gesture.ly = e.clientY;
    // a drag across the whole width = one full turn (the reference's rate); the height stays in its range
    cam.tAz -= (dx / view.w) * 360;
    cam.tEl = THREE.MathUtils.clamp(cam.tEl + (dy / view.h) * 117, EL_MIN, EL_MAX);
  } else if (gesture.type === "pinch" && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomBy(d / Math.max(20, gesture.d));
    gesture.d = d;
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (gesture && gesture.type === "tap" && e.type === "pointerup") {
    const item = pressed && pressed.status === "pile" ? pressed : itemAt(e.clientX, e.clientY);
    release();
    if (item) pickItem(item);
  } else release();
  if (pointers.size === 0) gesture = null;
  else if (gesture && gesture.type === "pinch") gesture = null;
}
hitEl.addEventListener("pointerup", endPointer);
hitEl.addEventListener("pointercancel", endPointer);
// Mouse wheel and trackpad: zoom into the centre only (the trackpad pinch arrives as ctrl + wheel)
hitEl.addEventListener("wheel", (e) => {
  e.preventDefault();
  const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? view.h : 1);
  zoomBy(Math.exp(-THREE.MathUtils.clamp(dy, -200, 200) * (e.ctrlKey ? 0.012 : 0.002)));
}, { passive: false });

document.addEventListener("keydown", (e) => {
  if (e.target.matches?.("input,select,textarea")) return;
  const k = e.key.toLowerCase();
  if (k === "r") goLevel(S.levelIndex);
  else if (k === "n") goLevel((S.levelIndex + 1) % LEVELS.length);
  else if (k === "h") resetCamera();
});

// ── Döngü ───────────────────────────────────────────────────────────────────────────────
let last = performance.now();
let fpsAcc = 0, fpsN = 0, dustT = 0;
const perf = { t: 0, n: 0, slow: 0 };
function watchPerf(real) {
  if (S.phase !== "play" || document.hidden || window.__film) return;   // (the film tool runs a virtual clock)
  perf.t += real; perf.n++;
  if (perf.t < 2) return;
  const fps = perf.n / perf.t;
  perf.t = 0; perf.n = 0;
  perf.slow = fps < 42 ? perf.slow + 1 : 0;
  const cur = Math.min(window.devicePixelRatio || 1, dprCap);
  if (perf.slow >= 2 && cur > 1) {
    dprCap = Math.max(1, cur - 0.35);
    perf.slow = 0;
    resize();
    log("perf: dpr " + cur.toFixed(2) + " -> " + dprCap.toFixed(2) + " (" + fps.toFixed(0) + " fps)");
  }
}

function updateColliders() {
  if (!showColliders || !S.physics) return;
  const buf = S.physics.debugLines();
  if (!colliderLines) {
    colliderLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#ff3b7a", transparent: true, opacity: 0.85, depthTest: false }));
    colliderLines.renderOrder = 50;
    colliderLines.frustumCulled = false;
    scene.add(colliderLines);
  }
  colliderLines.visible = true;
  colliderLines.geometry.setAttribute("position", new THREE.BufferAttribute(buf.vertices, 3));
}

function frame(now) {
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (now - last) / 1000);
  watchPerf((now - last) / 1000);
  last = now;
  const dt = real * timeScale * (params.get("speed") ? Number(params.get("speed")) : 1);
  S.now += dt;
  if (S.phase === "drop") {
    S.dropT += dt;
    const n = Math.max(1, Math.round(dt * 70));
    for (let i = 0; i < n && S.dropQueue.length; i++) spawnNext();
    if (!S.dropQueue.length && S.dropT > 1.0 && (S.physics.awakeCount() < 4 || S.dropT > 3.0)) {
      S.phase = "play";
      S.startTime = S.now;
      updateHud();
    }
  }
  if (S.physics && S.phase !== "loading") { S.physics.step(dt); syncPile(); }
  tweens.update(dt);
  updateTray(dt);
  worldFx.update(dt);
  overlayFx.update(dt);
  confetti.update(dt);
  updateGrime(dt);
  updateCamera(real);
  updateTutorial();
  updateColliders();
  // pencere ışığında süzülen toz
  dustT += dt;
  if (dustT > 0.32) {
    dustT = 0;
    worldFx.burst(new THREE.Vector3(-4.2 + Math.random() * 3.2, 0.6 + Math.random() * 3, 0.2 + Math.random() * 3.6), 1, { color: "#fff7df", speed: 0.08, size: 0.07, life: 5, gravity: 0.025, drag: 0.15, fade: 0.55 });
  }

  renderer.render(scene, camera);
  const mainCalls = renderer.info.render.calls;
  const needOverlay = S.tray.length > 0 || sprites.size > 0 || overlayFx.active || confetti.active || S.items.some((it) => it.status === "returning");
  if (needOverlay || overlayDirty || overlayWasDrawn) {
    orenderer.render(overlay, ocam);
    overlayWasDrawn = needOverlay;
    overlayDirty = false;
  }
  if (fpsEl) { fpsAcc += real; fpsN++; if (fpsAcc > 0.5) { fpsEl.textContent = Math.round(fpsN / fpsAcc) + " fps · " + mainCalls + " calls · awake " + (S.physics ? S.physics.awakeCount() : 0); fpsAcc = 0; fpsN = 0; } }
}

// ── Test ve demo kancaları ──────────────────────────────────────────────────────────────
function finishInstantly() {
  for (const it of S.items) { if (it.obj.parent) it.obj.parent.remove(it.obj); if (it.body) S.physics.removeItem(it); it.status = "gone"; }
  S.tray = [];
  for (const type of S.level.types) for (const d of S.decor.get(type) || []) { d.visible = true; d.scale.copy(d.userData.baseScale); }
  for (const r of S.resolvers) { room.rigs[r.part].set(1); r.done = true; }
  for (const c of GRIME_CATS) setDirt(c, false);
  S.placed = S.total;
  S.phase = "won";
  overlayDirty = true;
  updateHud();
}
function autoStep() {
  if (S.phase !== "play") return;
  const counts = new Map();
  for (const it of S.tray) if (it.status !== "matching" && it.status !== "gone") counts.set(it.type, (counts.get(it.type) || 0) + 1);
  const pile = pileItems();
  if (!pile.length) return;
  let best = null;
  for (const [type, c] of counts) { const cand = topFirst(pile.filter((p) => p.type === type))[0]; if (cand && (!best || c > best.c)) best = { c, item: cand }; }
  pickItem(best ? best.item : topFirst(pile)[0]);
}
function randomStep() {
  if (S.phase !== "play") return;
  const top = topFirst(pileItems()).slice(0, 12);
  if (top.length) pickItem(top[Math.floor(Math.random() * top.length)]);
}
window.__tidy = {
  state: () => ({ level: S.level?.id, phase: S.phase, placed: S.placed, total: S.total, pile: pileItems().length, tray: S.tray.map((t) => t.type + "/" + t.status), tweens: tweens.list.length, awake: S.physics?.awakeCount(), unresolved: S.resolvers.filter((r) => !r.done).map((r) => r.part + "←" + r.by) }),
  items: () => S.items.map((it) => ({ t: it.type, s: it.status, p: it.obj.position.toArray().map((v) => +v.toFixed(3)), q: it.obj.quaternion.toArray().map((v) => +v.toFixed(3)) })),
  topScreen: () => {
    const it = topFirst(pileItems())[0];
    if (!it) return null;
    const p = worldToScreen(it.obj.position), r = canvas.getBoundingClientRect();
    return { id: it.id, type: it.type, x: r.left + p.x, y: r.top + p.y };
  },
  // fizik testi: çizimden bağımsız n adım (1/60 sn) ilerlet, hareket/uyanık istatistiği döndür
  simulate: (n = 60) => {
    while (S.dropQueue.length) spawnNext();
    const snap = pileItems().map((it) => { const t = it.body.translation(), r = it.body.rotation(); return [t.x, t.y, t.z, r.x, r.y, r.z, r.w]; });
    let maxV = 0;
    for (let i = 0; i < n; i++) {
      S.physics.step(1 / 60);
      for (const it of pileItems()) { const v = it.body.linvel(); maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z)); }
    }
    syncPile();
    let maxMove = 0, maxRot = 0, moved = 0;
    pileItems().forEach((it, i) => {
      const t = it.body.translation(), r = it.body.rotation(), a = snap[i];
      const d = Math.hypot(t.x - a[0], t.y - a[1], t.z - a[2]);
      const dq = 1 - Math.abs(r.x * a[3] + r.y * a[4] + r.z * a[5] + r.w * a[6]);
      if (d > 0.005 || dq > 0.0002) moved++;
      maxMove = Math.max(maxMove, d); maxRot = Math.max(maxRot, dq);
    });
    return { awake: S.physics.awakeCount(), moved, maxMove: +maxMove.toFixed(4), maxRot: +maxRot.toFixed(5), maxV: +maxV.toFixed(3) };
  },
  shapes: () => Object.fromEntries([...protos.values()].map((p) => [p.type, { round: p.shape.round, radius: p.radius, points: [...p.shape.points].map((v) => +v.toFixed(4)), raw: [...hullPoints((() => { const w = new THREE.Group(); const m = p.model.clone(); m.position.copy(p.center).negate(); w.add(m); return w; })(), 0.03, 600)].map((v) => +v.toFixed(4)) }])),
  winNow: () => { finishInstantly(); S.phase = "play"; S.startTime = S.now - 83; win(); },
  autoStep, randomStep, finish: finishInstantly, load: loadLevel, go: goLevel, zoomBy, aimAz, wallHidden, cam: () => ({ az: +cam.tAz.toFixed(1), el: +cam.tEl.toFixed(1), zoom: +cam.tZoom.toFixed(3), pan: cam.tPan.toArray() }),
  pickType: (t) => pickItem(topFirst(pileItems().filter((p) => p.type === t))[0]),
  // the gameplay film (tools/film.mjs): taps a visible item the way a player would, records sounds, moves the camera
  film: {
    sound,
    now: () => S.now,
    spot(type) {
      const r = canvas.getBoundingClientRect();
      const cands = topFirst(pileItems().filter((p) => !type || p.type === type));
      let pick = null;
      for (const it of cands) {
        const p = worldToScreen(it.obj.position), x = r.left + p.x, y = r.top + p.y;
        const hit = itemAt(x, y);
        if (hit === it || (hit && hit.type === it.type && (!type || hit.type === type))) { pick = { it: hit, x, y }; break; }
      }
      if (!pick && cands[0]) { const p = worldToScreen(cands[0].obj.position); pick = { it: cands[0], x: r.left + p.x, y: r.top + p.y }; }
      return pick;
    },
    tap(type) {
      const s = window.__tidy.film.spot(type);
      if (!s) return null;
      pickItem(s.it);
      return { type: s.it.type, x: s.x, y: s.y };
    },
    camTo(o) { if (o.az != null) cam.tAz = o.az; if (o.el != null) cam.tEl = o.el; if (o.zoom != null) cam.tZoom = o.zoom; if (o.rate) cam.rate = o.rate; return { az: cam.tAz, el: cam.tEl, zoom: cam.tZoom }; },
    camNow: () => ({ az: cam.az, el: cam.el, zoom: cam.zoom, baseAz: cam.baseAz, baseEl: cam.baseEl }),
    rect: (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; },
    types: () => [...new Set(pileItems().map((p) => p.type))],
    tray: () => S.tray.map((t) => t.type),
  },
};

// ── Açılış ──────────────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    resize();
    await initPhysics();
    const start = Math.max(0, Math.min(LEVELS.length - 1, (Number(params.get("level")) || 1) - 1));
    for (const t of Object.keys(ITEMS)) proto(t);
    loadLevel(start);
    renderer.compile(scene, camera);
    // tepsi çizicisi için de eşya programlarını önceden derle (ilk toplamada takılma olmasın)
    const warm = new THREE.Group();
    for (const p of protos.values()) warm.add(p.model.clone());
    overlay.add(warm);
    orenderer.compile(overlay, ocam);
    overlay.remove(warm);
    window.__bootMs = Math.round(performance.now());
    requestAnimationFrame((t) => { last = t; frame(t); });
    const loading = $("#loading");
    setTimeout(() => { loading.classList.add("open"); sound.shutter(true); setTimeout(() => (loading.hidden = true), 900); }, 250);
    if (params.get("state") === "done") setTimeout(finishInstantly, 50);
    if (params.get("autoplay") === "1") setInterval(autoStep, Number(params.get("tick") || 520));
    if (params.get("result")) setTimeout(() => showResult(params.get("result") === "won", { stars: 3, elapsed: 83 }), 300);
  } catch (err) {
    console.error(err);
    $("#loading-message").textContent = "Could not start: " + (err && err.message ? err.message : err);
  }
}
boot();
