// Background patterns for the Grid, drawn on top of the chosen colour.
// Everything is drawn in code (no image files), so it works offline and at any size.
// `unit` is 1 for a full-size Grid and smaller for previews, so patterns scale with it.

export const PATTERNS = [
  { id: 'plain', name: 'Plain' },
  { id: 'gradient', name: 'Gradient' },
  { id: 'dots', name: 'Dots' },
  { id: 'stripes', name: 'Stripes' },
  { id: 'hearts', name: 'Hearts' },
  { id: 'confetti', name: 'Confetti' },
];

const CONFETTI = ['#ff4f6d', '#ffd23f', '#3a86ff', '#2a9d8f', '#c8b6ff', '#ff9f1c'];

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
}

// A see-through shade that shows up on the background without fighting the Photos.
const overlay = (bg) => (isLight(bg) ? 'rgba(0, 0, 0, 0.09)' : 'rgba(255, 255, 255, 0.15)');

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

// Same random sequence every time, so the preview matches the real Grid.
function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.65, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.65, x + s * 0.5, y + s * 0.35);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.35);
  ctx.fill();
}

// `avoid` is a rectangle (the caption) that busy patterns leave clear so the text stays readable.
export function drawBackground(ctx, width, height, { background, pattern = 'plain' }, unit = 1, avoid = null) {
  ctx.save();
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const shade = overlay(background);

  if (pattern === 'gradient') {
    const [h, s, l] = hexToHsl(background);
    const end = `hsl(${(h + 40) % 360} ${Math.min(100, s + 10)}% ${isLight(background) ? l - 14 : l + 14}%)`;
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, background);
    g.addColorStop(1, end);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  } else if (pattern === 'dots') {
    const step = 70 * unit;
    ctx.fillStyle = shade;
    for (let row = 0, y = step / 2; y < height + step; row++, y += step) {
      for (let x = row % 2 ? step : step / 2; x < width + step; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 14 * unit, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === 'stripes') {
    const step = 80 * unit;
    ctx.strokeStyle = shade;
    ctx.lineWidth = 32 * unit;
    ctx.beginPath();
    for (let x = -height; x < width + height; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
    }
    ctx.stroke();
  } else if (pattern === 'hearts') {
    const step = 110 * unit;
    ctx.fillStyle = shade;
    for (let row = 0, y = step * 0.3; y < height + step; row++, y += step) {
      for (let x = row % 2 ? step : step / 2; x < width + step; x += step) heart(ctx, x, y, 44 * unit);
    }
  } else if (pattern === 'confetti') {
    const rand = seeded(7);
    const count = Math.round((width * height) / (75 * unit) ** 2);
    for (let i = 0; i < count; i++) {
      const x = rand() * width;
      const y = rand() * height;
      const size = (16 + rand() * 20) * unit;
      const colour = CONFETTI[Math.floor(rand() * CONFETTI.length)];
      const round = rand() < 0.35;
      const angle = rand() * Math.PI;
      if (avoid && x > avoid.x - size && x < avoid.x + avoid.w + size && y > avoid.y - size && y < avoid.y + avoid.h + size) continue;
      ctx.fillStyle = colour;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      if (round) {
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-size / 2, -size / 4, size, size / 2);
      }
      ctx.restore();
    }
  }
  ctx.restore();
}
