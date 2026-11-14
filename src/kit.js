// Prosedürel model kiti: yuvarlatılmış ilkel parçalar → vertex renkli, finish başına tek mesh.
// Pastel oyuncak görünümü: mat boya, yumuşak metal, az cam. Oda parçaları kategori (kir) alır.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { applyGrime } from "./grime.js";

export const D2R = Math.PI / 180;

// Ortak pastel palet (sRGB hex). Eşya ve oda renkleri buradan seçilir.
export const PAL = {
  cream: "#f6ecd9", creamHi: "#fff7ea", creamDark: "#e6d3b3",
  navy: "#24407f", ink: "#3b4660", charcoal: "#4a4f5c", rubber: "#555a66",
  steel: "#c3ccd8", steelDark: "#97a3b4", chrome: "#e3e8ef",
  red: "#ef7f72", redDeep: "#d9605a", coral: "#f49a84",
  orange: "#f6a560", peach: "#f8c39a", yellow: "#f7d36b", butter: "#fbe39a",
  mint: "#9fd8c4", teal: "#6fc0b5", green: "#9ccf8a", olive: "#a9c27a",
  sky: "#9cc9f0", blue: "#7fa8e0", blueDeep: "#5d86c9", lilac: "#b9a8ec", pink: "#f4a9c0",
  wood: "#e3b57e", woodDark: "#c9935c", woodLight: "#f0cf9c",
  brass: "#e9c46a", amber: "#e98f3c", tea: "#c8552f", glass: "#d8eef7",
  white: "#fbfbf7", black: "#3a3f4b",
};

const _color = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

// ── Materyaller: finish × kategori önbelleği ─────────────────────────────────────────────
const FINISH = {
  matte: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.0 }),
  satin: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.08 }),
  metal: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.55 }),
  glass: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.42, depthWrite: false }),
  // thin clear glass with something coloured inside (the tea glass): barely tints what is behind it
  clear: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.2, depthWrite: false }),
  emit: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};
const matCache = new Map();
export function getMat(finish = "matte", cat = null) {
  const key = finish + "|" + (cat || "");
  let m = matCache.get(key);
  if (!m) {
    m = FINISH[finish]();
    m.name = key;
    if (cat && finish !== "glass" && finish !== "clear" && finish !== "emit") applyGrime(m, cat);
    matCache.set(key, m);
  }
  return m;
}
// Vurgu (dokunulan eşya): aynı finish, hafif emisif
const hlCache = new Map();
export function getHighlightMat(base) {
  let m = hlCache.get(base);
  if (!m) {
    m = base.clone();
    // keep shader patches (item colour boost, grime) that clone() drops
    m.defines = { ...(base.defines || {}) };
    m.onBeforeCompile = base.onBeforeCompile;
    m.customProgramCacheKey = base.customProgramCacheKey;
    if (m.emissive) { m.emissive = new THREE.Color("#fff3c4"); m.emissiveIntensity = 0.32; }
    hlCache.set(base, m);
  }
  return m;
}
export function allMaterials() { return [...matCache.values()]; }

// ── Geometri yardımcıları ───────────────────────────────────────────────────────────────
// Yuvarlak kenarlı silindir (lathe profili). rTop ≠ rBot → konik. bevel: kenar yarıçapı.
export function roundedCylinderGeometry(rTop, rBot, h, bevel = 0.03, seg = 28) {
  const b = Math.max(0.001, Math.min(bevel, rTop * 0.9 || bevel, rBot * 0.9 || bevel, h / 2.05));
  const pts = [];
  const y0 = -h / 2, y1 = h / 2;
  pts.push(new THREE.Vector2(0, y0));
  const arc = (cx, cy, a0, a1, n = 4) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push(new THREE.Vector2(Math.max(0, cx + Math.cos(a) * b), cy + Math.sin(a) * b));
    }
  };
  if (rBot > 0.002) arc(rBot - b, y0 + b, -Math.PI / 2, 0);
  else pts.push(new THREE.Vector2(0.0005, y0));
  if (rTop > 0.002) arc(rTop - b, y1 - b, 0, Math.PI / 2);
  else pts.push(new THREE.Vector2(0.0005, y1));
  pts.push(new THREE.Vector2(0, y1));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return g;
}

// 2B nokta dizisi ya da THREE.Shape → z ekseninde ortalanmış, eğimli ekstrüzyon
export function extrudeGeometry(shape, depth, bevel = 0.02, curveSegments = 10) {
  const s = Array.isArray(shape) ? new THREE.Shape(shape.map(([x, y]) => new THREE.Vector2(x, y))) : shape;
  const b = Math.min(bevel, depth / 2.2);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, depth - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b,
    bevelSegments: 2, curveSegments,
  });
  g.translate(0, 0, -(depth - 2 * b) / 2);
  return g;
}

// Yuvarlak köşeli dikdörtgen Shape (2B)
export function roundRectShape(w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function normalizeGeo(g) {
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

function composeMatrix(o) {
  const p = o.pos || [0, 0, 0];
  const r = o.rot || [0, 0, 0];
  const s = o.scale == null ? [1, 1, 1] : typeof o.scale === "number" ? [o.scale, o.scale, o.scale] : o.scale;
  _e.set(r[0] * D2R, r[1] * D2R, r[2] * D2R, o.order || "XYZ");
  _q.setFromEuler(_e);
  return _m.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
}

// ── Parts: parçaları topla, finish başına birleştir ─────────────────────────────────────
// Ortak seçenekler (o): pos [x,y,z], rot [rx,ry,rz] (derece, XYZ), scale (sayı ya da [sx,sy,sz]),
// finish: "matte" | "satin" | "metal" | "glass" | "clear" | "emit".
export class Parts {
  constructor() { this.list = []; }

  add(geo, color, o = {}) {
    const g = normalizeGeo(geo);
    g.applyMatrix4(composeMatrix(o));
    _color.set(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _color.r; col[i * 3 + 1] = _color.g; col[i * 3 + 2] = _color.b; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.list.push({ g, finish: o.finish || "matte" });
    return this;
  }
  // Yuvarlatılmış kutu. o.r: köşe yarıçapı (varsayılan en kısa kenarın %18'i)
  box(w, h, d, color, o = {}) {
    const r = o.r != null ? o.r : Math.min(w, h, d) * 0.18;
    const g = r <= 0.0005 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, o.seg || 2, Math.min(r, Math.min(w, h, d) / 2 - 1e-4));
    return this.add(g, color, o);
  }
  // Yuvarlak kenarlı silindir; eksen Y, merkez orijin. o.bevel, o.seg
  cyl(rTop, rBot, h, color, o = {}) {
    const bevel = o.bevel != null ? o.bevel : Math.min(rTop || rBot, rBot || rTop, h) * 0.18;
    return this.add(roundedCylinderGeometry(rTop, rBot, h, bevel, o.seg || 28), color, o);
  }
  // Keskin kenarlı silindir/koni (açık uçlu da olabilir: o.open)
  rawCyl(rTop, rBot, h, color, o = {}) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, o.seg || 28, 1, !!o.open), color, o);
  }
  sphere(r, color, o = {}) {
    return this.add(new THREE.SphereGeometry(r, o.wseg || 22, o.hseg || 16, 0, Math.PI * 2, 0, o.thetaLength || Math.PI), color, o);
  }
  // Simit/halka; eksen Z (XY düzleminde). o.arc radyan
  torus(R, r, color, o = {}) {
    return this.add(new THREE.TorusGeometry(R, r, o.rseg || 12, o.tseg || 36, o.arc || Math.PI * 2), color, o);
  }
  // Kapsül; eksen Y, len: düz kısmın boyu
  capsule(r, len, color, o = {}) {
    return this.add(new THREE.CapsuleGeometry(r, len, o.cseg || 6, o.rseg || 14), color, o);
  }
  // Lathe: [[r, y], ...] (eksen Y)
  lathe(points, color, o = {}) {
    const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), o.seg || 28);
    g.computeVertexNormals();
    return this.add(g, color, o);
  }
  // Ekstrüzyon: shape (nokta dizisi ya da THREE.Shape) XY düzleminde, kalınlık Z boyunca ortalı
  extrude(shape, depth, color, o = {}) {
    return this.add(extrudeGeometry(shape, depth, o.bevel != null ? o.bevel : 0.02, o.curveSegments || 10), color, o);
  }
  // Başka bir Parts kümesini dönüşümle içine kat (alt montaj)
  merge(other, o = {}) {
    const m = composeMatrix(o).clone();
    for (const it of other.list) {
      const g = it.g.clone();
      g.applyMatrix4(m);
      this.list.push({ g, finish: it.finish });
    }
    return this;
  }

  // Finish başına tek Mesh içeren Group. opts.cat: oda kir kategorisi (floor|wall|counter|furniture)
  build(opts = {}) {
    const byFinish = new Map();
    for (const it of this.list) {
      if (!byFinish.has(it.finish)) byFinish.set(it.finish, []);
      byFinish.get(it.finish).push(it.g);
    }
    const group = new THREE.Group();
    for (const [finish, geos] of byFinish) {
      const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, getMat(finish, opts.cat || null));
      mesh.castShadow = opts.castShadow !== false && finish !== "glass" && finish !== "clear" && finish !== "emit";
      mesh.receiveShadow = opts.receiveShadow !== false;
      mesh.userData.finish = finish;
      group.add(mesh);
    }
    return group;
  }
}

// Grup içindeki bütün köşe noktaları (grup uzayında), ızgarada tekilleştirilmiş → fizik dışbükey zarfı
export function hullPoints(group, cell = 0.025, maxPoints = 900) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const seen = new Set();
  const out = [];
  const v = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      const key = Math.round(v.x / cell) + "," + Math.round(v.y / cell) + "," + Math.round(v.z / cell);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v.x, v.y, v.z);
    }
  });
  if (out.length / 3 > maxPoints) return hullPoints(group, cell * 1.6, maxPoints);
  return new Float32Array(out);
}

export function boundsOf(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return { box, size, center, radius: size.length() / 2 };
}
