// Photo filters: black & white, vintage, film and so on. Applied to each Photo before the
// props are drawn, so props stay in colour.
//
// Colour changes are one 4×5 colour matrix per filter. The live camera view uses the same
// matrix in an SVG filter, and the saved Photo applies it pixel by pixel (canvas `filter`
// doesn't work on older iPhones), so what guests see is what they get. Vignette and grain
// are drawn on top: a gradient and a noise layer over the camera, painted into the Photo.

// ---- Building colour matrices (rows r, g, b; columns r, g, b, offset in 0–1) ----

const IDENTITY = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
];

const lerp = (a, b, t) => a.map((row, i) => row.map((v, j) => v + (b[i][j] - v) * t));

// The same maths as the CSS filter functions of the same names.
const grayscale = (t = 1) => lerp(IDENTITY, [[0.2126, 0.7152, 0.0722, 0], [0.2126, 0.7152, 0.0722, 0], [0.2126, 0.7152, 0.0722, 0]], t);
const sepia = (t = 1) => lerp(IDENTITY, [[0.393, 0.769, 0.189, 0], [0.349, 0.686, 0.168, 0], [0.272, 0.534, 0.131, 0]], t);
const saturate = (s) => [
  [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0],
  [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0],
  [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0],
];
const contrast = (c) => IDENTITY.map((row, i) => row.map((v, j) => (j === 3 ? 0.5 - 0.5 * c : v * c)));
const brightness = (b) => IDENTITY.map((row) => row.map((v, j) => (j === 3 ? 0 : v * b)));
const tint = (r, g, b) => [[r, 0, 0, 0], [0, g, 0, 0], [0, 0, b, 0]];
// Lifts the blacks towards `f`, like faded film or a soft pastel print.
const fade = (f) => IDENTITY.map((row, i) => row.map((v, j) => (j === 3 ? f : v * (1 - f))));

// Applies the matrices left to right: chain(a, b) is "a, then b".
function chain(...ms) {
  return ms.reduce((acc, m) =>
    m.map((row) => [0, 1, 2, 3].map((j) => row[0] * acc[0][j] + row[1] * acc[1][j] + row[2] * acc[2][j] + (j === 3 ? row[3] : 0))),
  );
}

// `vignette`: how dark the corners get (0–1). `grain`: noise strength. `posterize`: colour levels per channel.
export const FILTERS = [
  { id: 'none', name: 'Original', icon: '📷' },
  { id: 'bw', name: 'Black & white', icon: '⚫', matrix: chain(grayscale(), contrast(1.1)) },
  { id: 'noir', name: 'Noir', icon: '🕵️', matrix: chain(grayscale(), contrast(1.5), brightness(0.92)), vignette: 0.65 },
  { id: 'vintage', name: 'Vintage', icon: '📜', matrix: chain(sepia(0.85), contrast(0.95), brightness(1.03)), vignette: 0.4 },
  { id: 'film', name: 'Film', icon: '🎞️', matrix: chain(saturate(0.8), tint(1.05, 1, 0.92), fade(0.08)), grain: 0.07, vignette: 0.2 },
  { id: 'warm', name: 'Warm', icon: '🌅', matrix: chain(tint(1.08, 1.0, 0.84), saturate(1.1)) },
  { id: 'cool', name: 'Cool', icon: '🧊', matrix: chain(tint(0.9, 1.0, 1.12), saturate(0.95)) },
  { id: 'vivid', name: 'Vivid', icon: '🌈', matrix: chain(saturate(1.55), contrast(1.15)) },
  { id: 'pastel', name: 'Pastel', icon: '🍬', matrix: chain(saturate(0.65), contrast(0.85), fade(0.12), tint(1.02, 0.99, 1.04)) },
  { id: 'popart', name: 'Pop art', icon: '💥', matrix: chain(saturate(2.2), contrast(1.35)), posterize: 4 },
];

export const filterById = (id) => FILTERS.find((f) => f.id === id) ?? FILTERS[0];

// ---- The saved Photo ----

export function applyFilter(canvas, id) {
  const f = filterById(id);
  if (!f.matrix && !f.vignette && !f.grain) return;
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // the Photo may have been drawn mirrored

  if (f.matrix || f.posterize || f.grain) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const [[a0, a1, a2, a3], [b0, b1, b2, b3], [c0, c1, c2, c3]] = f.matrix ?? IDENTITY;
    const levels = f.posterize;
    const grain = (f.grain ?? 0) * 255;
    const post = (v) => {
      if (!levels) return v;
      const k = Math.min(levels - 1, Math.floor((Math.max(0, Math.min(255, v)) / 256) * levels));
      return (k / (levels - 1)) * 255;
    };
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const n = grain ? (Math.random() - 0.5) * 2 * grain : 0;
      d[i] = post(a0 * r + a1 * g + a2 * b + a3 * 255) + n; // the array clamps to 0–255
      d[i + 1] = post(b0 * r + b1 * g + b2 * b + b3 * 255) + n;
      d[i + 2] = post(c0 * r + c1 * g + c2 * b + c3 * 255) + n;
    }
    ctx.putImageData(img, 0, 0);
  }

  if (f.vignette) {
    const radius = Math.hypot(w, h) / 2;
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, radius);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(VIGNETTE_START, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${f.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

const VIGNETTE_START = 0.45; // fraction of the centre-to-corner distance left clear

// ---- The live camera view ----

const SVG_NS = 'http://www.w3.org/2000/svg';
let svgFilter = null;

// Builds the hidden SVG filter, and the vignette and grain layers that sit over the camera.
export function setupFilterPreview(stage, video) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  svgFilter = document.createElementNS(SVG_NS, 'filter');
  svgFilter.id = 'photo-filter';
  // Match the canvas maths, which works on the stored (sRGB) values.
  svgFilter.setAttribute('color-interpolation-filters', 'sRGB');
  svg.appendChild(svgFilter);
  document.body.appendChild(svg);

  const vignette = document.createElement('div');
  vignette.id = 'filter-vignette';
  const grain = document.createElement('canvas');
  grain.id = 'filter-grain';
  grain.width = grain.height = 256;
  const gctx = grain.getContext('2d');
  const noise = gctx.createImageData(256, 256);
  for (let i = 0; i < noise.data.length; i += 4) {
    const v = Math.random() * 255;
    noise.data[i] = noise.data[i + 1] = noise.data[i + 2] = v;
    noise.data[i + 3] = 255;
  }
  gctx.putImageData(noise, 0, 0);
  video.after(vignette, grain);
  return { video, vignette, grain };
}

export function showFilterPreview({ video, vignette, grain }, id) {
  const f = filterById(id);
  const parts = [];
  if (f.matrix) {
    const m = document.createElementNS(SVG_NS, 'feColorMatrix');
    m.setAttribute('type', 'matrix');
    m.setAttribute('values', [...f.matrix.map((r) => [r[0], r[1], r[2], 0, r[3]]), [0, 0, 0, 1, 0]].flat().map((v) => +v.toFixed(5)).join(' '));
    parts.push(m);
  }
  if (f.posterize) {
    const t = document.createElementNS(SVG_NS, 'feComponentTransfer');
    const table = Array.from({ length: f.posterize }, (_, k) => +(k / (f.posterize - 1)).toFixed(4)).join(' ');
    for (const c of ['R', 'G', 'B']) {
      const fn = document.createElementNS(SVG_NS, `feFunc${c}`);
      fn.setAttribute('type', 'discrete');
      fn.setAttribute('tableValues', table);
      t.appendChild(fn);
    }
    parts.push(t);
  }
  svgFilter?.replaceChildren(...parts);
  video.style.filter = parts.length ? 'url(#photo-filter)' : '';
  vignette.style.background = f.vignette
    ? `radial-gradient(circle farthest-corner at center, transparent ${VIGNETTE_START * 100}%, rgba(0,0,0,${f.vignette}) 100%)`
    : '';
  grain.hidden = !f.grain;
  grain.style.opacity = f.grain ? Math.min(1, f.grain * 4) : 0;
}
