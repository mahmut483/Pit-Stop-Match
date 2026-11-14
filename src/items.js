// Oto tamirci dükkânı eşyaları — prosedürel pastel oyuncak modeller.
// Kural: orijin = doğal pozdaki alt-orta nokta, +Y yukarı, yatık eşyalarda uzun eksen X, "ön" +Z.
// build() → Parts (birleştirilmemiş); çağıran .build() yapar. icon: dock'ta gösterim Euler'i (derece, XYZ).
import * as THREE from "three";
import { Parts, PAL, D2R } from "./kit.js";

// ── Yerel yardımcılar ─────────────────────────────────────────────────────────────────────
const UP = new THREE.Vector3(0, 1, 0);

// a → b arası silindir (rA: a ucundaki yarıçap, rB: b ucundaki)
function rod(P, a, b, rA, rB, color, o = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  d.normalize();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d), "XYZ");
  const m = A.add(B).multiplyScalar(0.5);
  return P.add(new THREE.CylinderGeometry(rB, rA, len, o.seg || 14, 1, false), color, {
    ...o, pos: [m.x, m.y, m.z], rot: [e.x / D2R, e.y / D2R, e.z / D2R],
  });
}

// Lathe (three'nin kendi normalleriyle; dikiş izi bırakmaz). pts: [[r, y], ...]
function lathe(P, pts, color, o = {}) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), o.seg || 24);
  return P.add(g, color, o);
}

// Yuvarlak köşeli halka profili (saat yönü tersine, kapalı): y0..y0+h, rIn..rOut
function ringPts(rIn, rOut, h, b, y0 = 0, n = 3) {
  const pts = [];
  const arc = (cx, cy, a0, a1) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push([cx + Math.cos(a) * b, cy + Math.sin(a) * b]);
    }
  };
  arc(rIn + b, y0 + b, Math.PI, 1.5 * Math.PI);
  arc(rOut - b, y0 + b, 1.5 * Math.PI, 2 * Math.PI);
  arc(rOut - b, y0 + h - b, 0, 0.5 * Math.PI);
  arc(rIn + b, y0 + h - b, 0.5 * Math.PI, Math.PI);
  pts.push(pts[0]);
  return pts;
}

// Düz yüzlü altıgen prizma (somun, buji anahtarlığı)
function hexPrism(P, r, h, color, o = {}) {
  const g = new THREE.CylinderGeometry(r, r, h, 6).toNonIndexed();
  g.computeVertexNormals();
  return P.add(g, color, o);
}

// Boyuta göre segment seçen Parts: küçük parçalar daha az köşe (RoundedBox seg 2 ≈ 900 köşe)
class IParts extends Parts {
  box(w, h, d, color, o = {}) {
    if (o.seg == null) o = { ...o, seg: Math.max(w, h, d) > 0.3 ? 2 : 1 };
    return super.box(w, h, d, color, o);
  }
  torus(R, r, color, o = {}) {
    return super.torus(R, r, color, { rseg: r < 0.012 ? 6 : r < 0.025 ? 8 : 10, tseg: R < 0.05 ? 14 : R < 0.12 ? 22 : 32, ...o });
  }
  sphere(r, color, o = {}) {
    return super.sphere(r, color, { wseg: r < 0.02 ? 8 : 16, hseg: r < 0.02 ? 6 : 12, ...o });
  }
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 7 segmentli karakter (plaka yazısı). Yatık plaka: okuma yönü +X, harfin üstü -Z.
const SEG = {
  "3": "abcdg", "4": "fgbc", A: "abcefg", B: "abcdefg", C: "adef", "0": "abcdef",
};
function glyph(P, ch, cx, cz, y, w, h, t, color) {
  const segs = SEG[ch] || "";
  const S = {
    a: [0, h / 2, w, t], d: [0, -h / 2, w, t], g: [0, 0, w, t],
    f: [-w / 2, h / 4, t, h / 2], b: [w / 2, h / 4, t, h / 2],
    e: [-w / 2, -h / 4, t, h / 2], c: [w / 2, -h / 4, t, h / 2],
  };
  for (const s of segs) {
    const [u, v, sw, sh] = S[s];
    P.box(sw + t * 0.4, 0.008, sh + t * 0.4, color, { pos: [cx + u, y, cz - v], r: 0 });
  }
}

// ── Eşyalar ───────────────────────────────────────────────────────────────────────────────
export const ITEMS = {
  // ─ Pano aletleri ─
  wrench: {
    name: "Wrench",
    icon: [62, 32, 0],
    build() {
      const P = new IParts();
      const c = "#b7c4d8", y = 0.032, t = 0.056, M = { finish: "metal" };
      P.box(0.5, t * 0.82, 0.074, c, { ...M, pos: [0, y, 0], r: 0.02 });
      P.box(0.13, t * 0.9, 0.1, c, { ...M, pos: [-0.23, y, 0], r: 0.024 });
      P.box(0.13, t * 0.9, 0.1, c, { ...M, pos: [0.21, y, 0], r: 0.024 });
      // halka uç (-X)
      P.torus(0.072, 0.03, c, { ...M, pos: [-0.335, y, 0], rot: [90, 0, 0], tseg: 30 });
      // açık ağız (+X): C biçimi, 15° eğik
      const R = 0.098, Ri = 0.05, a0 = 0.6;
      const s = new THREE.Shape();
      s.moveTo(Math.cos(a0) * R, Math.sin(a0) * R);
      s.absarc(0, 0, R, a0, Math.PI * 2 - a0, false);
      s.lineTo(Math.cos(-a0) * Ri, Math.sin(-a0) * Ri);
      s.absarc(0, 0, Ri, Math.PI * 2 - a0, a0, true);
      s.closePath();
      P.extrude(s, t, c, { ...M, pos: [0.318, y, 0], rot: [90, 0, 15], bevel: 0.012, curveSegments: 14 });
      // gövdede hafif oluk
      P.box(0.36, 0.006, 0.026, "#9fb0c8", { ...M, pos: [0, y + t * 0.41, 0], r: 0.003 });
      return P;
    },
  },

  hammer: {
    name: "Hammer",
    icon: [60, 30, 0],
    build() {
      const P = new IParts();
      const y = 0.062, M = { finish: "metal" };
      // sap (ahşap) + kauçuk tutamak
      P.cyl(0.028, 0.032, 0.6, PAL.woodLight, { pos: [-0.07, y, 0], rot: [0, 0, -90], bevel: 0.012 });
      P.cyl(0.037, 0.037, 0.22, "#4a5a80", { pos: [-0.26, y, 0], rot: [0, 0, -90], bevel: 0.016 });
      P.torus(0.035, 0.007, "#3d4b6e", { pos: [-0.2, y, 0], rot: [0, 90, 0] });
      P.torus(0.035, 0.007, "#3d4b6e", { pos: [-0.3, y, 0], rot: [0, 90, 0] });
      // baş: gövde + vurma yüzü (+Z) + pençe (-Z)
      P.box(0.1, 0.11, 0.17, "#c3ccd8", { ...M, pos: [0.3, y, 0.0], r: 0.024 });
      P.cyl(0.05, 0.054, 0.08, "#c3ccd8", { ...M, pos: [0.3, y, 0.115], rot: [90, 0, 0], bevel: 0.012 });
      // pençe: iki çatal, sapa doğru kıvrık (yatık pozda -X yönüne)
      for (const dy of [-0.024, 0.024]) P.box(0.044, 0.03, 0.13, "#c3ccd8", { ...M, pos: [0.29, y + dy, -0.12], rot: [0, 24, 0], r: 0.012 });
      return P;
    },
  },

  screwdriver: {
    name: "Screwdriver",
    icon: [55, 32, 0],
    build() {
      const P = new IParts();
      const y = 0.076, red = "#ef7f72";
      // sap: lathe profili Y→X
      lathe(P, [[0, 0], [0.05, 0], [0.064, 0.012], [0.07, 0.05], [0.068, 0.2], [0.062, 0.25], [0.048, 0.285], [0.03, 0.31], [0.026, 0.32], [0, 0.32]],
        red, { pos: [-0.4, y, 0], rot: [0, 0, -90], finish: "satin", seg: 20 });
      // sap oluk çizgileri
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        P.capsule(0.012, 0.12, "#f6a196", { pos: [-0.27, y + Math.cos(a) * 0.064, Math.sin(a) * 0.064], rot: [0, 0, -90], cseg: 3, rseg: 8 });
      }
      P.torus(0.06, 0.011, PAL.yellow, { pos: [-0.105, y, 0], rot: [0, 90, 0] });
      // şaft + yassı uç
      P.rawCyl(0.017, 0.017, 0.42, "#c9d2de", { pos: [0.13, y, 0], rot: [0, 0, -90], finish: "metal", seg: 12 });
      P.box(0.06, 0.012, 0.042, "#c9d2de", { pos: [0.362, y, 0], finish: "metal", r: 0.004 });
      return P;
    },
  },

  pliers: {
    name: "Pliers",
    icon: [60, 30, 0],
    build() {
      const P = new IParts();
      const steel = "#c3ccd8", grip = "#7fa8e0", M = { finish: "metal" };
      for (const s of [1, -1]) {
        // tutamak (tek parça, açık V)
        P.box(0.34, 0.06, 0.056, grip, { pos: [-0.19, 0.034, s * 0.064], rot: [0, s * 12, 0], r: 0.026 });
        // metal boyun
        P.box(0.1, 0.046, 0.05, steel, { ...M, pos: [0.04, 0.032, s * 0.026], rot: [0, s * 12, 0], r: 0.014 });
        // kalın çene + incelen uç + diş çizgileri
        P.box(0.17, 0.05, 0.06, steel, { ...M, pos: [0.19, 0.032, s * 0.03], r: 0.02 });
        P.box(0.075, 0.044, 0.04, steel, { ...M, pos: [0.3, 0.032, s * 0.02], r: 0.015 });
        for (let i = 0; i < 4; i++) P.box(0.006, 0.052, 0.008, "#97a3b4", { pos: [0.15 + i * 0.03, 0.032, s * 0.004], r: 0 });
      }
      P.cyl(0.046, 0.046, 0.066, steel, { ...M, pos: [0.1, 0.033, 0], bevel: 0.012 });
      P.cyl(0.018, 0.018, 0.07, "#97a3b4", { ...M, pos: [0.1, 0.035, 0] });
      return P;
    },
  },

  // ─ Tezgâh ─
  sparkPlug: {
    name: "Spark plug",
    icon: [10, -30, -18],
    build() {
      const P = new IParts();
      const st = "#c9d2de", M = { finish: "metal" };
      // elektrot + yan kanca
      P.box(0.014, 0.05, 0.014, st, { ...M, pos: [0, 0.025, 0], r: 0.004 });
      P.box(0.014, 0.05, 0.014, st, { ...M, pos: [0.03, 0.035, 0], r: 0.004 });
      P.box(0.036, 0.013, 0.014, st, { ...M, pos: [0.016, 0.009, 0], r: 0.004 });
      // diş + halkalar
      P.cyl(0.044, 0.044, 0.11, st, { ...M, pos: [0, 0.09, 0], bevel: 0.006 });
      for (const yy of [0.052, 0.076, 0.1, 0.124]) P.torus(0.044, 0.007, st, { ...M, pos: [0, yy, 0], rot: [90, 0, 0], tseg: 20 });
      P.cyl(0.062, 0.062, 0.016, st, { ...M, pos: [0, 0.152, 0], bevel: 0.004 });
      hexPrism(P, 0.082, 0.07, "#b3bdcb", { ...M, pos: [0, 0.195, 0] });
      // seramik gövde (beyaz) + renk halkası
      lathe(P, [[0, 0.23], [0.06, 0.23], [0.062, 0.25], [0.056, 0.29], [0.044, 0.32], [0.04, 0.35], [0.046, 0.362], [0.04, 0.374], [0.046, 0.386], [0.04, 0.398], [0.046, 0.41], [0.038, 0.43], [0, 0.44]],
        PAL.white, { finish: "satin", seg: 20 });
      P.torus(0.057, 0.008, "#f2a14a", { pos: [0, 0.262, 0], rot: [90, 0, 0], tseg: 20 });
      // terminal
      P.cyl(0.022, 0.022, 0.06, st, { ...M, pos: [0, 0.465, 0] });
      P.cyl(0.03, 0.03, 0.026, st, { ...M, pos: [0, 0.486, 0], bevel: 0.008 });
      return P;
    },
  },

  gear: {
    name: "Gear",
    icon: [62, 0, 0],
    build() {
      const P = new IParts();
      const N = 12, Ro = 0.262, Rr = 0.212, p = (Math.PI * 2) / N;
      const s = new THREE.Shape();
      for (let i = 0; i < N; i++) {
        const a = i * p;
        const pts = [[Rr, a - 0.27 * p], [Ro, a - 0.13 * p], [Ro, a + 0.13 * p], [Rr, a + 0.27 * p]];
        pts.forEach(([r, aa], k) => {
          const x = Math.cos(aa) * r, yy = Math.sin(aa) * r;
          if (i === 0 && k === 0) s.moveTo(x, yy); else s.lineTo(x, yy);
        });
      }
      s.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, 0.062, 0, Math.PI * 2, true);
      s.holes.push(hole);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        const h = new THREE.Path();
        h.absarc(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.04, 0, Math.PI * 2, true);
        s.holes.push(h);
      }
      P.extrude(s, 0.09, PAL.brass, { pos: [0, 0.045, 0], rot: [90, 0, 0], bevel: 0.012, finish: "metal", curveSegments: 6 });
      lathe(P, ringPts(0.062, 0.098, 0.12, 0.012), "#dcb35a", { finish: "metal", seg: 28 });
      return P;
    },
  },

  boltJar: {
    name: "Bolt jar",
    icon: [14, -25, 0],
    build() {
      const P = new IParts();
      const R = rng(7);
      // içerik: cıvatalar ve somunlar
      for (let i = 0; i < 16; i++) {
        const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 0.1;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = 0.04 + i * 0.012 + R() * 0.03;
        const col = R() < 0.3 ? PAL.brass : "#c3ccd8";
        const sub = new IParts();
        hexPrism(sub, 0.032, 0.022, col, { pos: [0, 0.05, 0], finish: "metal" });
        sub.rawCyl(0.013, 0.013, 0.09, col, { pos: [0, 0, 0], finish: "metal", seg: 8 });
        P.merge(sub, { pos: [x, y, z], rot: [R() * 180, R() * 180, R() * 180] });
      }
      for (let i = 0; i < 5; i++) {
        const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 0.09;
        P.torus(0.022, 0.009, "#c3ccd8", { pos: [Math.cos(a) * rr, 0.2 + R() * 0.06, Math.sin(a) * rr], rot: [R() * 180, R() * 180, 0], finish: "metal", tseg: 12, rseg: 6 });
      }
      // cam kavanoz
      lathe(P, [[0, 0], [0.15, 0], [0.163, 0.012], [0.168, 0.04], [0.168, 0.3], [0.158, 0.33], [0.135, 0.348], [0.13, 0.37], [0, 0.37]],
        "#dff1f8", { finish: "glass", seg: 28 });
      // kapak
      P.cyl(0.142, 0.142, 0.06, "#4a5a80", { pos: [0, 0.395, 0], bevel: 0.02 });
      P.torus(0.142, 0.006, "#5b6c94", { pos: [0, 0.39, 0], rot: [90, 0, 0], tseg: 28 });
      // etiket
      P.box(0.15, 0.09, 0.012, PAL.cream, { pos: [0, 0.2, 0.165], r: 0.006 });
      P.box(0.11, 0.016, 0.014, "#4a5a80", { pos: [0, 0.215, 0.166], r: 0.004 });
      return P;
    },
  },

  radio: {
    name: "Radio",
    icon: [10, -24, 0],
    build() {
      const P = new IParts();
      const body = "#7cc9bd", dark = "#4f9c92";
      P.box(0.66, 0.34, 0.26, body, { pos: [0, 0.2, 0], r: 0.07 });
      P.box(0.08, 0.04, 0.2, PAL.ink, { pos: [-0.24, 0.02, 0], r: 0.014 });
      P.box(0.08, 0.04, 0.2, PAL.ink, { pos: [0.24, 0.02, 0], r: 0.014 });
      // ön panel
      P.box(0.58, 0.26, 0.02, PAL.cream, { pos: [0, 0.2, 0.124], r: 0.008, seg: 1 });
      // hoparlör
      P.cyl(0.095, 0.095, 0.016, dark, { pos: [-0.15, 0.2, 0.136], rot: [90, 0, 0], bevel: 0.006 });
      for (const r of [0.028, 0.054, 0.08]) P.torus(r, 0.0065, PAL.cream, { pos: [-0.15, 0.2, 0.145], tseg: 28, rseg: 6 });
      // kadran
      P.box(0.2, 0.09, 0.016, PAL.butter, { pos: [0.15, 0.245, 0.137], r: 0.012 });
      for (let i = 0; i < 7; i++) P.box(0.006, i % 2 ? 0.02 : 0.032, 0.006, PAL.ink, { pos: [0.075 + i * 0.025, 0.255, 0.146], r: 0 });
      P.box(0.008, 0.075, 0.008, PAL.red, { pos: [0.17, 0.245, 0.149], r: 0 });
      // düğmeler
      P.cyl(0.03, 0.03, 0.04, PAL.navy, { pos: [0.1, 0.135, 0.145], rot: [90, 0, 0], bevel: 0.01 });
      P.cyl(0.03, 0.03, 0.04, PAL.navy, { pos: [0.2, 0.135, 0.145], rot: [90, 0, 0], bevel: 0.01 });
      // sap
      P.box(0.04, 0.07, 0.06, PAL.ink, { pos: [-0.2, 0.385, 0], r: 0.015 });
      P.box(0.04, 0.07, 0.06, PAL.ink, { pos: [0.2, 0.385, 0], r: 0.015 });
      P.cyl(0.024, 0.024, 0.46, PAL.ink, { pos: [0, 0.425, 0], rot: [0, 0, 90], bevel: 0.012 });
      return P;
    },
  },

  flashlight: {
    name: "Flashlight",
    icon: [30, 30, 15],
    build() {
      const P = new IParts();
      const y = 0.084, body = PAL.yellow;
      P.cyl(0.05, 0.05, 0.38, body, { pos: [-0.08, y, 0], rot: [0, 0, -90], bevel: 0.012 });
      P.cyl(0.055, 0.055, 0.045, PAL.ink, { pos: [-0.275, y, 0], rot: [0, 0, -90], bevel: 0.015 });
      for (const x of [-0.2, -0.165, -0.13]) P.torus(0.05, 0.008, PAL.ink, { pos: [x, y, 0], rot: [0, 90, 0], tseg: 24 });
      // kafa
      lathe(P, [[0, 0], [0.052, 0], [0.057, 0.04], [0.076, 0.12], [0.08, 0.16], [0.07, 0.17], [0, 0.17]],
        body, { pos: [0.1, y, 0], rot: [0, 0, -90], seg: 24 });
      P.torus(0.073, 0.011, "#c9d2de", { pos: [0.268, y, 0], rot: [0, 90, 0], finish: "metal", tseg: 24 });
      P.cyl(0.068, 0.068, 0.012, "#fff3b0", { pos: [0.268, y, 0], rot: [0, 0, -90], finish: "emit", bevel: 0.004 });
      // düğme
      P.box(0.05, 0.026, 0.034, PAL.red, { pos: [-0.02, y + 0.05, 0], r: 0.011 });
      return P;
    },
  },

  tapeRoll: {
    name: "Electrical tape",
    icon: [55, 0, 0],
    build() {
      const P = new IParts();
      const lilac = PAL.lilac;
      lathe(P, ringPts(0.1, 0.128, 0.158, 0.008), "#e2c08f", { seg: 28 });
      lathe(P, ringPts(0.126, 0.2, 0.15, 0.014, 0.004), lilac, { seg: 32, finish: "satin" });
      // açık uç
      P.box(0.09, 0.148, 0.01, lilac, { pos: [0.196, 0.079, 0.045], rot: [0, -32, 0], r: 0.004, finish: "satin" });
      // üst yüzde parlak sarım çizgileri
      for (const r of [0.15, 0.175]) P.torus(r, 0.003, "#cfc2f3", { pos: [0, 0.154, 0], rot: [90, 0, 0], tseg: 36, rseg: 4 });
      return P;
    },
  },

  // ─ Yağ rafı ─
  oilCan: {
    name: "Motor oil",
    icon: [12, -28, 0],
    build() {
      const P = new IParts();
      const blue = "#5d86c9";
      P.box(0.36, 0.44, 0.2, blue, { pos: [0.02, 0.22, 0], r: 0.05 });
      P.torus(0.065, 0.025, blue, { pos: [-0.075, 0.43, 0], arc: Math.PI, tseg: 20 });
      P.cyl(0.042, 0.046, 0.05, blue, { pos: [0.12, 0.455, 0] });
      P.cyl(0.05, 0.05, 0.065, PAL.red, { pos: [0.12, 0.5, 0], bevel: 0.014 });
      // etiket
      P.box(0.27, 0.22, 0.012, PAL.butter, { pos: [0.02, 0.2, 0.101], r: 0.012 });
      P.box(0.27, 0.05, 0.014, PAL.red, { pos: [0.02, 0.255, 0.102], r: 0.004 });
      // yağ damlası amblemi
      P.sphere(0.03, PAL.navy, { pos: [0.02, 0.165, 0.108], scale: [1, 1.1, 0.4] });
      P.cyl(0.0, 0.026, 0.04, PAL.navy, { pos: [0.02, 0.2, 0.108], scale: [1, 1, 0.4], bevel: 0.002 });
      // seviye penceresi
      P.box(0.02, 0.3, 0.006, "#a9c1ea", { pos: [-0.135, 0.22, 0.101], r: 0.003 });
      return P;
    },
  },

  oilFilter: {
    name: "Oil filter",
    icon: [18, -25, 0],
    build() {
      const P = new IParts();
      const orange = "#f39a5a";
      P.cyl(0.155, 0.155, 0.32, orange, { pos: [0, 0.16, 0], bevel: 0.03, seg: 30 });
      for (const y of [0.035, 0.285]) P.torus(0.156, 0.008, "#e2834a", { pos: [0, y, 0], rot: [90, 0, 0], tseg: 32 });
      // etiket bandı
      P.rawCyl(0.158, 0.158, 0.12, PAL.cream, { pos: [0, 0.16, 0], seg: 30 });
      P.rawCyl(0.159, 0.159, 0.025, PAL.navy, { pos: [0, 0.16, 0], seg: 30 });
      // üst taban plakası
      P.cyl(0.148, 0.15, 0.04, "#c9d2de", { pos: [0, 0.335, 0], finish: "metal", bevel: 0.01, seg: 30 });
      P.torus(0.11, 0.014, PAL.ink, { pos: [0, 0.356, 0], rot: [90, 0, 0], tseg: 28 });
      P.cyl(0.042, 0.042, 0.02, "#7b8494", { pos: [0, 0.352, 0], finish: "metal" });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        P.cyl(0.016, 0.016, 0.01, PAL.ink, { pos: [Math.cos(a) * 0.07, 0.354, Math.sin(a) * 0.07], bevel: 0.003 });
      }
      return P;
    },
  },

  sprayCan: {
    name: "Spray paint",
    icon: [14, -25, 0],
    build() {
      const P = new IParts();
      const pink = PAL.pink;
      P.cyl(0.085, 0.085, 0.4, pink, { pos: [0, 0.2, 0], bevel: 0.012 });
      P.torus(0.082, 0.008, "#c9d2de", { pos: [0, 0.008, 0], rot: [90, 0, 0], finish: "metal" });
      P.rawCyl(0.087, 0.087, 0.14, PAL.cream, { pos: [0, 0.2, 0] });
      P.sphere(0.034, pink, { pos: [0, 0.2, 0.078], scale: [1, 1, 0.35] });
      P.sphere(0.084, "#d3dbe6", { pos: [0, 0.395, 0], thetaLength: Math.PI / 2, scale: [1, 0.45, 1], finish: "metal" });
      P.cyl(0.07, 0.074, 0.1, "#f7bfd1", { pos: [0, 0.475, 0], bevel: 0.018 });
      P.cyl(0.02, 0.02, 0.03, PAL.white, { pos: [0, 0.535, 0], bevel: 0.006 });
      return P;
    },
  },

  funnel: {
    name: "Funnel",
    icon: [22, -20, 0],
    build() {
      const P = new IParts();
      const green = "#8fcb7c";
      lathe(P, [[0.036, 0], [0.043, 0.18], [0.2, 0.41], [0.204, 0.45], [0.186, 0.45], [0.184, 0.418], [0.028, 0.188], [0.022, 0], [0.036, 0]],
        green, { seg: 30 });
      P.torus(0.198, 0.012, "#7ab868", { pos: [0, 0.445, 0], rot: [90, 0, 0], tseg: 36 });
      P.torus(0.035, 0.009, "#7ab868", { pos: [0.21, 0.4, 0], rot: [0, 0, 0], tseg: 16 });
      return P;
    },
  },

  antifreeze: {
    name: "Antifreeze",
    icon: [12, -28, 0],
    build() {
      const P = new IParts();
      const liquid = "#5cc8b8";
      // sıvı (opak) + yarı saydam şişe
      P.box(0.22, 0.27, 0.14, liquid, { pos: [0, 0.15, 0], r: 0.04, finish: "satin" });
      P.box(0.27, 0.38, 0.18, "#eef6f8", { pos: [0, 0.19, 0], r: 0.055, finish: "glass" });
      P.cyl(0.075, 0.115, 0.1, "#eef6f8", { pos: [0.02, 0.42, 0], scale: [1, 1, 0.72], finish: "glass" });
      P.cyl(0.04, 0.04, 0.04, "#eef6f8", { pos: [0.03, 0.48, 0], finish: "glass" });
      P.cyl(0.05, 0.05, 0.065, PAL.navy, { pos: [0.03, 0.52, 0], bevel: 0.014 });
      // tutamak
      P.torus(0.058, 0.02, "#eef6f8", { pos: [-0.122, 0.3, 0], arc: Math.PI, rot: [0, 0, 90], tseg: 18, finish: "glass" });
      // etiket: kar tanesi
      P.box(0.2, 0.15, 0.012, PAL.white, { pos: [0, 0.16, 0.091], r: 0.01 });
      for (const a of [0, 60, 120]) P.box(0.08, 0.012, 0.008, PAL.blueDeep, { pos: [0, 0.165, 0.099], rot: [0, 0, a], r: 0.003 });
      P.box(0.2, 0.025, 0.014, PAL.pink, { pos: [0, 0.11, 0.092], r: 0.004 });
      return P;
    },
  },

  // ─ Araç parçaları ─
  battery: {
    name: "Car battery",
    icon: [18, -28, 0],
    build() {
      const P = new IParts();
      P.box(0.58, 0.34, 0.34, "#4a4f5c", { pos: [0, 0.17, 0], r: 0.035 });
      P.box(0.6, 0.07, 0.36, "#5d6372", { pos: [0, 0.37, 0], r: 0.025 });
      // etiket + şimşek
      P.box(0.44, 0.15, 0.012, PAL.butter, { pos: [0, 0.18, 0.171], r: 0.01 });
      const bolt = [[-0.012, 0.055], [0.03, 0.055], [0.006, 0.012], [0.032, 0.012], [-0.022, -0.06], [-0.004, -0.01], [-0.03, -0.01]];
      P.extrude(bolt, 0.012, PAL.navy, { pos: [0, 0.18, 0.179], bevel: 0.002 });
      // kutup başları
      P.cyl(0.036, 0.042, 0.04, PAL.red, { pos: [-0.19, 0.425, 0.06], bevel: 0.01 });
      P.cyl(0.036, 0.042, 0.04, PAL.blue, { pos: [0.19, 0.425, 0.06], bevel: 0.01 });
      P.cyl(0.018, 0.018, 0.02, "#d3dbe6", { pos: [-0.19, 0.448, 0.06], finish: "metal" });
      P.cyl(0.018, 0.018, 0.02, "#d3dbe6", { pos: [0.19, 0.448, 0.06], finish: "metal" });
      // + / − işaretleri
      P.box(0.05, 0.008, 0.014, PAL.red, { pos: [-0.19, 0.408, -0.07], r: 0.003 });
      P.box(0.014, 0.008, 0.05, PAL.red, { pos: [-0.19, 0.408, -0.07], r: 0.003 });
      P.box(0.05, 0.008, 0.014, PAL.blue, { pos: [0.19, 0.408, -0.07], r: 0.003 });
      return P;
    },
  },

  tire: {
    name: "Tire",
    icon: [58, 0, 0],
    build() {
      const P = new IParts();
      const rub = "#4f5563", tread = "#5d6372";
      lathe(P, ringPts(0.235, 0.4, 0.3, 0.075, 0, 4), rub, { seg: 36 });
      // diş blokları (iki sıra, şaşırtmalı)
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < 18; i++) {
          const a = ((i + row * 0.5) / 18) * Math.PI * 2;
          P.box(0.03, 0.06, 0.08, tread, { pos: [Math.cos(a) * 0.398, row ? 0.19 : 0.11, Math.sin(a) * 0.398], rot: [0, -a / D2R, 0], r: 0 });
        }
      }
      // jant (çanak) + göbek + bijon
      lathe(P, [[0, 0.07], [0.24, 0.07], [0.245, 0.09], [0.245, 0.215], [0.235, 0.225], [0.2, 0.2], [0.1, 0.18], [0.075, 0.19], [0, 0.19]],
        "#e3e8ef", { finish: "metal", seg: 32 });
      P.cyl(0.05, 0.05, 0.03, PAL.blueDeep, { pos: [0, 0.198, 0], bevel: 0.01 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        hexPrism(P, 0.016, 0.026, "#b3bdcb", { pos: [Math.cos(a) * 0.1, 0.19, Math.sin(a) * 0.1], finish: "metal" });
        const b = a + Math.PI / 5;
        P.sphere(0.034, "#7b8494", { pos: [Math.cos(b) * 0.165, 0.19, Math.sin(b) * 0.165], scale: [1, 0.25, 0.75], rot: [0, -b / D2R, 0] });
      }
      return P;
    },
  },

  hubcap: {
    name: "Hubcap",
    icon: [58, 0, 0],
    build() {
      const P = new IParts();
      const chrome = "#dfe5ee";
      lathe(P, [[0, 0], [0.288, 0], [0.3, 0.012], [0.284, 0.04], [0.2, 0.068], [0.1, 0.084], [0.072, 0.092], [0, 0.092]], chrome, { finish: "metal", seg: 36 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        P.box(0.2, 0.024, 0.05, "#eef2f7", { pos: [Math.cos(a) * 0.18, 0.068, Math.sin(a) * 0.18], rot: [0, -a / D2R, -14], r: 0.01, finish: "metal" });
        const b = a + Math.PI / 5;
        P.box(0.11, 0.012, 0.05, "#7b8494", { pos: [Math.cos(b) * 0.2, 0.058, Math.sin(b) * 0.2], rot: [0, -b / D2R, -14], r: 0.006 });
      }
      P.cyl(0.07, 0.07, 0.03, PAL.blueDeep, { pos: [0, 0.098, 0], bevel: 0.01 });
      P.cyl(0.035, 0.035, 0.01, PAL.cream, { pos: [0, 0.114, 0], bevel: 0.003 });
      return P;
    },
  },

  steeringWheel: {
    name: "Steering wheel",
    icon: [58, 0, 0],
    build() {
      const P = new IParts();
      const rimY = 0.04;
      P.torus(0.29, 0.034, PAL.woodDark, { pos: [0, rimY, 0], rot: [90, 0, 0], tseg: 44, rseg: 12, finish: "satin" });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
        P.box(0.22, 0.026, 0.06, "#c9d2de", { pos: [Math.cos(a) * 0.18, rimY, Math.sin(a) * 0.18], rot: [0, -a / D2R, 0], r: 0.012, finish: "metal" });
      }
      P.cyl(0.085, 0.092, 0.09, PAL.ink, { pos: [0, 0.045, 0], bevel: 0.025 });
      P.cyl(0.066, 0.066, 0.025, PAL.red, { pos: [0, 0.096, 0], bevel: 0.01 });
      P.cyl(0.025, 0.025, 0.008, PAL.cream, { pos: [0, 0.11, 0], bevel: 0.003 });
      return P;
    },
  },

  jack: {
    name: "Car jack",
    icon: [22, -32, 0],
    build() {
      const P = new IParts();
      const red = "#e46f68", M = { finish: "metal" };
      // alçak şasi: iki yan levha + taban, tekerlekler dışta
      for (const s of [1, -1]) {
        P.box(0.6, 0.08, 0.03, red, { pos: [0.02, 0.085, s * 0.11], r: 0.013, seg: 1 });
        P.cyl(0.048, 0.048, 0.035, PAL.ink, { pos: [0.27, 0.048, s * 0.148], rot: [90, 0, 0], bevel: 0.01 });
        P.cyl(0.044, 0.044, 0.03, PAL.ink, { pos: [-0.22, 0.044, s * 0.148], rot: [90, 0, 0], bevel: 0.01 });
        P.cyl(0.018, 0.018, 0.04, "#c9d2de", { ...M, pos: [0.27, 0.048, s * 0.165], rot: [90, 0, 0] });
      }
      P.box(0.6, 0.03, 0.2, "#d25f59", { pos: [0.02, 0.06, 0], r: 0.01, seg: 1 });
      // kaldırma kolu: arkadan öne yükselen, levhaların üstünde görünür
      P.box(0.44, 0.045, 0.1, red, { pos: [0.1, 0.165, 0], rot: [0, 0, 16], r: 0.016 });
      P.cyl(0.062, 0.054, 0.035, "#c9d2de", { ...M, pos: [0.33, 0.245, 0], bevel: 0.01 });
      P.torus(0.042, 0.006, "#97a3b4", { ...M, pos: [0.33, 0.263, 0], rot: [90, 0, 0] });
      // hidrolik silindir + pompa gövdesi
      P.cyl(0.034, 0.034, 0.12, "#c9d2de", { ...M, pos: [-0.14, 0.14, 0], rot: [0, 0, -25] });
      P.box(0.09, 0.09, 0.12, red, { pos: [-0.24, 0.115, 0], r: 0.022 });
      // pompa kolu
      rod(P, [-0.27, 0.14, 0], [-0.39, 0.25, 0], 0.016, 0.016, "#c9d2de", M);
      rod(P, [-0.38, 0.24, 0], [-0.425, 0.285, 0], 0.025, 0.025, PAL.ink, {});
      return P;
    },
  },

  // ─ Zemin / duvar ─
  jerrycan: {
    name: "Jerry can",
    icon: [12, -26, 0],
    build() {
      const P = new IParts();
      const ol = "#a9c27a", olD = "#91ab63";
      P.box(0.42, 0.48, 0.2, ol, { pos: [0, 0.24, 0], r: 0.04 });
      // X kabartma (ön + arka)
      for (const z of [0.1, -0.1]) {
        P.box(0.46, 0.04, 0.02, olD, { pos: [0, 0.23, z], rot: [0, 0, 41], r: 0.008, seg: 1 });
        P.box(0.46, 0.04, 0.02, olD, { pos: [0, 0.23, z], rot: [0, 0, -41], r: 0.008, seg: 1 });
      }
      // üç kollu sap
      for (const x of [-0.17, -0.05, 0.07]) P.box(0.03, 0.08, 0.035, ol, { pos: [x, 0.51, 0], r: 0.01 });
      P.cyl(0.022, 0.022, 0.29, ol, { pos: [-0.05, 0.555, 0], rot: [0, 0, 90], bevel: 0.01 });
      // ağız kapağı
      P.cyl(0.046, 0.05, 0.06, olD, { pos: [0.155, 0.505, 0], rot: [0, 0, -25], bevel: 0.012 });
      P.box(0.06, 0.016, 0.03, "#c9d2de", { pos: [0.12, 0.54, 0], rot: [0, 0, -25], finish: "metal", r: 0.005 });
      return P;
    },
  },

  cone: {
    name: "Traffic cone",
    icon: [14, -30, 0],
    build() {
      const P = new IParts();
      const or = "#f59a52";
      P.box(0.45, 0.05, 0.45, "#e5874a", { pos: [0, 0.025, 0], r: 0.02 });
      P.cyl(0.035, 0.17, 0.58, or, { pos: [0, 0.34, 0], bevel: 0.02, seg: 28 });
      const r = (y) => 0.17 - (0.135 * (y - 0.05)) / 0.58;
      P.rawCyl(r(0.32) + 0.004, r(0.24) + 0.004, 0.08, PAL.white, { pos: [0, 0.28, 0], seg: 28 });
      P.rawCyl(r(0.48) + 0.004, r(0.42) + 0.004, 0.06, PAL.white, { pos: [0, 0.45, 0], seg: 28 });
      return P;
    },
  },

  extinguisher: {
    name: "Fire extinguisher",
    icon: [12, -30, 0],
    build() {
      const P = new IParts();
      const red = "#e8584f", M = { finish: "metal" };
      P.cyl(0.11, 0.11, 0.48, red, { pos: [0, 0.24, 0], bevel: 0.05 });
      P.sphere(0.108, red, { pos: [0, 0.46, 0], thetaLength: Math.PI / 2, scale: [1, 0.7, 1] });
      P.rawCyl(0.113, 0.113, 0.14, PAL.cream, { pos: [0, 0.24, 0] });
      P.rawCyl(0.114, 0.114, 0.022, red, { pos: [0, 0.24, 0] });
      P.cyl(0.03, 0.036, 0.06, "#c9d2de", { ...M, pos: [0, 0.555, 0] });
      P.box(0.07, 0.05, 0.05, "#c9d2de", { ...M, pos: [0, 0.6, 0], r: 0.012 });
      P.box(0.17, 0.022, 0.04, PAL.ink, { pos: [-0.045, 0.648, 0], rot: [0, 0, 8], r: 0.009 });
      P.box(0.13, 0.02, 0.04, PAL.ink, { pos: [-0.05, 0.615, 0], rot: [0, 0, -6], r: 0.008 });
      P.cyl(0.026, 0.026, 0.014, PAL.cream, { pos: [0.0, 0.6, 0.033], rot: [90, 0, 0], bevel: 0.004 });
      P.box(0.004, 0.018, 0.004, PAL.red, { pos: [0.004, 0.604, 0.042], rot: [0, 0, -30], r: 0 });
      P.torus(0.018, 0.004, PAL.yellow, { pos: [-0.04, 0.6, 0.03], tseg: 14 });
      // hortum
      rod(P, [0.035, 0.6, 0], [0.11, 0.565, 0], 0.016, 0.016, PAL.ink, {});
      P.sphere(0.016, PAL.ink, { pos: [0.11, 0.565, 0] });
      rod(P, [0.11, 0.565, 0], [0.126, 0.3, 0], 0.016, 0.016, PAL.ink, {});
      P.sphere(0.016, PAL.ink, { pos: [0.126, 0.3, 0] });
      rod(P, [0.126, 0.3, 0], [0.126, 0.21, 0], 0.024, 0.016, PAL.ink, {});
      return P;
    },
  },

  clock: {
    name: "Wall clock",
    icon: [62, 0, 0],
    build() {
      const P = new IParts();
      lathe(P, ringPts(0.232, 0.275, 0.1, 0.018), PAL.blueDeep, { seg: 40 });
      P.cyl(0.24, 0.24, 0.06, PAL.cream, { pos: [0, 0.03, 0], bevel: 0.005, seg: 40 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, big = i % 3 === 0;
        P.box(big ? 0.022 : 0.014, 0.008, big ? 0.05 : 0.03, PAL.navy, { pos: [Math.sin(a) * 0.195, 0.064, -Math.cos(a) * 0.195], rot: [0, -a / D2R, 0], r: 0 });
      }
      const hand = (deg, len, w, y, col) => {
        const a = deg * D2R;
        P.box(w, 0.008, len, col, { pos: [Math.sin(a) * len * 0.4, y, -Math.cos(a) * len * 0.4], rot: [0, -deg, 0], r: 0 });
      };
      hand(300, 0.13, 0.024, 0.07, PAL.navy);
      hand(60, 0.18, 0.016, 0.078, PAL.navy);
      hand(160, 0.19, 0.006, 0.086, PAL.red);
      P.cyl(0.02, 0.02, 0.02, PAL.red, { pos: [0, 0.085, 0], bevel: 0.006 });
      return P;
    },
  },

  plate: {
    name: "License plate",
    icon: [68, 0, 0],
    build() {
      const P = new IParts();
      const ink = "#2f3a52";
      P.box(0.85, 0.035, 0.2, PAL.white, { pos: [0, 0.0175, 0], r: 0.012 });
      P.box(0.82, 0.006, 0.01, ink, { pos: [0, 0.037, 0.088], r: 0 });
      P.box(0.82, 0.006, 0.01, ink, { pos: [0, 0.037, -0.088], r: 0 });
      P.box(0.01, 0.006, 0.17, ink, { pos: [0.408, 0.037, 0], r: 0 });
      P.box(0.01, 0.006, 0.17, ink, { pos: [-0.408, 0.037, 0], r: 0 });
      // TR bandı: alt kısımda küçük beyaz "TR"
      P.box(0.08, 0.008, 0.172, "#3f6fc4", { pos: [-0.363, 0.038, 0], r: 0.003 });
      const W = PAL.white, ty = 0.0435, tz = 0.05, th = 0.036;
      P.box(0.022, 0.004, 0.006, W, { pos: [-0.377, ty, tz - th / 2], r: 0 });
      P.box(0.006, 0.004, th, W, { pos: [-0.377, ty, tz], r: 0 });
      const rx = -0.35;
      P.box(0.006, 0.004, th, W, { pos: [rx - 0.009, ty, tz], r: 0 });
      P.box(0.018, 0.004, 0.006, W, { pos: [rx, ty, tz - th / 2], r: 0 });
      P.box(0.018, 0.004, 0.006, W, { pos: [rx, ty, tz], r: 0 });
      P.box(0.006, 0.004, th / 2, W, { pos: [rx + 0.009, ty, tz - th / 4], r: 0 });
      P.box(0.006, 0.004, th / 2 + 0.004, W, { pos: [rx + 0.004, ty, tz + th / 4], rot: [0, 28, 0], r: 0 });
      // "34 A8C 34"
      const text = ["3", "4", null, "A", "B", "C", null, "3", "4"];
      let x = -0.26;
      for (const ch of text) {
        if (ch === null) { x += 0.04; continue; }
        glyph(P, ch, x, 0, 0.04, 0.042, 0.11, 0.013, ink);
        x += 0.075;
      }
      return P;
    },
  },

  // ─ Çay köşesi ─
  teaGlass: {
    name: "Tea glass",
    icon: [16, -20, 0],
    build() {
      const P = new IParts();
      // the saucer: white with a gold edge and a shallow well
      lathe(P, [[0, 0], [0.1, 0], [0.122, 0.008], [0.134, 0.02], [0.13, 0.026], [0.112, 0.02], [0.07, 0.014], [0, 0.014]], PAL.white, { seg: 36, finish: "satin" });
      P.torus(0.131, 0.0045, PAL.brass, { pos: [0, 0.023, 0], rot: [90, 0, 0], finish: "metal", tseg: 40, rseg: 6 });
      P.torus(0.072, 0.003, PAL.brass, { pos: [0, 0.015, 0], rot: [90, 0, 0], finish: "metal", tseg: 32, rseg: 5 });
      // the tea: deep "rabbit-blood" red, darker in the narrow waist, its surface a little lighter
      lathe(P, [[0, 0.05], [0.05, 0.052], [0.058, 0.07], [0.057, 0.1], [0.048, 0.142], [0.045, 0.168], [0.05, 0.205], [0.061, 0.24], [0.064, 0.25], [0, 0.25]],
        "#9c2716", { seg: 32, finish: "satin" });
      P.cyl(0.0635, 0.0635, 0.004, "#c4462a", { pos: [0, 0.25, 0], finish: "satin", seg: 32 });
      // the glass: tulip waist, a thick clear foot, thin walls flaring to the rim
      lathe(P, [[0, 0.016], [0.05, 0.016], [0.059, 0.026], [0.067, 0.066], [0.065, 0.1], [0.055, 0.142], [0.052, 0.168], [0.058, 0.205], [0.07, 0.25],
        [0.078, 0.282], [0.08, 0.292], [0.075, 0.292], [0.073, 0.282], [0.066, 0.25], [0.054, 0.205], [0.048, 0.168], [0.051, 0.142], [0.06, 0.1],
        [0.061, 0.068], [0.053, 0.05], [0, 0.047]], "#f2fbff", { seg: 32, finish: "clear" });
      P.torus(0.0775, 0.0032, "#ffffff", { pos: [0, 0.292, 0], rot: [90, 0, 0], finish: "satin", tseg: 40, rseg: 6 });   // the rim catches the light
      P.cyl(0.051, 0.057, 0.03, "#dff1f8", { pos: [0, 0.031, 0], finish: "glass", seg: 32 });                             // the heavy foot
      // a sugar cube and the little spoon on the saucer
      P.box(0.028, 0.028, 0.028, PAL.white, { pos: [0.092, 0.03, 0.04], rot: [0, 20, 0], r: 0.005 });
      P.box(0.1, 0.006, 0.011, "#c9d2de", { pos: [-0.05, 0.029, 0.082], rot: [0, 18, 0], finish: "metal", r: 0.003 });
      P.sphere(0.017, "#c9d2de", { pos: [-0.102, 0.029, 0.099], scale: [1.3, 0.35, 1], finish: "metal" });
      return P;
    },
  },

  teapot: {
    name: "Teapot",
    icon: [12, -22, 0],
    build() {
      const P = new IParts();
      const coral = "#f08f7c", cream = PAL.cream;
      // alt demlik (su)
      lathe(P, [[0, 0], [0.12, 0], [0.145, 0.02], [0.158, 0.08], [0.152, 0.18], [0.125, 0.245], [0.095, 0.275], [0.09, 0.29], [0, 0.29]], coral, { seg: 30, finish: "satin" });
      P.torus(0.156, 0.007, cream, { pos: [0, 0.12, 0], rot: [90, 0, 0], tseg: 36 });
      rod(P, [0.12, 0.08, 0], [0.205, 0.215, 0], 0.026, 0.014, coral, { finish: "satin" });
      P.torus(0.06, 0.016, cream, { pos: [-0.148, 0.16, 0], arc: Math.PI, rot: [0, 0, 90], tseg: 18 });
      // üst demlik
      lathe(P, [[0, 0.27], [0.08, 0.27], [0.104, 0.3], [0.114, 0.36], [0.108, 0.43], [0.085, 0.47], [0.08, 0.48], [0, 0.48]], coral, { seg: 28, finish: "satin" });
      P.torus(0.112, 0.006, cream, { pos: [0, 0.37, 0], rot: [90, 0, 0], tseg: 32 });
      rod(P, [0.085, 0.33, 0], [0.165, 0.43, 0], 0.017, 0.01, coral, { finish: "satin" });
      P.torus(0.045, 0.012, cream, { pos: [-0.11, 0.385, 0], arc: Math.PI, rot: [0, 0, 90], tseg: 16 });
      // kapak + tepe
      P.cyl(0.074, 0.084, 0.032, coral, { pos: [0, 0.495, 0], bevel: 0.012, finish: "satin" });
      P.sphere(0.028, cream, { pos: [0, 0.535, 0], scale: [1, 0.9, 1] });
      P.cyl(0.012, 0.012, 0.02, cream, { pos: [0, 0.515, 0] });
      return P;
    },
  },

  simit: {
    name: "Simit",
    icon: [58, 0, 0],
    build() {
      const P = new IParts();
      const R = 0.165, r = 0.055, ky = 0.85, y0 = r * ky * 1.11;
      // burgulu hamur: halka kesitini sarmal biçimde dalgalandır
      const g = new THREE.TorusGeometry(R, r, 14, 56);
      const pa = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i);
        const u = Math.atan2(v.y, v.x), cx = Math.cos(u) * R, cy = Math.sin(u) * R;
        const dx = v.x - cx, dy = v.y - cy, rho = dx * Math.cos(u) + dy * Math.sin(u);
        const phi = Math.atan2(v.z, rho);
        const k = 1 + 0.11 * Math.sin(2 * phi + 16 * u);
        pa.setXYZ(i, cx + dx * k, cy + dy * k, v.z * k);
      }
      g.computeVertexNormals();
      P.add(g, "#d9924a", { pos: [0, y0, 0], rot: [90, 0, 0], scale: [1, 1, ky] });
      const rnd = rng(31);
      for (let i = 0; i < 48; i++) {
        const a = rnd() * Math.PI * 2, ph = (rnd() * 2 - 1) * 1.15;
        const rr = R + r * Math.sin(ph);
        P.sphere(0.011, "#fff1d0", { pos: [Math.cos(a) * rr, y0 + r * ky * Math.cos(ph) + 0.005, Math.sin(a) * rr], scale: [1.5, 0.55, 0.9], rot: [0, rnd() * 180, 0], wseg: 6, hseg: 4 });
      }
      return P;
    },
  },

  tavla: {
    name: "Backgammon board",
    icon: [64, 0, 0],
    build() {
      const P = new IParts();
      P.box(0.7, 0.1, 0.45, PAL.woodDark, { pos: [0, 0.05, 0], r: 0.02 });
      P.box(0.704, 0.012, 0.454, "#a8763f", { pos: [0, 0.05, 0], r: 0.004, seg: 1 });
      P.box(0.64, 0.01, 0.39, PAL.woodLight, { pos: [0, 0.103, 0], r: 0.003, seg: 1 });
      const tri = [[-0.022, 0], [0.022, 0], [0, 0.15]];
      for (let i = 0; i < 12; i++) {
        const x = -0.29 + i * 0.0527 + (i >= 6 ? 0.01 : 0);
        const col = i % 2 ? "#5a4636" : "#d9605a";
        const col2 = i % 2 ? "#d9605a" : "#5a4636";
        P.extrude(tri, 0.006, col, { pos: [x, 0.111, -0.19], rot: [90, 0, 0], bevel: 0 });
        P.extrude(tri, 0.006, col2, { pos: [x, 0.111, 0.19], rot: [90, 0, 180], bevel: 0 });
      }
      P.box(0.022, 0.008, 0.39, PAL.woodDark, { pos: [0.005, 0.112, 0], r: 0.002 });
      for (const x of [-0.15, 0.15]) P.box(0.05, 0.05, 0.016, PAL.brass, { pos: [x, 0.05, 0.228], finish: "metal", r: 0.006 });
      for (const x of [-0.2, 0.2]) P.box(0.08, 0.03, 0.012, PAL.brass, { pos: [x, 0.05, -0.228], finish: "metal", r: 0.004 });
      return P;
    },
  },

  gloves: {
    name: "Work gloves",
    icon: [60, 20, 0],
    build() {
      const P = new IParts();
      const fab = PAL.butter, cuff = PAL.blueDeep, dot = "#f2b84b";
      const glove = (s) => {
        const G = new IParts();
        G.box(0.19, 0.045, 0.16, fab, { pos: [0, 0.0225, 0], r: 0.022 });
        const fz = [-0.054, -0.018, 0.018, 0.054], fl = [0.07, 0.09, 0.085, 0.065];
        fz.forEach((z, i) => G.capsule(0.019, fl[i], fab, { pos: [0.095 + fl[i] / 2 + 0.01, 0.022, z * s], rot: [0, 0, 90], cseg: 4, rseg: 10 }));
        G.capsule(0.021, 0.06, fab, { pos: [0.03, 0.022, 0.095 * s], rot: [0, s * -45, 90], cseg: 4, rseg: 10 });
        G.box(0.08, 0.05, 0.17, cuff, { pos: [-0.13, 0.025, 0], r: 0.022 });
        for (let i = 0; i < 6; i++) G.sphere(0.007, dot, { pos: [-0.04 + (i % 3) * 0.05, 0.046, -0.03 + Math.floor(i / 3) * 0.06], scale: [1, 0.4, 1], wseg: 8, hseg: 5 });
        return G;
      };
      P.merge(glove(1), { pos: [-0.01, 0, -0.045], rot: [0, 16, 0] });
      P.merge(glove(-1), { pos: [0.02, 0.042, 0.05], rot: [0, -20, 0] });
      return P;
    },
  },

  // ─ Temizlik ─
  mop: {
    name: "Mop",
    icon: [55, 32, 0],
    build() {
      const P = new IParts();
      P.cyl(0.022, 0.022, 0.86, PAL.blue, { pos: [-0.14, 0.09, 0], rot: [0, 0, -90], bevel: 0.008, seg: 16 });
      P.cyl(0.028, 0.028, 0.045, PAL.ink, { pos: [-0.56, 0.09, 0], rot: [0, 0, -90], bevel: 0.01 });
      P.box(0.08, 0.08, 0.13, PAL.blueDeep, { pos: [0.31, 0.08, 0], r: 0.02 });
      for (let row = 0; row < 3; row++) {
        for (let k = 0; k < 6; k++) {
          const psi = (-38 + (k / 5) * 76 + (row % 2) * 6) * D2R;
          const d = 0.13 - row * 0.012;
          const col = (k + row) % 4 === 0 ? "#cfe3f7" : "#f2f6fb";
          P.capsule(0.032, 0.17, col, { pos: [0.33 + Math.cos(psi) * d, 0.035 + row * 0.052, Math.sin(psi) * d], rot: [0, -psi / D2R, -90], cseg: 4, rseg: 8 });
        }
      }
      return P;
    },
  },

  roller: {
    name: "Paint roller",
    icon: [55, 30, 0],
    build() {
      const P = new IParts();
      const M = { finish: "metal" }, y = 0.075;
      P.cyl(0.032, 0.036, 0.25, PAL.coral, { pos: [-0.25, y, 0], rot: [0, 0, -90], bevel: 0.015 });
      P.cyl(0.02, 0.026, 0.04, "#c9d2de", { ...M, pos: [-0.105, y, 0], rot: [0, 0, -90] });
      rod(P, [-0.09, y, 0], [0.18, y, 0.165], 0.01, 0.01, "#c9d2de", M);
      P.sphere(0.01, "#c9d2de", { ...M, pos: [0.18, y, 0.165] });
      rod(P, [0.18, y, 0.165], [0.3, y, 0.165], 0.01, 0.01, "#c9d2de", M);
      P.sphere(0.01, "#c9d2de", { ...M, pos: [0.3, y, 0.165] });
      rod(P, [0.3, y, 0.165], [0.3, y, 0.13], 0.01, 0.01, "#c9d2de", M);
      P.cyl(0.074, 0.074, 0.27, PAL.sky, { pos: [0.3, y, 0], rot: [90, 0, 0], bevel: 0.024 });
      P.cyl(0.03, 0.03, 0.28, "#e3e8ef", { pos: [0.3, y, 0], rot: [90, 0, 0], bevel: 0.006 });
      return P;
    },
  },

  sponge: {
    name: "Sponge",
    icon: [30, -28, 0],
    build() {
      const P = new IParts();
      P.box(0.36, 0.105, 0.24, "#f9dc6a", { pos: [0, 0.0525, 0], r: 0.03 });
      P.box(0.354, 0.045, 0.234, "#7fbf6a", { pos: [0, 0.126, 0], r: 0.014 });
      const rnd = rng(5);
      for (let i = 0; i < 12; i++) {
        P.sphere(0.009 + rnd() * 0.006, "#e6c14e", { pos: [-0.15 + rnd() * 0.3, 0.02 + rnd() * 0.065, 0.12], scale: [1, 1, 0.4], wseg: 8, hseg: 6 });
        P.sphere(0.008 + rnd() * 0.005, "#e6c14e", { pos: [0.18, 0.02 + rnd() * 0.065, -0.1 + rnd() * 0.2], scale: [0.4, 1, 1], wseg: 8, hseg: 6 });
      }
      return P;
    },
  },

  rag: {
    name: "Rag",
    icon: [58, 18, 0],
    build() {
      const P = new IParts();
      const peach = PAL.peach, stripe = PAL.creamHi;
      P.box(0.45, 0.024, 0.4, peach, { pos: [0, 0.012, 0], r: 0.011 });
      P.box(0.42, 0.024, 0.34, "#f5b98c", { pos: [0.01, 0.035, -0.02], rot: [0, 4, 0], r: 0.011 });
      P.box(0.38, 0.024, 0.18, peach, { pos: [-0.005, 0.058, -0.09], rot: [0, -3, 0], r: 0.011 });
      for (const z of [0.115, 0.135]) P.box(0.415, 0.004, 0.01, stripe, { pos: [0.01, 0.048, z], rot: [0, 4, 0], r: 0 });
      for (const z of [-0.025, -0.045]) P.box(0.375, 0.004, 0.01, stripe, { pos: [-0.005, 0.071, z], rot: [0, -3, 0], r: 0 });
      // kıvrık köşe
      P.box(0.09, 0.022, 0.09, peach, { pos: [0.19, 0.03, 0.17], rot: [0, 30, 14], r: 0.01 });
      return P;
    },
  },
};

export const ITEM_IDS = Object.keys(ITEMS);
