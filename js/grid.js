// Compose four Photos into one 2×2 Grid image, with an optional caption band underneath.

import { drawBackground } from './backgrounds.js';

const SYSTEM = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Fonts for the caption. Files live in /fonts so they work offline. `scale` evens out
// how big each font looks at the same pixel size.
export const FONTS = [
  { id: 'system', name: 'Clean', family: SYSTEM, weight: 700, scale: 1 },
  { id: 'pacifico', name: 'Pacifico', family: 'Pacifico', file: 'fonts/pacifico.woff2', weight: 400, scale: 1 },
  { id: 'dancing', name: 'Dancing', family: 'Dancing Script', file: 'fonts/dancingscript.woff2', weight: 700, scale: 1.15 },
  { id: 'caveat', name: 'Caveat', family: 'Caveat', file: 'fonts/caveat.woff2', weight: 700, scale: 1.25 },
  { id: 'playfair', name: 'Playfair', family: 'Playfair Display', file: 'fonts/playfairdisplay.woff2', weight: 700, scale: 1 },
  { id: 'bebas', name: 'Bebas Neue', family: 'Bebas Neue', file: 'fonts/bebasneue.woff2', weight: 400, scale: 1.3 },
];

export const fontById = (id) => FONTS.find((f) => f.id === id) ?? FONTS[0];

// Canvas text silently falls back to another font if the chosen one hasn't loaded,
// so this must finish before a Grid is drawn.
let fontsReady;
export function loadFonts() {
  fontsReady ??= Promise.all(
    FONTS.filter((f) => f.file).map(async (f) => {
      try {
        const face = new FontFace(f.family, `url(${f.file})`, { weight: String(f.weight) });
        document.fonts.add(await face.load());
      } catch (err) {
        console.warn(`Font ${f.name} unavailable`, err);
      }
    }),
  );
  return fontsReady;
}

// Black or white, whichever reads better on the given #rrggbb background.
export function textColourFor(background) {
  const n = parseInt(background.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff';
}

function captionLines({ caption = '', showDate = false, font }, date) {
  const f = fontById(font);
  const lines = [];
  if (caption.trim()) lines.push({ text: caption.trim(), size: 0.11 * f.scale, font: `${f.weight} SIZEpx ${f.file ? `"${f.family}"` : f.family}` });
  if (showDate) {
    const text = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    // The date stays in a plain font: script fonts get hard to read that small.
    lines.push({ text, size: 0.06, font: `400 SIZEpx ${SYSTEM}` });
  }
  return lines;
}

// Sizes are relative to the Photo width so the same style works at any scale.
function bandHeight(lines, pw) {
  if (!lines.length) return 0;
  return Math.round(pw * (0.12 + lines.reduce((h, l) => h + l.size * 1.3, 0)));
}

export function composeGrid(photos, { gap, border, background, pattern, caption, showDate, font }, date = new Date()) {
  if (photos.length !== 4) throw new Error(`a Grid needs 4 Photos, got ${photos.length}`);
  const pw = photos[0].width;
  const ph = photos[0].height;
  const lines = captionLines({ caption, showDate, font }, date);
  const band = bandHeight(lines, pw);
  const width = border * 2 + pw * 2 + gap;
  const height = border * 2 + ph * 2 + gap + band;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Work out where the caption goes first, so busy backgrounds can keep clear of it.
  const maxWidth = width - border * 2;
  const top = border + ph * 2 + gap;
  const textHeight = lines.reduce((h, l) => h + l.size * 1.3 * pw, 0);
  let avoid = null;
  if (lines.length) {
    const textWidth = Math.min(maxWidth, Math.max(...lines.map((l) => {
      ctx.font = l.font.replace('SIZE', l.size * pw);
      return ctx.measureText(l.text).width;
    })));
    const pad = pw * 0.05;
    avoid = { x: (width - textWidth) / 2 - pad, y: top + (band - textHeight) / 2 - pad, w: textWidth + pad * 2, h: textHeight + pad * 2 };
  }
  drawBackground(ctx, width, height, { background, pattern }, pw / 900, avoid);

  photos.forEach((photo, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    ctx.drawImage(photo, border + col * (pw + gap), border + row * (ph + gap));
  });

  if (lines.length) {
    ctx.fillStyle = textColourFor(background);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let y = top + (band - textHeight) / 2;
    for (const line of lines) {
      const px = line.size * pw;
      y += (px * 1.3) / 2;
      ctx.font = line.font.replace('SIZE', px);
      ctx.fillText(line.text, width / 2, y, maxWidth); // squeezes long captions to fit
      y += (px * 1.3) / 2;
    }
  }
  return canvas;
}

// A small Grid with grey stand-in Photos, so the Host can see the style before a Turn.
export function previewGrid(style, { photoWidth = 90, photoHeight = 120 } = {}) {
  const photos = Array.from({ length: 4 }, (_, i) => {
    const c = document.createElement('canvas');
    c.width = photoWidth;
    c.height = photoHeight;
    const ctx = c.getContext('2d');
    ctx.fillStyle = ['#8a8a8a', '#9c9c9c', '#a8a8a8', '#959595'][i];
    ctx.fillRect(0, 0, photoWidth, photoHeight);
    return c;
  });
  const scale = photoWidth / 900;
  return composeGrid(photos, { ...style, gap: Math.round(style.gap * scale), border: Math.round(style.border * scale) });
}

export function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('could not encode the Grid'))),
      'image/jpeg',
      quality,
    );
  });
}
