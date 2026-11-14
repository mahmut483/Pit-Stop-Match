// Kir katmanı: oda materyallerine (MeshStandardMaterial) dünya konumundan üretilen leke eklenir.
// Kategoriler: floor (yağ lekesi, damla), wall (is, rutubet, akıntı), counter (gres), furniture (pas/sürtme).
// Temizlik: ekran boyunca sol üstten sağ alta süpüren dalga; cephede parıltı çizgisi.
import * as THREE from "three";

export const GRIME_CATS = ["floor", "wall", "counter", "furniture"];
const CAT_ID = { floor: 0, wall: 1, counter: 2, furniture: 3 };

export const grimeShared = { uRes: { value: new THREE.Vector2(1, 1) } };
export const GRIME = Object.fromEntries(GRIME_CATS.map((c) => [c, {
  uDirt: { value: 0 },
  uClean: { value: -0.3 },
  anim: null,
}]));

const GLSL_COMMON = /* glsl */ `
varying vec3 vGW;
varying vec3 vGN;
uniform float uDirt;
uniform float uClean;
uniform vec2 uRes;
float gHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1,0,0)), f.x), mix(gHash(i + vec3(0,1,0)), gHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0,0,1)), gHash(i + vec3(1,0,1)), f.x), mix(gHash(i + vec3(0,1,1)), gHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float gFbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * gNoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

const GLSL_APPLY = /* glsl */ `
float gOil = 0.0;
float gBand = 0.0;
if (uDirt > 0.001) {
  vec3 p = vGW;
  vec3 nrm = normalize(vGN);
  float g = 0.0;
  vec3 gCol = vec3(0.30, 0.26, 0.22);
#if GRIME_CAT == 0
  float up = smoothstep(0.5, 0.9, nrm.y);
  float n = gFbm(vec3(p.xz * 0.5, 3.1));
  float oil = smoothstep(0.6, 0.635, n);
  float core = smoothstep(0.665, 0.72, n);
  float drops = smoothstep(0.88, 0.91, gNoise(vec3(p.xz * 3.6, 7.0)));
  float grit = smoothstep(0.72, 0.78, gNoise(vec3(p.xz * 13.0, 1.0)));
  g = up * clamp(oil * 0.72 + core * 0.18 + drops * 0.55 + grit * 0.22, 0.0, 0.9);
  gOil = up * max(oil, drops);
  gCol = vec3(0.17, 0.16, 0.19);
#elif GRIME_CAT == 1
  float u = p.x + p.z;
  float y = p.y;
  float soot = (1.0 - smoothstep(0.0, 1.9, y)) * (0.35 + 0.45 * gFbm(vec3(u * 0.8, y * 0.8, 2.0)));
  float damp = smoothstep(0.57, 0.62, gFbm(vec3(u * 0.42, y * 0.42, 5.0)));
  float dampRim = damp - smoothstep(0.62, 0.67, gFbm(vec3(u * 0.42, y * 0.42, 5.0)));
  float colN = gNoise(vec3(u * 6.5, 0.5, 9.0));
  float dripTop = 3.95 - 0.5 * gNoise(vec3(u * 2.0, 3.0, 1.0));
  float dripLen = 0.5 + 1.9 * gNoise(vec3(u * 3.1, 1.0, 4.0));
  float drip = smoothstep(0.76, 0.8, colN) * smoothstep(dripTop - dripLen, dripTop - dripLen + 0.25, y) * step(y, dripTop);
  float tip = smoothstep(0.76, 0.8, colN) * (1.0 - smoothstep(0.0, 0.09, abs(y - (dripTop - dripLen + 0.05))));
  float flake = smoothstep(0.8, 0.84, gFbm(vec3(u * 1.3, y * 1.3, 8.0)));
  g = clamp(soot * 0.65 + damp * 0.38 + dampRim * 0.3 + drip * 0.42 + tip * 0.35 + flake * 0.3, 0.0, 0.85);
  gCol = mix(vec3(0.36, 0.30, 0.22), vec3(0.24, 0.22, 0.22), soot);
#elif GRIME_CAT == 2
  float up = smoothstep(0.5, 0.9, nrm.y);
  float n = gFbm(vec3(p.xz * 1.5, 11.0));
  float spot = smoothstep(0.6, 0.64, n);
  float ring = smoothstep(0.03, 0.0, abs(n - 0.57)) * 0.6;
  float smear = smoothstep(0.55, 0.62, gFbm(vec3(p * 1.1 + 4.0))) * (1.0 - up);
  float drops = smoothstep(0.87, 0.9, gNoise(p * 5.0));
  g = clamp(up * (spot * 0.6 + ring + drops * 0.4) + smear * 0.45, 0.0, 0.85);
  gOil = up * spot;
  gCol = vec3(0.24, 0.21, 0.2);
#else
  float n = gFbm(p * 1.35 + 2.0);
  float smudge = smoothstep(0.6, 0.65, n);
  float rust = smoothstep(0.7, 0.76, gFbm(p * 2.6 + 9.0));
  float side = 1.0 - smoothstep(0.6, 0.95, abs(nrm.y));
  float hand = smoothstep(0.86, 0.9, gNoise(p * 4.5)) * side;
  g = clamp(smudge * 0.5 + rust * 0.45 + hand * 0.35, 0.0, 0.8);
  gCol = mix(vec3(0.30, 0.26, 0.23), vec3(0.55, 0.33, 0.2), rust);
#endif
  vec2 sc = gl_FragCoord.xy / uRes;
  float t = sc.x * 0.55 + (1.0 - sc.y) * 0.45;
  float edge = (gNoise(vec3(p * 3.0)) - 0.5) * 0.05;
  float vis = uDirt * smoothstep(uClean - 0.025, uClean + 0.025, t + edge);
  g *= vis;
  gOil *= vis;
  diffuseColor.rgb = mix(diffuseColor.rgb, gCol, g);
  float gAct = step(-0.05, uClean) * step(uClean, 1.08);
  gBand = uDirt * gAct * exp(-pow((t + edge - uClean) / 0.018, 2.0));
}
`;

export function applyGrime(material, cat) {
  const U = GRIME[cat];
  if (!U) return;
  material.defines = { ...(material.defines || {}), GRIME_CAT: CAT_ID[cat] };
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uDirt = U.uDirt;
    sh.uniforms.uClean = U.uClean;
    sh.uniforms.uRes = grimeShared.uRes;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGW;\nvarying vec3 vGN;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGN = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + GLSL_COMMON)
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + GLSL_APPLY)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.22, gOil * 0.85);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.96, 0.82) * gBand * 0.9;");
  };
  material.customProgramCacheKey = () => "grime-" + cat;
}

// Seviye başında kir aç/kapa (anında)
export function setDirt(cat, on) {
  const U = GRIME[cat];
  U.uDirt.value = on ? 1 : 0;
  U.uClean.value = -0.3;
  U.anim = null;
}

// Süpürme dalgası başlat; bitince resolve
export function cleanCategory(cat, duration = 1.4) {
  const U = GRIME[cat];
  if (!U || U.uDirt.value === 0) return Promise.resolve();
  return new Promise((resolve) => { U.anim = { t: 0, duration, resolve }; });
}

export function isDirty(cat) {
  const U = GRIME[cat];
  return U.uDirt.value > 0 && U.uClean.value < 1.2;
}

export function updateGrime(dt) {
  for (const cat of GRIME_CATS) {
    const U = GRIME[cat];
    if (!U.anim) continue;
    U.anim.t += dt;
    const k = Math.min(1, U.anim.t / U.anim.duration);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    U.uClean.value = -0.12 + e * 1.37;
    if (k >= 1) {
      U.uDirt.value = 0;
      const r = U.anim.resolve;
      U.anim = null;
      r();
    }
  }
}
