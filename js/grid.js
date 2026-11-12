// Compose four Photos into one 2×2 Grid image, with an optional caption band underneath.

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Black or white, whichever reads better on the given #rrggbb background.
export function textColourFor(background) {
  const n = parseInt(background.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff';
}

function captionLines({ caption = '', showDate = false }, date) {
  const lines = [];
  if (caption.trim()) lines.push({ text: caption.trim(), size: 0.11, weight: 700 });
  if (showDate) {
    const text = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    lines.push({ text, size: 0.06, weight: 400 });
  }
  return lines;
}

// Sizes are relative to the Photo width so the same style works at any scale.
function bandHeight(lines, pw) {
  if (!lines.length) return 0;
  return Math.round(pw * (0.12 + lines.reduce((h, l) => h + l.size * 1.3, 0)));
}

export function composeGrid(photos, { gap, border, background, caption, showDate }, date = new Date()) {
  if (photos.length !== 4) throw new Error(`a Grid needs 4 Photos, got ${photos.length}`);
  const pw = photos[0].width;
  const ph = photos[0].height;
  const lines = captionLines({ caption, showDate }, date);
  const band = bandHeight(lines, pw);
  const width = border * 2 + pw * 2 + gap;
  const height = border * 2 + ph * 2 + gap + band;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  photos.forEach((photo, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    ctx.drawImage(photo, border + col * (pw + gap), border + row * (ph + gap));
  });

  if (lines.length) {
    ctx.fillStyle = textColourFor(background);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxWidth = width - border * 2;
    const top = border + ph * 2 + gap;
    const textHeight = lines.reduce((h, l) => h + l.size * 1.3 * pw, 0);
    let y = top + (band - textHeight) / 2;
    for (const line of lines) {
      const px = line.size * pw;
      y += (px * 1.3) / 2;
      ctx.font = `${line.weight} ${px}px ${FONT}`;
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
