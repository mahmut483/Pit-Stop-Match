// Oto tamirci dükkânı: izometrik kesit oda (sol duvar x=-5, sağ duvar z=-5, zemin y=0).
// Sol duvar: takım dolabı (köşe), tezgâh + delikli pano, pencere altı çay ocağı, önde çay masası.
// Sağ duvar: yağ rafı, varil, kepenk önünde sarı taksi, köşede lastik yığını.
// Dışa aktarılanlar: kök grup, eşya yuvaları (homes), dağınıklık düzenekleri (rigs), yığın alanı.
import * as THREE from "three";
import { Parts, PAL, D2R } from "./kit.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyGrime } from "./grime.js";

export const ROOM = { x0: -5, x1: 5, z0: -5, z1: 5, wallH: 4.3, wallT: 0.32, slab: 0.55 };
// Dağınık eşyaların döküldüğü alan (zemin işaretli bölge)
export const PILE = { x0: -2.35, x1: 3.35, z0: -0.75, z1: 3.75 };

// ── Doku yardımcıları ───────────────────────────────────────────────────────────────────
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function texMat(tex, cat, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: opts.roughness ?? 0.8, metalness: 0, transparent: !!opts.transparent });
  if (cat) applyGrime(m, cat);
  return m;
}
function texPlane(w, h, mat, o = {}) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  if (o.pos) mesh.position.set(...o.pos);
  if (o.rot) mesh.rotation.set(o.rot[0] * D2R, o.rot[1] * D2R, o.rot[2] * D2R);
  mesh.receiveShadow = true;
  return mesh;
}
// Basit tohumlu rastgele (doku gürültüsü için)
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Düzenek: kapalı (toparlanmış) ve dağınık iki dönüşüm arasında t ∈ [0,1] (1 = toparlanmış)
class Rig {
  constructor(id, obj, messy, opts = {}) {
    this.id = id;
    this.obj = obj;
    this.closedPos = obj.position.clone();
    this.closedQuat = obj.quaternion.clone();
    this.messyPos = messy.pos ? new THREE.Vector3(...messy.pos) : this.closedPos.clone();
    this.messyQuat = messy.rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(messy.rot[0] * D2R, messy.rot[1] * D2R, messy.rot[2] * D2R)) : this.closedQuat.clone();
    this.hideWhenMessy = !!opts.hideWhenMessy;
    this.label = opts.label || id;
    this.t = 1;
  }
  set(t) {
    this.t = t;
    const k = Math.max(0, Math.min(1, t));
    this.obj.position.lerpVectors(this.messyPos, this.closedPos, k);
    this.obj.quaternion.slerpQuaternions(this.messyQuat, this.closedQuat, k);
    if (this.hideWhenMessy) {
      const s = Math.max(0.0001, t);
      this.obj.scale.setScalar(s);
      this.obj.visible = t > 0.001;
    }
  }
  // Kapalı hâldeki dünya matrisi (eşya yuvalarını düzeneğe bağlamak için)
  closedWorldMatrix() {
    const saveP = this.obj.position.clone(), saveQ = this.obj.quaternion.clone(), saveS = this.obj.scale.clone();
    this.obj.position.copy(this.closedPos); this.obj.quaternion.copy(this.closedQuat); this.obj.scale.setScalar(1);
    this.obj.updateMatrixWorld(true);
    const m = this.obj.matrixWorld.clone();
    this.obj.position.copy(saveP); this.obj.quaternion.copy(saveQ); this.obj.scale.copy(saveS);
    this.obj.updateMatrixWorld(true);
    return m;
  }
}

export function buildRoom() {
  const root = new THREE.Group();
  root.name = "room";
  const rigs = {};
  const homes = {};
  const home = (type, list, wall) => { homes[type] = wall ? list.map((h) => ({ wall, ...h })) : list; };
  // wall: "left" | "right" → hidden (camera layer) while the camera is behind that wall (main.js)
  const addParts = (P, cat, parent = root, wall) => { const g = P.build({ cat }); if (wall) g.userData.wall = wall; parent.add(g); return g; };
  const onWall = (obj, wall) => { obj.userData.wall = wall; return obj; };
  const rigGroup = (name, pos, parent = root) => { const g = new THREE.Group(); g.name = name; g.userData.rig = true; g.position.set(...pos); parent.add(g); return g; };

  const { wallH: H, wallT: T, slab: S } = ROOM;

  // ── Zemin döşemesi + kaide ──────────────────────────────────────────────────────────
  {
    const base = new Parts();
    base.box(10 + T, S, 10 + T, "#f0b27c", { pos: [-T / 2, -S / 2 - 0.01, -T / 2], r: 0.06 });
    base.box(10 + T + 0.02, 0.07, 10 + T + 0.02, "#e79f66", { pos: [-T / 2, -S + 0.02, -T / 2], r: 0.03 });
    addParts(base, null);

    const floorTex = canvasTex(1024, 1024, (g, w, h) => {
      const R = rng(7);
      const px = (x) => ((x + 5) / 10) * w;
      const pz = (z) => ((z + 5) / 10) * h;
      g.fillStyle = "#c7d0dc"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = R() < 0.5 ? "rgba(255,255,255,0.10)" : "rgba(120,135,160,0.07)";
        const s = 2 + R() * 7; g.fillRect(R() * w, R() * h, s, s);
      }
      // döşeme derzleri
      g.strokeStyle = "rgba(140,155,178,0.35)"; g.lineWidth = 2.2;
      for (let k = -5; k <= 5; k += 2.5) { g.beginPath(); g.moveTo(px(k), 0); g.lineTo(px(k), h); g.stroke(); g.beginPath(); g.moveTo(0, pz(k)); g.lineTo(w, pz(k)); g.stroke(); }
      // taksi park çizgileri
      g.strokeStyle = "#f3cd5a"; g.lineWidth = 9; g.lineCap = "round";
      g.beginPath(); g.moveTo(px(-0.15), pz(-4.9)); g.lineTo(px(-0.15), pz(-1.15)); g.stroke();
      g.beginPath(); g.moveTo(px(2.55), pz(-4.9)); g.lineTo(px(2.55), pz(-1.15)); g.stroke();
      // yığın alanı: ikaz şeritli kesik çerçeve
      const { x0, x1, z0, z1 } = PILE;
      g.setLineDash([26, 18]); g.lineWidth = 8; g.strokeStyle = "#f2c44c";
      roundRectPath(g, px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0), 24); g.stroke();
      g.setLineDash([]);
      g.lineWidth = 9; g.strokeStyle = "#5b6f96";
      const c = 46;
      for (const [x, z, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x0, z1, 1, -1], [x1, z1, -1, -1]]) {
        g.beginPath(); g.moveTo(px(x) + sx * 4, pz(z) + sz * c); g.lineTo(px(x) + sx * 4, pz(z) + sz * 4); g.lineTo(px(x) + sx * c, pz(z) + sz * 4); g.stroke();
      }
      // gider ızgarası
      g.fillStyle = "#b8c2cf"; roundRectPath(g, px(3.9) - 26, pz(3.9) - 26, 52, 52, 8); g.fill();
      g.strokeStyle = "#8f9bb0"; g.lineWidth = 4;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(px(3.9) - 18, pz(3.9) + i * 9); g.lineTo(px(3.9) + 18, pz(3.9) + i * 9); g.stroke(); }
    });
    const floor = texPlane(10, 10, texMat(floorTex, "floor", { roughness: 0.62 }), { rot: [-90, 0, 0] });
    floor.name = "floor";
    root.add(floor);
  }

  // ── Duvarlar ───────────────────────────────────────────────────────────────────────
  {
    const wallTex = canvasTex(1536, 640, (g, w, h) => {
      const R = rng(11);
      const ux = w / 10, uy = h / H;
      const tileTop = h - 1.35 * uy;
      g.fillStyle = "#f7ecda"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) { g.fillStyle = R() < 0.5 ? "rgba(255,255,255,0.18)" : "rgba(200,170,130,0.06)"; const s = 3 + R() * 10; g.fillRect(R() * w, R() * tileTop, s, s); }
      // alt fayans
      g.fillStyle = "#a6d8cb"; g.fillRect(0, tileTop, w, h - tileTop);
      const ts = 0.34 * ux;
      for (let y = tileTop; y < h; y += ts) for (let x = 0; x < w; x += ts) {
        const k = R() * 0.08;
        g.fillStyle = `rgba(255,255,255,${0.08 + k})`; g.fillRect(x + 2, y + 2, ts - 4, ts * 0.45);
      }
      g.strokeStyle = "#86c0b2"; g.lineWidth = 2.5;
      for (let y = tileTop; y <= h; y += ts) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (let x = 0; x <= w; x += ts) { g.beginPath(); g.moveTo(x, tileTop); g.lineTo(x, h); g.stroke(); }
      g.fillStyle = "#7db8aa"; g.fillRect(0, tileTop - 9, w, 14);
      g.fillStyle = "#c4e6dc"; g.fillRect(0, tileTop - 9, w, 4);
    });
    const wallMat = texMat(wallTex, "wall", { roughness: 0.9 });

    // each wall is its own piece: body, top trim, end trim, skirting
    const shellL = new Parts(), shellR = new Parts();
    // sol duvar gövdesi (x = -5.32 … -5.02), sağ duvar (z = -5.32 … -5.02)
    shellL.box(T - 0.02, H, 10 + T, "#efe3cf", { pos: [-5 - T / 2 - 0.01, H / 2, -T / 2], r: 0.04 });
    shellR.box(10 - 0.02, H, T - 0.02, "#efe3cf", { pos: [0, H / 2, -5 - T / 2 - 0.01], r: 0.04 });
    // üst kesit pervazı + uç kesitleri (şeftali)
    shellL.box(T + 0.1, 0.16, 10 + T + 0.1, "#f2ad72", { pos: [-5 - T / 2, H + 0.06, -T / 2 + 0.03], r: 0.05 });
    shellR.box(10 + 0.08, 0.16, T + 0.1, "#f2ad72", { pos: [0.04 - 0.02, H + 0.06, -5 - T / 2], r: 0.05 });
    shellL.box(T + 0.1, H + 0.12, 0.14, "#f2ad72", { pos: [-5 - T / 2, H / 2, 5 + 0.03], r: 0.05 });
    shellR.box(0.14, H + 0.12, T + 0.1, "#f2ad72", { pos: [5 + 0.03, H / 2, -5 - T / 2], r: 0.05 });
    // süpürgelik
    shellL.box(0.06, 0.16, 10, "#7db8aa", { pos: [-4.99, 0.08, 0], r: 0.02 });
    shellR.box(10, 0.16, 0.06, "#7db8aa", { pos: [0, 0.08, -4.99], r: 0.02 });
    addParts(shellL, "wall", root, "left");
    addParts(shellR, "wall", root, "right");

    const left = texPlane(10, H, wallMat, { pos: [-5.0, H / 2, 0], rot: [0, 90, 0] });
    const right = texPlane(10, H, wallMat, { pos: [0, H / 2, -5.0] });
    left.name = "wall-left"; right.name = "wall-right";
    root.add(onWall(left, "left"), onWall(right, "right"));
  }

  // ── Pencere (sol duvar, çay köşesinin üstü) ─────────────────────────────────────────
  {
    const wz = 1.6, wy = 2.65, ww = 1.7, wh = 1.45;
    const sky = canvasTex(256, 220, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#9fd0f6"); gr.addColorStop(1, "#dff0fb");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,0.9)";
      for (const [x, y, r] of [[60, 50, 22], [84, 44, 26], [108, 52, 20], [190, 80, 16], [208, 74, 20]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      // karşı sanayi dükkânları siluetleri
      g.fillStyle = "#c6d3e6"; g.fillRect(0, 140, 90, 80); g.fillRect(150, 125, 106, 95);
      g.fillStyle = "#b3c3da"; g.fillRect(80, 150, 80, 70);
      g.fillStyle = "#9cc98a"; for (const [x, r] of [[30, 28], [130, 34], [220, 26]]) { g.beginPath(); g.arc(x, 200, r, 0, 7); g.fill(); }
    });
    const pane = texPlane(ww - 0.12, wh - 0.12, new THREE.MeshBasicMaterial({ map: sky, toneMapped: false }), { pos: [-4.985, wy, wz], rot: [0, 90, 0] });
    root.add(onWall(pane, "left"));
    const fr = new Parts();
    const c = "#fbf3e4";
    fr.box(0.12, 0.12, ww + 0.1, c, { pos: [-4.94, wy + wh / 2, wz] });
    fr.box(0.12, 0.12, ww + 0.1, c, { pos: [-4.94, wy - wh / 2, wz] });
    fr.box(0.12, wh, 0.12, c, { pos: [-4.94, wy, wz - ww / 2] });
    fr.box(0.12, wh, 0.12, c, { pos: [-4.94, wy, wz + ww / 2] });
    fr.box(0.07, wh - 0.1, 0.06, c, { pos: [-4.95, wy, wz] });
    fr.box(0.07, 0.06, ww - 0.1, c, { pos: [-4.95, wy + 0.12, wz] });
    fr.box(0.26, 0.08, ww + 0.3, "#f2ad72", { pos: [-4.88, wy - wh / 2 - 0.08, wz], r: 0.03 });
    addParts(fr, "furniture", root, "left");
  }

  // ── Takım dolabı (köşe, çekmeceler +x yönüne açılır) ───────────────────────────────
  {
    const cx = -4.53, cz = -4.25, w = 1.4, d = 0.92, h = 1.68, y0 = 0.14;
    const body = new Parts();
    body.box(d, h, w, PAL.red, { pos: [cx, y0 + h / 2, cz], r: 0.06 });
    body.box(d + 0.04, 0.1, w + 0.04, "#aab6c6", { pos: [cx, y0 + h + 0.05, cz], r: 0.035, finish: "satin" });
    for (const [dx, dz] of [[-0.32, -0.55], [0.32, -0.55], [-0.32, 0.55], [0.32, 0.55]]) {
      body.cyl(0.06, 0.06, 0.06, PAL.charcoal, { pos: [cx + dx, 0.06, cz + dz], rot: [90, 0, 0] });
      body.box(0.08, 0.05, 0.08, PAL.steelDark, { pos: [cx + dx, 0.115, cz + dz], finish: "metal" });
    }
    // yan kulp
    body.box(0.06, 0.06, 0.5, PAL.steel, { pos: [cx, y0 + h - 0.15, cz + w / 2 + 0.07], rot: [0, 90, 0], finish: "metal" });
    addParts(body, "furniture");
    const counterTop = new Parts();
    counterTop.box(d - 0.02, 0.02, w - 0.04, "#b9c4d3", { pos: [cx, y0 + h + 0.11, cz], r: 0.005 });
    addParts(counterTop, "counter");

    const drawers = [[0.18, 0.5], [0.72, 0.3], [1.06, 0.26], [1.36, 0.26]];
    const recess = new Parts();
    for (const [yb, dh] of drawers) recess.box(0.012, dh - 0.06, w - 0.18, "#5a4a52", { pos: [cx + d / 2 - 0.004, y0 + yb + dh / 2, cz], r: 0.004 });
    addParts(recess, null);
    const outs = [0.42, 0.55, 0.34, 0.5];
    drawers.forEach(([yb, dh], i) => {
      const yc = y0 + yb + dh / 2;
      const g = rigGroup("drawer" + (i + 1), [cx + d / 2, yc, cz]);
      const P = new Parts();
      P.box(0.06, dh - 0.04, w - 0.14, i % 2 ? "#f4948a" : "#f6a198", { pos: [0.03, 0, 0], r: 0.025 });
      P.box(0.05, 0.05, w * 0.5, PAL.creamHi, { pos: [0.085, dh * 0.18, 0], r: 0.02, finish: "satin" });
      P.box(d - 0.12, dh - 0.1, w - 0.2, "#c3ccd8", { pos: [-(d - 0.12) / 2, -0.01, 0], r: 0.02 });
      // çekmece içi küçük aletler (açıkken görünür)
      const colors = [PAL.yellow, PAL.blue, PAL.mint, PAL.coral];
      for (let k = 0; k < 4; k++) P.box(0.26, 0.05, 0.1, colors[(k + i) % 4], { pos: [-0.2 - (k % 2) * 0.32, dh / 2 - 0.05, -0.38 + k * 0.25], rot: [0, 25 * (k - 1.5), 0] });
      addParts(P, "furniture", g);
      rigs["drawer" + (i + 1)] = new Rig("drawer" + (i + 1), g, { pos: [cx + d / 2 + outs[i], yc, cz] }, { label: "Tool chest drawer " + (i + 1) });
    });
    home("radio", [{ pos: [cx + 0.05, y0 + h + 0.12, cz + 0.12], rot: [0, 90, 0] }]);
  }

  // ── Tezgâh + mengene ───────────────────────────────────────────────────────────────
  const BENCH = { x0: -5, x1: -3.82, z0: -3.48, z1: 0.32, top: 1.17 };
  {
    const { x0, x1, z0, z1, top } = BENCH;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, L = z1 - z0, Dp = x1 - x0;
    const tp = new Parts();
    tp.box(Dp, 0.12, L, PAL.wood, { pos: [cx, top - 0.06, cz], r: 0.04 });
    tp.box(0.04, 0.13, L - 0.1, PAL.woodDark, { pos: [x1 - 0.015, top - 0.065, cz], r: 0.015 });
    addParts(tp, "counter");
    const fr = new Parts();
    const steel = "#86a2cc";
    for (const [lx, lz] of [[x0 + 0.12, z0 + 0.12], [x1 - 0.1, z0 + 0.12], [x0 + 0.12, z1 - 0.12], [x1 - 0.1, z1 - 0.12]]) fr.box(0.1, top - 0.12, 0.1, steel, { pos: [lx, (top - 0.12) / 2, lz], r: 0.025 });
    fr.box(0.06, 0.12, L - 0.1, steel, { pos: [x1 - 0.08, top - 0.18, cz], r: 0.02 });
    fr.box(Dp - 0.12, 0.07, L - 0.16, PAL.woodLight, { pos: [cx, 0.33, cz], r: 0.02 });
    // tezgâh altı çekmece bloğu
    fr.box(Dp - 0.2, 0.5, 0.9, "#9cb5da", { pos: [cx + 0.02, top - 0.4, z1 - 0.6], r: 0.04 });
    fr.box(0.04, 0.2, 0.78, "#b3c7e6", { pos: [x1 - 0.06, top - 0.29, z1 - 0.6], r: 0.02 });
    fr.box(0.04, 0.2, 0.78, "#b3c7e6", { pos: [x1 - 0.06, top - 0.52, z1 - 0.6], r: 0.02 });
    fr.box(0.05, 0.04, 0.3, PAL.creamHi, { pos: [x1 - 0.03, top - 0.27, z1 - 0.6], r: 0.015 });
    fr.box(0.05, 0.04, 0.3, PAL.creamHi, { pos: [x1 - 0.03, top - 0.5, z1 - 0.6], r: 0.015 });
    // mengene
    const vz = z1 - 0.32, vx = x1 - 0.12;
    fr.box(0.36, 0.1, 0.34, "#7f98c2", { pos: [vx - 0.08, top + 0.05, vz], r: 0.03, finish: "satin" });
    fr.box(0.14, 0.24, 0.36, "#6f8ab8", { pos: [vx - 0.16, top + 0.2, vz], r: 0.03, finish: "satin" });
    fr.box(0.14, 0.24, 0.36, "#6f8ab8", { pos: [vx + 0.06, top + 0.2, vz], r: 0.03, finish: "satin" });
    fr.box(0.06, 0.2, 0.34, PAL.steel, { pos: [vx - 0.06, top + 0.22, vz], r: 0.01, finish: "metal" });
    fr.cyl(0.03, 0.03, 0.42, PAL.chrome, { pos: [vx + 0.24, top + 0.2, vz], rot: [0, 0, 90], finish: "metal" });
    fr.cyl(0.018, 0.018, 0.36, PAL.chrome, { pos: [vx + 0.44, top + 0.2, vz], rot: [90, 0, 0], finish: "metal" });
    fr.sphere(0.035, PAL.red, { pos: [vx + 0.44, top + 0.2, vz + 0.19] });
    fr.sphere(0.035, PAL.red, { pos: [vx + 0.44, top + 0.2, vz - 0.19] });
    addParts(fr, "furniture");

    home("sparkPlug", [0, 1, 2].map((i) => ({ pos: [x0 + 0.3, top, z0 + 0.22 + i * 0.2], rot: [0, 0, 0] })));
    home("gear", [{ pos: [x0 + 0.42, top, z0 + 1.0], rot: [0, 15, 0] }]);
    home("boltJar", [{ pos: [x0 + 0.32, top, z0 + 1.62] }, { pos: [x0 + 0.32, top, z0 + 2.04] }]);
    home("flashlight", [{ pos: [x1 - 0.3, top, z0 + 1.55], rot: [0, -70, 0] }]);
    home("gloves", [{ pos: [x1 - 0.42, top, z0 + 2.45], rot: [0, 100, 0] }]);
    home("sponge", [{ pos: [x1 - 0.32, top, z0 + 0.55], rot: [0, 80, 0] }]);
    home("rag", [{ pos: [x1 - 0.42, top, z0 + 3.0], rot: [0, 20, 0] }]);
    home("battery", [{ pos: [cx, 0.37, z0 + 0.7], rot: [0, 90, 0] }, { pos: [cx, 0.37, z0 + 1.45], rot: [0, 90, 0] }]);
  }

  // ── Delikli pano (aletler + silüetler) — düzenek: eğik asılı ─────────────────────────
  {
    const pz0 = -3.32, pz1 = 0.18, py0 = 1.5, py1 = 3.38;
    const pw = pz1 - pz0, ph = py1 - py0;
    const pcz = (pz0 + pz1) / 2, pcy = (py0 + py1) / 2;
    // asılı aletler: z merkez, y merkez, silüet türü
    const tools = [["wrench", -2.85, 2.48], ["hammer", -2.18, 2.45], ["screwdriver", -1.52, 2.46], ["pliers", -0.9, 2.47]];
    const tex = canvasTex(1024, 552, (g, w, h) => {
      const pu = (z) => ((pz1 - z) / pw) * w;
      const pv = (y) => (1 - (y - py0) / ph) * h;
      g.fillStyle = "#f1d4a4"; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(0, 0, w, h * 0.08);
      g.fillStyle = "#c9a26f";
      for (let y = 14; y < h; y += 26) for (let x = 14; x < w; x += 26) { g.beginPath(); g.arc(x, y, 4.2, 0, 7); g.fill(); }
      // alet silüetleri (yerleşecekleri yerler)
      g.fillStyle = "rgba(120,92,60,0.5)";
      const sx = w / pw;
      const shape = (type, cz, cy) => {
        const x = pu(cz), y = pv(cy);
        g.save(); g.translate(x, y);
        if (type === "wrench") { roundRectPath(g, -0.05 * sx, -0.4 * sx, 0.1 * sx, 0.8 * sx, 10); g.fill(); g.beginPath(); g.arc(0, -0.36 * sx, 0.1 * sx, 0, 7); g.fill(); g.beginPath(); g.arc(0, 0.37 * sx, 0.09 * sx, 0, 7); g.fill(); }
        if (type === "hammer") { roundRectPath(g, -0.04 * sx, -0.3 * sx, 0.08 * sx, 0.68 * sx, 10); g.fill(); roundRectPath(g, -0.16 * sx, -0.4 * sx, 0.32 * sx, 0.12 * sx, 10); g.fill(); }
        if (type === "screwdriver") { roundRectPath(g, -0.065 * sx, 0.05 * sx, 0.13 * sx, 0.33 * sx, 14); g.fill(); roundRectPath(g, -0.022 * sx, -0.4 * sx, 0.044 * sx, 0.5 * sx, 6); g.fill(); }
        if (type === "pliers") { g.rotate(0.12); roundRectPath(g, -0.07 * sx, -0.05 * sx, 0.05 * sx, 0.4 * sx, 10); g.fill(); g.rotate(-0.24); roundRectPath(g, 0.02 * sx, -0.05 * sx, 0.05 * sx, 0.4 * sx, 10); g.fill(); g.rotate(0.12); roundRectPath(g, -0.05 * sx, -0.35 * sx, 0.1 * sx, 0.32 * sx, 12); g.fill(); }
        g.restore();
      };
      for (const [t, z, y] of tools) shape(t, z, y);
      // askı kancaları
      g.fillStyle = "#8e98a8";
      for (const [t, z, y] of tools) { g.beginPath(); g.arc(pu(z), pv(y + 0.5), 7, 0, 7); g.fill(); }
      g.beginPath(); g.arc(pu(-0.25), pv(2.95), 7, 0, 7); g.fill();
    });
    // eğik pano düzeneği: sol üst vida noktası etrafında döner
    const pivot = onWall(rigGroup("pegboard", [-4.93, py1 - 0.12, pz0 + 0.12]), "left");
    const inner = new THREE.Group();
    inner.position.set(0, -(py1 - 0.12) , -(pz0 + 0.12));
    pivot.add(inner);
    const board = texPlane(pw, ph, texMat(tex, "furniture", { roughness: 0.85 }), { pos: [0.035, pcy, pcz], rot: [0, 90, 0] });
    inner.add(board);
    const fr = new Parts();
    fr.box(0.06, ph + 0.1, pw + 0.1, "#d9b07a", { pos: [0.0, pcy, pcz], r: 0.02 });
    fr.box(0.08, 0.08, pw + 0.16, PAL.woodDark, { pos: [0.02, py1 + 0.02, pcz], r: 0.03 });
    fr.box(0.08, 0.08, pw + 0.16, PAL.woodDark, { pos: [0.02, py0 - 0.02, pcz], r: 0.03 });
    for (const [z, y] of [[pz0 + 0.12, py1 - 0.12], [pz1 - 0.12, py1 - 0.12], [pz0 + 0.12, py0 + 0.12], [pz1 - 0.12, py0 + 0.12]]) fr.cyl(0.035, 0.035, 0.03, PAL.chrome, { pos: [0.07, y, z], rot: [0, 0, 90], finish: "metal" });
    addParts(fr, "furniture", inner);
    // pano üstü küçük raf
    rigs.pegboard = new Rig("pegboard", pivot, { rot: [-9, 0, 0] }, { label: "Pegboard" });
    // aletler: yassı duruş → duvara asılı (uzun eksen dikey, baş yukarı, yüz +x)
    const hang = (type, z, y) => ({ pos: [-4.885, y, z], rot: [180, 0, -90], parent: "pegboard" });
    for (const [t, z, y] of tools) home(t, [hang(t, z, y)]);
    home("tapeRoll", [{ pos: [-4.885, 2.8, -0.25], rot: [0, 0, -90], parent: "pegboard" }]);
  }

  // ── Plaka + saat (sol duvar üstü) ──────────────────────────────────────────────────
  home("plate", [{ pos: [-4.97, 3.82, -1.55], rot: [90, 0, -90] }], "left");
  home("clock", [{ pos: [-4.97, 3.83, 1.6], rot: [0, 0, -90] }], "left");

  // ── Çay ocağı dolabı (pencere altı) ─────────────────────────────────────────────────
  {
    const x0 = -5, x1 = -4.28, z0 = 0.72, z1 = 2.48, h = 0.95;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const P = new Parts();
    P.box(x1 - x0, h - 0.06, z1 - z0, "#9cc6e8", { pos: [cx, (h - 0.06) / 2, cz], r: 0.05 });
    P.box(0.05, h - 0.22, (z1 - z0) / 2 - 0.08, "#b6d6f0", { pos: [x1 + 0.005, h / 2 - 0.02, cz - (z1 - z0) / 4], r: 0.025 });
    P.box(0.05, h - 0.22, (z1 - z0) / 2 - 0.08, "#b6d6f0", { pos: [x1 + 0.005, h / 2 - 0.02, cz + (z1 - z0) / 4], r: 0.025 });
    P.box(0.05, 0.22, 0.04, PAL.creamHi, { pos: [x1 + 0.04, h / 2, cz - 0.1], r: 0.015 });
    P.box(0.05, 0.22, 0.04, PAL.creamHi, { pos: [x1 + 0.04, h / 2, cz + 0.1], r: 0.015 });
    // tüplü ocak
    const sz = z0 + 0.6;
    P.box(0.5, 0.1, 0.62, "#c7cfda", { pos: [cx + 0.02, h + 0.05, sz], r: 0.03, finish: "satin" });
    P.torus(0.15, 0.025, PAL.charcoal, { pos: [cx + 0.02, h + 0.11, sz], rot: [90, 0, 0] });
    for (let k = 0; k < 4; k++) P.box(0.3, 0.03, 0.03, PAL.charcoal, { pos: [cx + 0.02, h + 0.12, sz], rot: [0, 45 * k, 0], r: 0.01 });
    P.cyl(0.035, 0.035, 0.04, PAL.red, { pos: [x1 - 0.06, h + 0.06, sz + 0.2], rot: [0, 0, 90] });
    addParts(P, "furniture");
    const top = new Parts();
    top.box(x1 - x0 + 0.04, 0.06, z1 - z0 + 0.04, PAL.woodLight, { pos: [cx, h - 0.03, cz], r: 0.025 });
    addParts(top, "counter");
    home("teapot", [{ pos: [cx + 0.02, h + 0.13, sz], rot: [0, -30, 0] }]);
    home("tavla", [{ pos: [cx + 0.02, h, z1 - 0.42], rot: [0, 90, 0] }]);
  }

  // ── Temizlik askısı (sol duvar, pencere ile masa arası): paspas + rulo başı aşağı asılı ──
  {
    const P = new Parts();
    P.box(0.06, 0.12, 1.0, PAL.woodDark, { pos: [-4.97, 2.12, 3.05], r: 0.03 });
    for (const z of [2.78, 3.32]) {
      P.cyl(0.025, 0.025, 0.14, PAL.steelDark, { pos: [-4.9, 2.12, z], rot: [0, 0, 90], finish: "metal" });
      P.sphere(0.035, PAL.steel, { pos: [-4.83, 2.12, z], finish: "metal" });
    }
    addParts(P, "furniture", root, "left");
    home("mop", [{ pos: [-4.96, 1.42, 2.78], rot: [0, 0, -90] }], "left");
    home("roller", [{ pos: [-4.96, 1.66, 3.32], rot: [0, 0, -90] }], "left");
  }

  // ── Çay masası + tabureler ─────────────────────────────────────────────────────────
  {
    const tx = -3.78, tz = 3.55, tw = 1.25, td = 0.86, th = 0.78;
    const P = new Parts();
    P.box(tw, 0.07, td, PAL.woodLight, { pos: [tx, th - 0.035, tz], r: 0.03 });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(0.07, th - 0.07, 0.07, PAL.woodDark, { pos: [tx + dx * (tw / 2 - 0.1), (th - 0.07) / 2, tz + dz * (td / 2 - 0.1)], r: 0.02 });
    P.box(tw - 0.2, 0.05, 0.04, PAL.woodDark, { pos: [tx, 0.2, tz + td / 2 - 0.1], r: 0.015 });
    P.box(tw - 0.2, 0.05, 0.04, PAL.woodDark, { pos: [tx, 0.2, tz - td / 2 + 0.1], r: 0.015 });
    // tepsi + simit tabağı
    P.cyl(0.33, 0.33, 0.03, PAL.chrome, { pos: [tx - 0.2, th + 0.015, tz - 0.05], finish: "metal" });
    P.torus(0.33, 0.015, PAL.steel, { pos: [tx - 0.2, th + 0.035, tz - 0.05], rot: [90, 0, 0], finish: "metal" });
    P.cyl(0.24, 0.2, 0.025, PAL.white, { pos: [tx + 0.36, th + 0.0125, tz + 0.14] });
    addParts(P, "counter");
    home("teaGlass", [[-0.12, -0.1], [0.12, -0.14], [0.0, 0.1]].map(([dx, dz]) => ({ pos: [tx - 0.2 + dx, th + 0.03, tz - 0.05 + dz] })));
    home("simit", [{ pos: [tx + 0.36, th + 0.025, tz + 0.14], rot: [0, 20, 0] }]);

    const stool = (name, pos, messy) => {
      const g = rigGroup(name, pos);
      const S2 = new Parts();
      S2.cyl(0.24, 0.24, 0.07, "#f39d86", { pos: [0, 0.53, 0] });
      S2.cyl(0.2, 0.2, 0.02, "#f7b7a4", { pos: [0, 0.57, 0] });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        S2.cyl(0.03, 0.035, 0.52, PAL.woodDark, { pos: [Math.cos(a) * 0.14, 0.25, Math.sin(a) * 0.14], rot: [Math.sin(a) * -8, 0, Math.cos(a) * 8] });
      }
      S2.torus(0.15, 0.015, PAL.woodDark, { pos: [0, 0.2, 0], rot: [90, 0, 0] });
      addParts(S2, "furniture", g);
      rigs[name] = new Rig(name, g, messy, { label: "Stool" });
    };
    stool("stool1", [-2.78, 0, 3.25], { pos: [-2.75, 0.24, 2.55], rot: [0, 0, 90] });
    stool("stool2", [-3.55, 0, 4.42], { pos: [-3.05, 0.24, 4.6], rot: [-90, 0, 0] });
  }

  // ── Yağ rafı (sağ duvar) — 3. raf eğik düzeneği ─────────────────────────────────────
  {
    const x0 = -3.95, x1 = -2.2, z0 = -5, z1 = -4.32, h = 3.3;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0, Dp = z1 - z0;
    const levels = [0.16, 0.96, 1.76, 2.56];
    const P = new Parts();
    const post = "#7f9fd6";
    for (const [px, pz] of [[x0 + 0.04, z0 + 0.06], [x1 - 0.04, z0 + 0.06], [x0 + 0.04, z1 - 0.04], [x1 - 0.04, z1 - 0.04]]) P.box(0.07, h, 0.07, post, { pos: [px, h / 2, pz], r: 0.02 });
    levels.forEach((y, i) => { if (i !== 2) P.box(W, 0.06, Dp, "#bcd2f0", { pos: [cx, y - 0.03, cz], r: 0.02 }); });
    P.box(W, 0.06, Dp, "#bcd2f0", { pos: [cx, h - 0.03, cz], r: 0.02 });
    addParts(P, "furniture");
    // eğik raf
    const pivot = rigGroup("shelf3", [x0 + 0.08, levels[2], cz]);
    const SB = new Parts();
    SB.box(W - 0.1, 0.06, Dp - 0.02, "#bcd2f0", { pos: [(W - 0.1) / 2 - 0.03, -0.03, 0], r: 0.02 });
    addParts(SB, "furniture", pivot);
    rigs.shelf3 = new Rig("shelf3", pivot, { rot: [0, 0, -11] }, { label: "Tilted shelf" });

    const row = (y, n, dx0, step, extra = {}) => Array.from({ length: n }, (_, i) => ({ pos: [x0 + dx0 + i * step, y, cz + 0.02], ...extra }));
    home("antifreeze", row(levels[0], 3, 0.35, 0.5, { rot: [0, 0, 0] }));
    home("oilFilter", row(levels[1], 3, 0.35, 0.52));
    home("oilCan", row(levels[2], 3, 0.36, 0.52).map((h2) => ({ ...h2, parent: "shelf3" })));
    home("sprayCan", row(levels[3], 3, 0.42, 0.42));
  }

  // ── Varil (devrik düzenek) + bidonlar ───────────────────────────────────────────────
  {
    const bx = -1.35, bz = -4.42;
    const g = rigGroup("barrel", [bx, 0, bz]);
    const P = new Parts();
    P.cyl(0.4, 0.4, 1.02, "#8fb6ea", { pos: [0, 0.51, 0], bevel: 0.05 });
    for (const y of [0.22, 0.51, 0.8]) P.torus(0.405, 0.025, "#7aa3dc", { pos: [0, y, 0], rot: [90, 0, 0] });
    P.cyl(0.33, 0.33, 0.02, "#a9c8f2", { pos: [0, 1.025, 0] });
    P.cyl(0.06, 0.06, 0.04, PAL.yellow, { pos: [0.18, 1.04, 0.06] });
    P.box(0.32, 0.22, 0.02, PAL.creamHi, { pos: [0, 0.55, 0.405], r: 0.01 });
    addParts(P, "furniture", g);
    rigs.barrel = new Rig("barrel", g, { pos: [bx + 0.45, 0.4, bz + 0.62], rot: [0, -35, 90] }, { label: "Tipped barrel" });
    home("funnel", [{ pos: [bx + 0.06, 1.04, bz + 0.0], parent: "barrel" }]);
    home("jerrycan", [{ pos: [bx + 0.72, 0, -4.82], rot: [0, -8, 0] }, { pos: [bx + 0.8, 0, -4.42], rot: [0, 8, 0] }]);
  }

  // ── Kepenk + tabela (sağ duvar) ─────────────────────────────────────────────────────
  {
    const x0 = -0.45, x1 = 2.85, h = 3.05;
    const cx = (x0 + x1) / 2, W = x1 - x0;
    const P = new Parts();
    const slat = 0.16;
    for (let y = 0.02, i = 0; y < h - 0.05; y += slat, i++) P.box(W - 0.1, slat - 0.015, 0.06, i % 2 ? "#c2cede" : "#b4c2d6", { pos: [cx, y + slat / 2, -4.95], r: 0.025 });
    P.box(W + 0.2, 0.42, 0.38, "#94a7c4", { pos: [cx, h + 0.2, -4.86], r: 0.08 });
    P.box(0.12, h, 0.14, "#8ea0bc", { pos: [x0 - 0.02, h / 2, -4.93], r: 0.03 });
    P.box(0.12, h, 0.14, "#8ea0bc", { pos: [x1 + 0.02, h / 2, -4.93], r: 0.03 });
    P.box(W - 0.1, 0.1, 0.1, "#9eb0cb", { pos: [cx, 0.08, -4.9], r: 0.03 });
    P.box(0.34, 0.06, 0.06, PAL.steelDark, { pos: [cx, 0.22, -4.88], r: 0.025, finish: "metal" });
    addParts(P, "furniture", root, "right");

    const signTex = canvasTex(1024, 220, (g, w, h2) => {
      g.fillStyle = "#fbe39a"; roundRectPath(g, 6, 6, w - 12, h2 - 12, 40); g.fill();
      g.lineWidth = 12; g.strokeStyle = "#ef8a74"; roundRectPath(g, 14, 14, w - 28, h2 - 28, 34); g.stroke();
      g.fillStyle = "#24407f";
      let fs = 120;
      do { g.font = `900 ${fs}px 'Arial Rounded MT Bold', 'Nunito', 'Trebuchet MS', sans-serif`; fs -= 4; } while (g.measureText("AUTO REPAIR").width > w - 200);
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("AUTO REPAIR", w / 2, h2 / 2 + 8);
      g.fillStyle = "#ef8a74"; for (const x of [70, w - 70]) { g.beginPath(); g.arc(x, h2 / 2, 18, 0, 7); g.fill(); }
    });
    const sign = texPlane(2.6, 0.56, new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7 }), { pos: [cx, 3.78, -4.86] });
    root.add(onWall(sign, "right"));
    const SB = new Parts();
    SB.box(2.66, 0.62, 0.06, "#e9926f", { pos: [cx, 3.78, -4.9], r: 0.03 });
    addParts(SB, "wall", root, "right");
  }

  // ── Takvim (sağ duvar, varilin üstü) — eğik düzenek ─────────────────────────────────
  {
    const px = -1.35, py = 2.45;
    const g = onWall(rigGroup("poster", [px, py + 0.42, -4.97]), "right");
    const tex = canvasTex(256, 340, (c, w, h) => {
      c.fillStyle = "#fffaf0"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#ef8a74"; c.fillRect(0, 0, w, 120);
      c.fillStyle = "#9fd8c4"; roundRectPath(c, 22, 18, w - 44, 84, 20); c.fill();
      // küçük taksi çizimi
      c.fillStyle = "#f7d36b"; roundRectPath(c, 54, 52, 150, 36, 12); c.fill(); roundRectPath(c, 88, 30, 82, 30, 10); c.fill();
      c.fillStyle = "#4a4f5c"; for (const x of [88, 172]) { c.beginPath(); c.arc(x, 90, 13, 0, 7); c.fill(); }
      c.fillStyle = "#24407f"; c.font = "900 30px 'Arial Rounded MT Bold', sans-serif"; c.textAlign = "center"; c.fillText("OCTOBER", w / 2, 160);
      c.fillStyle = "#97a3b4";
      for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) { c.fillRect(22 + k * 31, 185 + r * 30, 20, 16); }
      c.fillStyle = "#ef8a74"; c.fillRect(22 + 4 * 31, 185 + 2 * 30, 20, 16);
    });
    const plane = texPlane(0.62, 0.82, texMat(tex, "furniture"), { pos: [0, -0.42, 0.012] });
    g.add(plane);
    const P = new Parts();
    P.box(0.68, 0.88, 0.02, "#e8dcc6", { pos: [0, -0.42, 0], r: 0.008 });
    P.sphere(0.035, PAL.red, { pos: [0, 0.0, 0.03] });
    addParts(P, "furniture", g);
    rigs.poster = new Rig("poster", g, { rot: [0, 0, 16] }, { label: "Crooked calendar" });
  }

  // ── Sarı taksi (kepenk önünde, burnu +z) ────────────────────────────────────────────
  {
    const cx = 1.2, zr = -4.82, zf = -1.32, W = 1.74;
    const wr = 0.33, wy = 0.345;
    const wheelZ = [-4.12, -2.02], wheelX = [cx - 0.8, cx + 0.8];
    const Y = "#f7d36b", Ydark = "#efc556";
    const P = new Parts();
    // arka gövde (tam yükseklik) + ön bölme (motor yuvası)
    const zSplit = -2.55;
    P.box(W, 0.66, zSplit - zr, Y, { pos: [cx, 0.3 + 0.33, (zr + zSplit) / 2], r: 0.17 });
    P.box(W, 0.36, zf - zSplit + 0.12, Y, { pos: [cx, 0.3 + 0.18, (zSplit + zf) / 2 - 0.06], r: 0.14 });
    P.box(0.14, 0.32, zf - zSplit - 0.05, Y, { pos: [cx - W / 2 + 0.07, 0.78, (zSplit + zf) / 2 - 0.02], r: 0.06 });
    P.box(0.14, 0.32, zf - zSplit - 0.05, Y, { pos: [cx + W / 2 - 0.07, 0.78, (zSplit + zf) / 2 - 0.02], r: 0.06 });
    P.box(W - 0.2, 0.32, 0.12, Ydark, { pos: [cx, 0.78, zf - 0.08], r: 0.05 });
    // motor
    P.box(1.1, 0.28, 0.8, "#6b7385", { pos: [cx, 0.72, (zSplit + zf) / 2 - 0.05], r: 0.06 });
    P.cyl(0.07, 0.07, 0.06, PAL.yellow, { pos: [cx - 0.3, 0.89, -2.2] });
    P.box(0.22, 0.16, 0.2, "#a6d8cb", { pos: [cx + 0.35, 0.86, -2.25], r: 0.04 });
    P.cyl(0.12, 0.12, 0.08, "#4a4f5c", { pos: [cx + 0.05, 0.9, -1.85], rot: [90, 0, 0] });
    // kabin
    const cz0 = -4.25, cz1 = -2.6, cyb = 0.95, cyt = 1.55;
    P.box(1.5, 0.44, cz1 - cz0 - 0.04, "#bfe0f2", { pos: [cx, cyb + 0.24, (cz0 + cz1) / 2], r: 0.1, finish: "satin" });
    P.box(1.56, 0.14, cz1 - cz0 + 0.06, Y, { pos: [cx, cyt - 0.05, (cz0 + cz1) / 2], r: 0.07 });
    for (const z of [cz0 + 0.06, (cz0 + cz1) / 2, cz1 - 0.06]) for (const sx of [-1, 1]) P.box(0.08, 0.5, 0.11, Y, { pos: [cx + sx * 0.74, cyb + 0.25, z], r: 0.035 });
    P.box(1.5, 0.08, 0.08, Y, { pos: [cx, cyb + 0.03, cz1 + 0.02], r: 0.03 });
    // taksi lambası
    P.box(0.55, 0.17, 0.24, PAL.creamHi, { pos: [cx, cyt + 0.1, (cz0 + cz1) / 2 + 0.1], r: 0.06 });
    P.box(0.57, 0.05, 0.26, "#24407f", { pos: [cx, cyt + 0.1, (cz0 + cz1) / 2 + 0.1], r: 0.02 });
    // dama şeridi (iki yan)
    for (const sx of [-1, 1]) for (let i = 0; i < 26; i++) {
      const z = zr + 0.3 + i * 0.115;
      if (z > zf - 0.25) break;
      P.box(0.012, 0.055, 0.112, i % 2 ? "#3a3f4b" : "#fbfbf7", { pos: [cx + sx * (W / 2 + 0.004), 0.83, z], r: 0.003 });
      P.box(0.012, 0.055, 0.112, i % 2 ? "#fbfbf7" : "#3a3f4b", { pos: [cx + sx * (W / 2 + 0.004), 0.775, z], r: 0.003 });
    }
    // tamponlar, farlar, ızgara, stoplar
    P.box(W + 0.06, 0.16, 0.16, PAL.chrome, { pos: [cx, 0.4, zf + 0.02], r: 0.07, finish: "metal" });
    P.box(W + 0.06, 0.16, 0.16, PAL.chrome, { pos: [cx, 0.4, zr - 0.02], r: 0.07, finish: "metal" });
    for (const sx of [-1, 1]) {
      P.cyl(0.12, 0.12, 0.06, PAL.chrome, { pos: [cx + sx * 0.6, 0.66, zf + 0.0], rot: [90, 0, 0], finish: "metal" });
      P.cyl(0.095, 0.095, 0.03, "#fff7d6", { pos: [cx + sx * 0.6, 0.66, zf + 0.03], rot: [90, 0, 0], finish: "emit" });
      P.box(0.22, 0.12, 0.05, "#f27d7d", { pos: [cx + sx * 0.62, 0.7, zr - 0.01], r: 0.03 });
      P.box(0.06, 0.1, 0.14, Y, { pos: [cx + sx * 0.82, 1.05, cz1 - 0.05], r: 0.03 });
    }
    P.box(0.62, 0.17, 0.05, "#5b6375", { pos: [cx, 0.64, zf + 0.0], r: 0.04 });
    for (let i = -2; i <= 2; i++) P.box(0.03, 0.13, 0.03, PAL.chrome, { pos: [cx + i * 0.11, 0.64, zf + 0.03], finish: "metal" });
    P.box(0.42, 0.12, 0.02, PAL.white, { pos: [cx, 0.43, zf + 0.11], r: 0.01 });
    P.box(0.07, 0.12, 0.022, "#5d86c9", { pos: [cx - 0.175, 0.43, zf + 0.112], r: 0.005 });
    // kapı kolları
    for (const sx of [-1, 1]) for (const z of [-3.6, -2.9]) P.box(0.03, 0.04, 0.16, PAL.chrome, { pos: [cx + sx * (W / 2 + 0.01), 0.9, z], r: 0.015, finish: "metal" });
    addParts(P, "furniture");

    // tekerlekler (+x ön tekerlek eksik olabilir) ve sehpalar
    const wheel = () => {
      const Wp = new Parts();
      Wp.cyl(wr, wr, 0.26, "#4f5563", { rot: [0, 0, 90], bevel: 0.07 });
      Wp.cyl(wr * 0.55, wr * 0.55, 0.28, "#e5e9ef", { rot: [0, 0, 90], bevel: 0.03, finish: "metal" });
      Wp.cyl(wr * 0.2, wr * 0.2, 0.3, "#bfc8d4", { rot: [0, 0, 90], finish: "metal" });
      return Wp;
    };
    const stands = new Parts();
    for (const x of wheelX) for (const z of wheelZ) {
      const isMissing = x > cx && z > -3;
      if (!isMissing) addParts(wheel(), "furniture").position.set(x, wy, z);
      stands.box(0.18, 0.1, 0.18, "#f6a560", { pos: [x - Math.sign(x - cx) * 0.25, 0.05, z], r: 0.03 });
      stands.cyl(0.035, 0.05, 0.22, "#f6a560", { pos: [x - Math.sign(x - cx) * 0.25, 0.2, z] });
    }
    // eksik tekerlek yerinde fren diski
    stands.cyl(0.2, 0.2, 0.05, PAL.steelDark, { pos: [wheelX[1] - 0.06, wy, wheelZ[1]], rot: [0, 0, 90], finish: "metal" });
    addParts(stands, "furniture");
    const wg = rigGroup("wheel", [wheelX[1], wy, wheelZ[1]]);
    addParts(wheel(), "furniture", wg);
    rigs.wheel = new Rig("wheel", wg, {}, { hideWhenMessy: true, label: "Missing wheel" });

    // kaput (arka kenarından menteşeli)
    const hg = rigGroup("hood", [cx, 0.95, zSplit + 0.02]);
    const HP = new Parts();
    HP.box(W - 0.06, 0.07, zf - zSplit - 0.02, Y, { pos: [0, 0.0, (zf - zSplit) / 2 - 0.02], r: 0.035 });
    HP.box(0.3, 0.02, 0.5, Ydark, { pos: [0, 0.035, (zf - zSplit) / 2], r: 0.01 });
    addParts(HP, "furniture", hg);
    rigs.hood = new Rig("hood", hg, { rot: [-58, 0, 0] }, { label: "Open hood" });

    home("jack", [{ pos: [cx + 1.45, 0, -2.45], rot: [0, 100, 0] }]);
  }

  // ── Lastik köşesi (sağ arka) + duvar asılıları ───────────────────────────────────────
  {
    const tx = 3.95, tz = -4.15;
    const P = new Parts();
    P.box(1.2, 0.1, 1.2, "#c9a26f", { pos: [tx, 0.05, tz], r: 0.03 });
    addParts(P, "furniture");
    // duvar askıları
    const WP = new Parts();
    for (const x of [3.45, 4.42]) WP.cyl(0.03, 0.03, 0.14, PAL.steelDark, { pos: [x, 2.92, -4.93], rot: [90, 0, 0], finish: "metal" });
    WP.cyl(0.035, 0.035, 0.16, PAL.steelDark, { pos: [3.95, 3.8, -4.92], rot: [90, 0, 0], finish: "metal" });
    // yangın tüpü dirseği
    WP.box(0.3, 0.06, 0.16, PAL.steelDark, { pos: [3.12, 0.95, -4.92], r: 0.02, finish: "metal" });
    addParts(WP, "furniture", root, "right");
    home("tire", [0, 1, 2].map((i) => ({ pos: [tx, 0.1 + i * 0.3, tz], rot: [0, i * 33, 0] })));
    home("hubcap", [{ pos: [3.45, 2.65, -4.97], rot: [90, 0, 0] }, { pos: [4.42, 2.65, -4.97], rot: [90, 0, 0] }], "right");
    home("steeringWheel", [{ pos: [3.95, 3.5, -4.97], rot: [90, 0, 0] }], "right");
    home("extinguisher", [{ pos: [3.12, 0.98, -4.82] }], "right");
    home("cone", [[4.35, 0.25], [4.35, 0.95], [4.35, 1.65]].map(([x, z]) => ({ pos: [x, 0, z], rot: [0, 12, 0] })));
  }

  // diorama altı yumuşak gölge
  const shadowTex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, "rgba(40,50,110,0.42)"); gr.addColorStop(0.55, "rgba(40,50,110,0.2)"); gr.addColorStop(1, "rgba(40,50,110,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(17, 17), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(-0.3, -0.75, -0.3);
  shadow.renderOrder = -1;
  root.add(shadow);

  mergeStatic(root);
  const bounds = new THREE.Box3(new THREE.Vector3(-5.35, -0.6, -5.35), new THREE.Vector3(5.1, 4.45, 5.1));
  return { root, rigs, homes, bounds };
}

// Sabit (düzenek olmayan) Parts gruplarını materyal başına tek mesh'e indir: daha az çizim çağrısı
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const byMat = new Map();
  const remove = [];
  for (const child of root.children) {
    if (!child.isGroup || child.userData.rig) continue;
    const wall = child.userData.wall || "";
    for (const m of child.children) {
      if (!m.isMesh) continue;
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      const key = m.material.uuid + "|" + wall;
      if (!byMat.has(key)) byMat.set(key, { mat: m.material, wall, geos: [], cast: m.castShadow });
      byMat.get(key).geos.push(g);
    }
    remove.push(child);
  }
  for (const c of remove) root.remove(c);
  for (const { mat, wall, geos, cast } of byMat.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.name = "static-" + mat.name + (wall ? "-" + wall : "");
    if (wall) mesh.userData.wall = wall;
    root.add(mesh);
  }
}

// Dağınıklık parçaları: hangi eşya türleri toparlar (aday listesi; seviye türlerine göre atanır)
export const MESS_PARTS = {
  stool1: ["teaGlass", "simit", "teapot", "tavla"],
  stool2: ["teapot", "tavla", "simit", "teaGlass"],
  drawer1: ["sparkPlug", "gear", "boltJar", "tapeRoll"],
  drawer2: ["wrench", "pliers", "gloves", "flashlight"],
  drawer3: ["gear", "boltJar", "screwdriver", "sparkPlug"],
  drawer4: ["tapeRoll", "flashlight", "gloves", "radio"],
  hood: ["battery", "oilFilter", "sparkPlug"],
  wheel: ["tire", "hubcap", "jack"],
  pegboard: ["screwdriver", "wrench", "pliers", "hammer"],
  poster: ["hammer", "clock", "plate"],
  barrel: ["funnel", "jerrycan", "oilCan"],
  shelf3: ["oilCan", "oilFilter", "sprayCan", "antifreeze"],
};

// Temizlik eşyası → kir kategorisi
export const CLEANERS = { mop: "floor", roller: "wall", sponge: "counter", rag: "furniture" };
