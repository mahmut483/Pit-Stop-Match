// Eşya kataloğu: ?icons=1 → dock görünümü (ön ortografik, icon Euler'i), yoksa 3/4 izometrik ızgara.
// ?only=id1,id2 → yalnız seçilenler (yakın plan kontrol için).
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ITEMS, ITEM_IDS } from "../src/items.js";
import { D2R } from "../src/kit.js";

const qs = new URLSearchParams(location.search);
const ICONS = qs.get("icons") === "1";
const ONLY = qs.get("only") ? qs.get("only").split(",") : null;
const ids = ONLY || ITEM_IDS;
const W = innerWidth, H = innerHeight;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(W, H);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
scene.add(new THREE.HemisphereLight("#fff6e8", "#b9c6de", 1.7));
const sun = new THREE.DirectionalLight("#fff1dc", 2.2);
scene.add(sun, sun.target);

const labels = document.createElement("div");
document.body.appendChild(labels);
const label = (text, x, y, sub) => {
  const d = document.createElement("div");
  d.className = "lab";
  d.style.left = x + "px";
  d.style.top = y + "px";
  d.innerHTML = text + (sub ? `<small>${sub}</small>` : "");
  labels.appendChild(d);
};

const sizes = [];
const built = ids.map((id) => {
  const g = ITEMS[id].build().build();
  const box = new THREE.Box3().setFromObject(g);
  const s = box.getSize(new THREE.Vector3());
  let verts = 0;
  g.traverse((o) => { if (o.isMesh) verts += o.geometry.attributes.position.count; });
  sizes.push({ id, x: +s.x.toFixed(3), y: +s.y.toFixed(3), z: +s.z.toFixed(3), minY: +box.min.y.toFixed(3), cx: +((box.min.x + box.max.x) / 2).toFixed(3), cz: +((box.min.z + box.max.z) / 2).toFixed(3), verts });
  return { id, g };
});
window.__sizes = sizes;

if (!ICONS) {
  const cols = ONLY ? Math.min(ids.length, 4) : 7, sp = ONLY ? 1.2 : 1.45;
  const rows = Math.ceil(ids.length / cols);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: "#e9eef8", roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const pos = [];
  built.forEach(({ g }, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    g.position.set((c - (cols - 1) / 2) * sp, 0, (r - (rows - 1) / 2) * sp);
    scene.add(g);
    pos.push(g.position.clone());
  });
  const aspect = W / H;
  const cam = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 100);
  const dir = new THREE.Vector3(0.45, 0.8, 1).normalize();
  cam.position.copy(dir.multiplyScalar(30));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  // kadrajı nesnelere sığdır
  const all = new THREE.Box3();
  built.forEach(({ g }) => all.expandByObject(g));
  const pts = [];
  for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(i & 1 ? all.max.x : all.min.x, i & 2 ? all.max.y : all.min.y, i & 4 ? all.max.z : all.min.z).applyMatrix4(cam.matrixWorldInverse));
  const bx = new THREE.Box2().setFromPoints(pts.map((p) => new THREE.Vector2(p.x, p.y)));
  const half = Math.max((bx.max.x - bx.min.x) / 2 / aspect, (bx.max.y - bx.min.y) / 2) * 1.08;
  const cxv = (bx.max.x + bx.min.x) / 2, cyv = (bx.max.y + bx.min.y) / 2;
  Object.assign(cam, { left: cxv - half * aspect, right: cxv + half * aspect, top: cyv + half, bottom: cyv - half });
  cam.updateProjectionMatrix();
  sun.position.set(-4, 10, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0005;
  renderer.render(scene, cam);
  pos.forEach((p, i) => {
    const v = p.clone().project(cam);
    label(ITEMS[ids[i]].name, (v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H + (ONLY ? 70 : 34), ids[i]);
  });
} else {
  // Dock görünümü: ortografik ön kamera, her hücrede icon Euler'i
  const cols = ONLY ? Math.min(ids.length, 4) : 9, cell = ONLY ? 260 : 130;
  const rows = Math.ceil(ids.length / cols);
  const cam = new THREE.OrthographicCamera(0, W, 0, -H, -1000, 1000);
  cam.position.z = 500;
  sun.position.set(-200, 400, 600);
  sun.target.position.set(0, -H / 2, 0);
  const ox = (W - cols * cell) / 2, oy = (H - rows * cell) / 2;
  built.forEach(({ id, g }, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const [rx, ry, rz] = ITEMS[id].icon;
    const holder = new THREE.Group();
    g.rotation.set(rx * D2R, ry * D2R, rz * D2R);
    holder.add(g);
    const box = new THREE.Box3().setFromObject(holder);
    const ctr = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    g.position.sub(ctr);
    const k = (cell * 0.72) / Math.max(sz.x, sz.y);
    holder.scale.setScalar(k);
    const cx = ox + c * cell + cell / 2, cy = oy + r * cell + cell / 2;
    holder.position.set(cx, -cy, 0);
    scene.add(holder);
    const slot = document.createElement("div");
    slot.className = "slot";
    Object.assign(slot.style, { left: ox + c * cell + 6 + "px", top: oy + r * cell + 6 + "px", width: cell - 12 + "px", height: cell - 12 + "px" });
    document.body.insertBefore(slot, renderer.domElement);
    label(ITEMS[id].name, cx, oy + r * cell + cell - 16);
  });
  renderer.render(scene, cam);
}
document.title = "ready";
