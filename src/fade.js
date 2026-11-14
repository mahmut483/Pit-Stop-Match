// Cinematic black-and-white for the shop: everything that is scenery turns into a darker,
// higher-contrast greyscale, so the colourful items to collect (and the ones put back) carry all
// the colour on screen. Works on the scenery's own material copies (materials are shared with the
// items), after vertex colours and textures are applied, and keeps any existing shader patch (grime).

const GLSL = `
{
  float fadeL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  // darker and more contrast than plain greyscale: whites become a soft mid grey
  float fadeG = pow(fadeL, 1.5) * 0.46 + 0.03;
  diffuseColor.rgb = vec3(fadeG);
}
`;

const copies = new Map();

function fadeMaterial(m) {
  let c = copies.get(m);
  if (c) return c;
  c = m.clone();
  // clone() resets custom defines on built-in materials; the grime shader needs GRIME_CAT
  c.defines = { ...(m.defines || {}) };
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey?.bind(m);
  c.onBeforeCompile = (sh, renderer) => {
    if (prev) prev(sh, renderer);
    sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n" + GLSL);
  };
  c.customProgramCacheKey = () => (prevKey ? prevKey() : "") + "|bw";
  copies.set(m, c);
  return c;
}

export function fadeObject(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.material = Array.isArray(o.material) ? o.material.map(fadeMaterial) : fadeMaterial(o.material);
  });
}
