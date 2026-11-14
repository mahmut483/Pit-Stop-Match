// Rapier (wasm gömülü) ile yığın fiziği.
// Titremesiz yığın için (tools/lab/physlab.mjs ile ölçüldü): 120 Hz sabit alt adım + çizimde ara değerleme,
// 26 yönlü sade yuvarlatılmış zarf (yassı eşyalar dönüp durmaz), uzunluk birimi 1.5 (doğal uyku daha erken),
// yavaşlayan gövdeye artan sönümleme. Gövdeler elle uyutulmaz: uyanınca zemini delip fırlıyorlar.
import RAPIER from "@dimforge/rapier3d-compat";

export const STEP = 1 / 120;
const LIN_DAMP = 0.45, ANG_DAMP = 1.6;
let R = null;
export async function initPhysics() {
  if (!R) { await RAPIER.init(); R = RAPIER; }
  return R;
}

// Model köşe noktalarından sade zarf: Fibonacci küresindeki yönlerde en uç noktalar.
// Az ve iyi dağılmış nokta → az yüzlü, kararlı temas manifoldu.
export function supportHull(points, dirCount = 12, round = 0.012) {
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
    for (let i = 0; i < n; i++) {
      const d = points[i * 3] * dx + points[i * 3 + 1] * dy + points[i * 3 + 2] * dz;
      if (d > best) { best = d; bi = i; }
    }
    pick.add(bi);
  }
  // ağırlık merkezine doğru yuvarlatma payı kadar içeri çek (yuvarlak kenar dışa ekler)
  let cx = 0, cy = 0, cz = 0;
  for (const i of pick) { cx += points[i * 3]; cy += points[i * 3 + 1]; cz += points[i * 3 + 2]; }
  cx /= pick.size; cy /= pick.size; cz /= pick.size;
  const out = new Float32Array(pick.size * 3);
  let k = 0;
  for (const i of pick) {
    const x = points[i * 3] - cx, y = points[i * 3 + 1] - cy, z = points[i * 3 + 2] - cz;
    const len = Math.hypot(x, y, z) || 1;
    const s = Math.max(0.35, 1 - round / len);
    out[k++] = cx + x * s; out[k++] = cy + y * s; out[k++] = cz + z * s;
  }
  return { points: out, round };
}

export class PileWorld {
  constructor(zone) {
    this.world = new R.World({ x: 0, y: -14, z: 0 });
    this.world.timestep = STEP;
    this.world.lengthUnit = 1.5;
    this.acc = 0;
    this.alpha = 1;
    this.bodies = new Map(); // gövde tanıtıcı → eşya
    const ground = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    this.world.createCollider(R.ColliderDesc.cuboid(9, 0.5, 9).setTranslation(0, -0.5, 0).setFriction(0.95), ground);
    // yığın alanının çevresinde görünmez çit (eşyalar kenardan kaçmasın, karıştırınca uçmasın)
    const pad = 0.15, h = 1.6, t = 0.25;
    const { x0, x1, z0, z1 } = zone;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2 + pad, hz = (z1 - z0) / 2 + pad;
    for (const [px, pz, sx, sz] of [[cx, z0 - pad - t, hx + t, t], [cx, z1 + pad + t, hx + t, t], [x0 - pad - t, cz, t, hz + t], [x1 + pad + t, cz, t, hz + t]]) {
      this.world.createCollider(R.ColliderDesc.cuboid(sx, h, sz).setTranslation(px, h, pz).setFriction(0.3), ground);
    }
  }

  addItem(item, shape, pos, quat) {
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setLinearDamping(LIN_DAMP)
      .setAngularDamping(ANG_DAMP)
      .setCanSleep(true);
    const body = this.world.createRigidBody(desc);
    let col = R.ColliderDesc.roundConvexHull(shape.points, shape.round) || R.ColliderDesc.convexHull(shape.points) || R.ColliderDesc.ball(0.2);
    col.setFriction(0.8).setRestitution(0).setDensity(1.0);
    this.world.createCollider(col, body);
    item.body = body;
    item.still = 0;
    item.calmK = 0;
    item.prevP = { x: pos.x, y: pos.y, z: pos.z };
    item.prevQ = { x: quat.x, y: quat.y, z: quat.z, w: quat.w };
    this.bodies.set(body.handle, item);
    return body;
  }

  removeItem(item) {
    if (!item.body) return;
    const p = item.body.translation();
    this.bodies.delete(item.body.handle);
    this.world.removeRigidBody(item.body);
    item.body = null;
    this.wakeAround(p, 1.7);
  }

  wakeAround(p, r) {
    const r2 = r * r;
    for (const it of this.bodies.values()) {
      const q = it.body.translation();
      const dx = q.x - p.x, dz = q.z - p.z;
      if (dx * dx + dz * dz < r2 && q.y >= p.y - 0.5) { it.body.wakeUp(); it.still = 0; }
    }
  }

  wakeAll() { for (const it of this.bodies.values()) { it.body.wakeUp(); it.still = 0; } }

  step(dt) {
    this.acc = Math.min(this.acc + dt, 0.1);
    let n = 0;
    while (this.acc >= STEP && n < 8) {
      for (const it of this.bodies.values()) {
        const b = it.body;
        if (b.isSleeping()) continue;
        const t = b.translation(), r = b.rotation();
        it.prevP.x = t.x; it.prevP.y = t.y; it.prevP.z = t.z;
        it.prevQ.x = r.x; it.prevQ.y = r.y; it.prevQ.z = r.z; it.prevQ.w = r.w;
      }
      this.world.step();
      this.acc -= STEP;
      n++;
      this.calm();
    }
    if (n === 8) this.acc = 0;
    this.alpha = this.acc / STEP;
  }

  // Yavaşlayan gövdenin sönümlemesini kademeli artır: yığın çabuk durulur, düşen eşya etkilenmez
  calm() {
    for (const it of this.bodies.values()) {
      const b = it.body;
      if (b.isSleeping()) { it.still = 0; continue; }
      const lv = b.linvel(), av = b.angvel();
      const slow = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z < 0.1225 && av.x * av.x + av.y * av.y + av.z * av.z < 0.64;
      it.still = slow ? it.still + STEP : 0;
      const k = Math.min(1, it.still / 0.6);
      if (k !== it.calmK) {
        it.calmK = k;
        b.setLinearDamping(LIN_DAMP + k * 2);
        b.setAngularDamping(ANG_DAMP + k * 4);
      }
    }
  }

  topAt(x, z, rad = 0.45) {
    let top = 0;
    for (const it of this.bodies.values()) {
      const q = it.body.translation();
      if (Math.abs(q.x - x) < rad && Math.abs(q.z - z) < rad) top = Math.max(top, q.y + it.radius);
    }
    return top;
  }

  awakeCount() {
    let n = 0;
    for (const it of this.bodies.values()) if (!it.body.isSleeping()) n++;
    return n;
  }

  debugLines() { return this.world.debugRender(); }

  dispose() { this.world.free(); this.bodies.clear(); }
}
