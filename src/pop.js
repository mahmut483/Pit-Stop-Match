// Makes the items to collect stand out from the black-and-white shop: deeper, more saturated
// colour after lighting (the neutral tone mapping otherwise washes them towards pastel).

const GLSL = `
{
  float popL = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  float popHi = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b);
  float popSat = (popHi - min(min(outgoingLight.r, outgoingLight.g), outgoingLight.b)) / max(popHi, 1e-4);
  // greys (tyres, metal) stay neutral; coloured parts get the boost
  float popK = mix(1.0, 1.7, smoothstep(0.12, 0.35, popSat));
  outgoingLight = max(mix(vec3(popL), outgoingLight, popK), 0.0) * 0.92;
}
`;

const vivid = new Map();
function vividMaterial(m) {
  let c = vivid.get(m);
  if (c) return c;
  c = m.clone();
  c.defines = { ...(m.defines || {}) };
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey?.bind(m);
  c.onBeforeCompile = (sh, renderer) => {
    if (prev) prev(sh, renderer);
    sh.fragmentShader = sh.fragmentShader.replace("#include <opaque_fragment>", GLSL + "#include <opaque_fragment>");
  };
  c.customProgramCacheKey = () => (prevKey ? prevKey() : "") + "|pop";
  vivid.set(m, c);
  return c;
}

export function popItem(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.material = Array.isArray(o.material) ? o.material.map(vividMaterial) : vividMaterial(o.material);
  });
}
