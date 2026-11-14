// Ara animasyonlar, parıltı/toz parçacıkları ve sentezlenmiş sesler (dosya gerektirmez).
import * as THREE from "three";

export const ease = {
  linear: (k) => k,
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  inCubic: (k) => k * k * k,
  outBack: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  outElastic: (k) => (k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outQuad: (k) => 1 - (1 - k) * (1 - k),
};

// ── Ara animasyon yöneticisi ────────────────────────────────────────────────────────────
export class Tweens {
  constructor() { this.list = []; this.speed = 1; }
  add({ dur = 0.3, delay = 0, ease: e = ease.outCubic, update, done }) {
    return new Promise((resolve) => {
      this.list.push({ t: -delay, dur: Math.max(0.0001, dur), e, update, done, resolve });
    });
  }
  wait(sec) { return this.add({ dur: sec, update: () => {} }); }
  update(dt) {
    dt *= this.speed;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = Math.min(1, tw.t / tw.dur);
      tw.update && tw.update(tw.e(k), k);
      if (k >= 1) {
        this.list.splice(i, 1);
        tw.done && tw.done();
        tw.resolve();
      }
    }
  }
  clear() { this.list.length = 0; }
}

// ── Parçacıklar (Points, yumuşak daire) ────────────────────────────────────────────────
function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.45, "rgba(255,255,255,0.85)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  // dört kollu parıltı
  g.globalCompositeOperation = "lighter";
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.fillRect(30, 2, 4, 60); g.fillRect(2, 30, 60, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const DOT = { tex: null };

export class Particles {
  // screen: true → boyut piksel (ortografik bindirme sahnesi); false → dünya birimi
  constructor(max = 500, screen = false) {
    if (!DOT.tex) DOT.tex = dotTexture();
    this.max = max;
    this.p = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: DOT.tex }, scale: { value: 1 }, screen: { value: screen ? 1 : 0 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute vec4 color; varying vec4 vColor; uniform float scale; uniform float screen;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = screen > 0.5 ? size * scale : size * scale / max(0.001, -mv.z); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying vec4 vColor;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor.rgb, vColor.a * t.a); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite: false, depthTest: !screen,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }
  // tür: "spark" (parlak, yukarı saçılır), "dust" (toz bulutu), "star" (iri, yavaş)
  burst(at, n, o = {}) {
    const color = new THREE.Color(o.color || "#fff3b0");
    for (let i = 0; i < n && this.p.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = o.up ?? 1;
      const sp = (o.speed ?? 2) * (0.4 + Math.random() * 0.8);
      const el = o.flat ? 0 : (Math.random() * 0.8 + 0.2) * up;
      const v = o.screen
        ? new THREE.Vector3(Math.cos(a) * sp, Math.sin(a) * sp, 0)
        : new THREE.Vector3(Math.cos(a) * sp * (1 - el * 0.5), el * sp, Math.sin(a) * sp * (1 - el * 0.5));
      const c = color.clone();
      if (o.palette) c.set(o.palette[(Math.random() * o.palette.length) | 0]);
      this.p.push({
        x: at.x + (Math.random() - 0.5) * (o.spread ?? 0), y: at.y + (Math.random() - 0.5) * (o.spread ?? 0), z: at.z + (Math.random() - 0.5) * (o.spread ?? 0),
        v, life: 0, max: (o.life ?? 0.7) * (0.6 + Math.random() * 0.6), size: (o.size ?? 0.25) * (0.6 + Math.random() * 0.7),
        c, grav: o.gravity ?? -3, drag: o.drag ?? 2.2, fade: o.fade ?? 1,
      });
    }
  }
  get active() { return this.p.length > 0; }
  update(dt) {
    const P = this.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.life += dt;
      if (q.life >= q.max) { P.splice(i, 1); continue; }
      q.v.multiplyScalar(Math.exp(-q.drag * dt));
      q.v.y += q.grav * dt;
      q.x += q.v.x * dt; q.y += q.v.y * dt; q.z += q.v.z * dt;
    }
    for (let i = 0; i < P.length; i++) {
      const q = P[i], k = q.life / q.max;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.col[i * 4] = q.c.r; this.col[i * 4 + 1] = q.c.g; this.col[i * 4 + 2] = q.c.b;
      this.col[i * 4 + 3] = (1 - Math.pow(k, 2)) * q.fade;
      this.size[i] = q.size * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) * 0.6);
    }
    const g = this.points.geometry;
    g.setDrawRange(0, P.length);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
  clear() { this.p.length = 0; }
}

// ── Ses (WebAudio sentez) ───────────────────────────────────────────────────────────────
export class Sound {
  constructor() { this.ctx = null; this.on = true; this.master = null; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55 * (this.volume ?? 1);
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.6;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }
  _ok() { return this.on && this.ctx && this.ctx.state === "running"; }
  tone(freq, dur, { type = "sine", vol = 0.3, at = 0, slide = 0, attack = 0.005 } = {}) {
    if (!this._ok()) return;
    const t0 = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  hiss(dur, { vol = 0.15, at = 0, f0 = 800, f1 = 3000, q = 1.2 } = {}) {
    if (!this._ok()) return;
    const t0 = this.ctx.currentTime + at;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }
  pick() { this.tone(520, 0.09, { type: "triangle", vol: 0.28, slide: 1.6 }); this.tone(1400, 0.04, { type: "square", vol: 0.04 }); }
  land() { this.tone(300, 0.08, { type: "sine", vol: 0.22, slide: 0.7 }); }
  match(combo = 1) { const k = Math.pow(2, Math.min(combo - 1, 6) / 12); [784, 988, 1175].forEach((f, i) => this.tone(f * k, 0.28, { type: "triangle", vol: 0.2, at: i * 0.06 })); this.tone(2350 * k, 0.5, { type: "sine", vol: 0.05, at: 0.12 }); }
  place() { this.tone(220, 0.16, { type: "sine", vol: 0.3, slide: 1.8 }); this.hiss(0.15, { vol: 0.05, f0: 2000, f1: 5000 }); }
  fix() { this.hiss(0.22, { vol: 0.08, f0: 400, f1: 1600 }); this.tone(180, 0.12, { type: "square", vol: 0.06, at: 0.18 }); this.tone(140, 0.1, { type: "sine", vol: 0.25, at: 0.2 }); }
  clean() { this.hiss(1.2, { vol: 0.12, f0: 1500, f1: 7000, q: 2 }); [1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.4, { type: "sine", vol: 0.06, at: 0.3 + i * 0.2 })); }
  undo() { this.tone(700, 0.14, { type: "triangle", vol: 0.2, slide: 0.55 }); }
  shuffle() { for (let i = 0; i < 7; i++) this.tone(300 + Math.random() * 500, 0.05, { type: "square", vol: 0.04, at: i * 0.05 }); this.hiss(0.4, { vol: 0.08, f0: 600, f1: 2500 }); }
  hint() { this.tone(1046, 0.18, { type: "sine", vol: 0.15 }); this.tone(1568, 0.25, { type: "sine", vol: 0.1, at: 0.08 }); }
  win() { [523, 659, 784, 1046, 1319].forEach((f, i) => this.tone(f, 0.35, { type: "triangle", vol: 0.2, at: i * 0.11 })); this.tone(1568, 0.8, { type: "sine", vol: 0.08, at: 0.6 }); }
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, { type: "triangle", vol: 0.2, at: i * 0.16 })); }
  honk(at = 0) { for (const k of [0, 0.24]) { this.tone(440, 0.17, { type: "square", vol: 0.07, at: at + k }); this.tone(554, 0.17, { type: "square", vol: 0.06, at: at + k }); } }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = 0.55 * v; }
  whoosh(at = 0) { this.hiss(0.32, { vol: 0.07, at, f0: 500, f1: 2400, q: 0.9 }); }
  sparkle(at = 0) { [2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.18, { type: "sine", vol: 0.035, at: at + i * 0.05 })); }
  thud() { this.tone(110, 0.14, { type: "sine", vol: 0.22, slide: 0.6 }); this.hiss(0.08, { vol: 0.03, f0: 300, f1: 900 }); }
  shutter(up = true) { for (let i = 0; i < 12; i++) this.tone(up ? 180 + i * 6 : 250 - i * 6, 0.04, { type: "square", vol: 0.025, at: i * 0.045 }); this.hiss(0.6, { vol: 0.05, f0: 300, f1: up ? 900 : 400, q: 0.8 }); }
  star(i) { this.tone(880 * Math.pow(2, i * 4 / 12), 0.3, { type: "triangle", vol: 0.16 }); this.tone(1760 * Math.pow(2, i * 4 / 12), 0.25, { type: "sine", vol: 0.05, at: 0.03 }); }
  warn() { this.tone(330, 0.12, { type: "triangle", vol: 0.12 }); this.tone(262, 0.16, { type: "triangle", vol: 0.12, at: 0.12 }); }
  deny() { this.tone(160, 0.12, { type: "square", vol: 0.05 }); }
}

// ── Doku yardımcıları (bindirme efektleri) ──────────────────────────────────────────────
function canvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _ring = null, _glow = null, _star = null;
export function ringTexture() {
  return _ring || (_ring = canvasTexture(128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.55, "rgba(255,255,255,0.95)"); gr.addColorStop(0.75, "rgba(255,255,255,0.6)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }));
}
export function glowTexture() {
  return _glow || (_glow = canvasTexture(128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.2, "rgba(255,250,220,0.9)"); gr.addColorStop(0.5, "rgba(255,230,150,0.35)"); gr.addColorStop(1, "rgba(255,220,120,0)");
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }));
}
export function starTexture() {
  return _star || (_star = canvasTexture(128, (g, s) => {
    g.translate(s / 2, s / 2);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? s * 0.12 : s * 0.5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill();
  }));
}

// Ekran (piksel) uzayında geçici sprite: halka, parlama, yıldız
export function screenSprite(tex, color = "#ffffff", additive = false) {
  const m = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.renderOrder = 20;
  return mesh;
}

// ── Konfeti (ekran uzayı, dönen dikdörtgenler) ──────────────────────────────────────────
export class Confetti {
  constructor(max = 260) {
    this.max = max;
    this.p = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.flip = new Float32Array(max);
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute("rot", new THREE.BufferAttribute(this.rot, 1));
    geo.setAttribute("flip", new THREE.BufferAttribute(this.flip, 1));
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float size; attribute vec3 color; attribute float rot; attribute float flip;
        varying vec3 vColor; varying float vRot; varying float vFlip; uniform float scale;
        void main(){ vColor = color; vRot = rot; vFlip = flip; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vRot; varying float vFlip;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          p = mat2(c, -s, s, c) * p;
          float w = 0.42 * max(0.12, abs(vFlip));
          if (abs(p.x) > w || abs(p.y) > 0.22) discard;
          gl_FragColor = vec4(vColor * (0.75 + 0.25 * vFlip), 1.0);
        }`,
      transparent: true, depthWrite: false, depthTest: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 30;
  }
  burst(w, h, n = 160) {
    const pal = ["#f7d36b", "#ef7f72", "#9fd8c4", "#7fa8e0", "#b9a8ec", "#ffffff", "#f6a560", "#8fe089"];
    for (let i = 0; i < n && this.p.length < this.max; i++) {
      const fromLeft = i % 2 === 0;
      this.p.push({
        x: fromLeft ? -10 : w + 10, y: -(h * (0.55 + Math.random() * 0.3)),
        vx: (fromLeft ? 1 : -1) * (180 + Math.random() * 420), vy: 520 + Math.random() * 520,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14, ph: Math.random() * 6.28, vph: 6 + Math.random() * 8,
        size: 9 + Math.random() * 9, c: new THREE.Color(pal[(Math.random() * pal.length) | 0]), life: 0, max: 2.6 + Math.random() * 1.4,
      });
    }
  }
  rain(w, n = 90) {
    const pal = ["#f7d36b", "#ef7f72", "#9fd8c4", "#7fa8e0", "#b9a8ec", "#ffffff"];
    for (let i = 0; i < n && this.p.length < this.max; i++) {
      this.p.push({
        x: Math.random() * w, y: 20 + Math.random() * 260, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 80,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 10, ph: Math.random() * 6.28, vph: 5 + Math.random() * 7,
        size: 8 + Math.random() * 8, c: new THREE.Color(pal[(Math.random() * pal.length) | 0]), life: 0, max: 3 + Math.random() * 2,
      });
    }
  }
  get active() { return this.p.length > 0; }
  update(dt) {
    const P = this.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.life += dt;
      if (q.life > q.max) { P.splice(i, 1); continue; }
      q.vx *= Math.exp(-1.6 * dt);
      q.vy = q.vy * Math.exp(-1.9 * dt) - 520 * dt;
      if (q.vy < -170) q.vy = -170;
      q.x += (q.vx + Math.sin(q.ph) * 40) * dt; q.y += q.vy * dt;
      q.rot += q.vr * dt; q.ph += q.vph * dt;
    }
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = 400;
      this.col[i * 3] = q.c.r; this.col[i * 3 + 1] = q.c.g; this.col[i * 3 + 2] = q.c.b;
      this.size[i] = q.size; this.rot[i] = q.rot; this.flip[i] = Math.cos(q.ph);
    }
    const g = this.points.geometry;
    g.setDrawRange(0, P.length);
    for (const k of ["position", "color", "size", "rot", "flip"]) g.attributes[k].needsUpdate = true;
  }
  clear() { this.p.length = 0; this.update(0); }
}
