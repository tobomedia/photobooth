// Props: speech bubbles, glasses, crowns and so on, in fixed places over the camera.
// Guests line themselves up with them. The same drawing is used for the live preview
// and for the saved Photos, so what guests see is what they get.
//
// Positions and sizes are fractions of the Photo's width/height, so props land in
// the same place at any size. Everything is drawn in code or with emoji: no image
// files, so it works offline.

export const DEFAULT_PHRASES = ['Party time!', 'Cheers!', 'Say cheese!', 'Best night ever!'];

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// `cue` is announced before the Photo so guests know what to line up with.
export const PROP_SETS = [
  { id: 'none', name: 'None', icon: '🚫' },
  { id: 'bubbles', name: 'Speech bubbles', icon: '💬', cue: 'Say something!', draw: drawBubbles },
  { id: 'disguise', name: 'Glasses', icon: '🤓', cue: 'Glasses on!', draw: drawDisguise },
  { id: 'crown', name: 'Crown', icon: '👑', cue: 'Crown time!', draw: drawCrown },
  { id: 'party', name: 'Party', icon: '🎉', cue: 'Party pose!', draw: drawParty },
  { id: 'love', name: 'Hearts', icon: '😍', cue: 'Show the love!', draw: drawLove },
  { id: 'mix', name: 'Mix', icon: '🔀' },
];

const MIX_POOL = ['bubbles', 'disguise', 'crown', 'party', 'love'];

// A random order of different sets for one Turn's four Photos, so every group gets a surprise.
export function shuffleMix() {
  const pool = [...MIX_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

// The prop set used for a given Photo of a Turn (0–3). "Mix" changes it on every Photo.
export function propForShot({ set = 'none', mixOrder = MIX_POOL }, shot) {
  const id = set === 'mix' ? mixOrder[shot % mixOrder.length] : set;
  return PROP_SETS.find((p) => p.id === id);
}

// Draws the props for one Photo onto ctx, covering a width×height area.
// `phrases` are the speech bubble lines; `font` is a CSS font family for them.
export function drawProps(ctx, width, height, settings, shot = 0) {
  const { phrases = DEFAULT_PHRASES, font = 'sans-serif' } = settings;
  const prop = propForShot(settings, shot);
  if (!prop?.draw) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // the Photo may have been drawn mirrored; props never are
  const list = phrases.map((p) => p.trim()).filter(Boolean);
  prop.draw(ctx, width, height, { phrases: list.length ? list : DEFAULT_PHRASES, font, shot });
  ctx.restore();
}

function emoji(ctx, char, x, y, size, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, 0, 0);
  ctx.restore();
}

// Splits a phrase over two lines if it's too wide for one.
function wrap(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(' ');
  if (words.length < 2) return [text];
  let best = [text];
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest < bestWidth) [best, bestWidth] = [lines, widest];
  }
  return best;
}

// A comic-style speech bubble: a white oval with a curved tail pointing at (tipX, tipY),
// a bold outline and a solid drop shadow.
function bubble(ctx, text, cx, cy, { font, w, maxWidth, tipX, tipY }) {
  let size = w * 0.06;
  const setFont = () => (ctx.font = `700 ${size}px ${font}`);
  setFont();
  let lines = wrap(ctx, text, maxWidth);
  let widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (widest > maxWidth) {
    size *= maxWidth / widest; // still too long: shrink to fit
    setFont();
    widest = maxWidth;
  }
  const lineHeight = size * 1.15;
  const textHeight = lines.length * lineHeight;
  const rx = (widest / 2) * 1.22 + size * 0.7;
  const ry = (textHeight / 2) * 1.45 + size * 0.6;

  // Tail: leaves the oval on the side facing the tip, curving slightly.
  const angle = Math.atan2((tipY - cy) / ry, (tipX - cx) / rx);
  const spread = 0.28;
  const edge = (a) => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  const [ax, ay] = edge(angle - spread);
  const [bx, by] = edge(angle + spread);
  const bend = (tipX < cx ? -1 : 1) * rx * 0.15;
  const tail = (dx = 0, dy = 0) => {
    ctx.moveTo(ax + dx, ay + dy);
    ctx.quadraticCurveTo((ax + tipX) / 2 + bend + dx, (ay + tipY) / 2 + dy, tipX + dx, tipY + dy);
    ctx.quadraticCurveTo((bx + tipX) / 2 + bend * 0.4 + dx, (by + tipY) / 2 + dy, bx + dx, by + dy);
    ctx.closePath();
  };
  const oval = (dx = 0, dy = 0) => {
    ctx.moveTo(cx + rx + dx, cy + dy);
    ctx.ellipse(cx + dx, cy + dy, rx, ry, 0, 0, Math.PI * 2);
  };

  const line = w * 0.007;
  const shadow = w * 0.009;
  ctx.lineJoin = 'round';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.beginPath();
  oval(shadow, shadow);
  tail(shadow, shadow);
  ctx.fill('nonzero');

  // Outline both shapes, then fill both: the fill covers the outline where they overlap,
  // so the tail joins the oval without a seam.
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = line * 2;
  ctx.beginPath();
  oval();
  tail();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  oval();
  ctx.fill();
  ctx.beginPath();
  tail();
  ctx.fill();

  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, cx, cy - textHeight / 2 + lineHeight * (i + 0.5) + size * 0.04));
}

function drawBubbles(ctx, w, h, { phrases, font, shot }) {
  const first = phrases[(shot * 2) % phrases.length];
  const second = phrases[(shot * 2 + 1) % phrases.length];
  const maxWidth = w * 0.34;
  bubble(ctx, first, w * 0.29, h * 0.11, { font, w, maxWidth, tipX: w * 0.36, tipY: h * 0.25 });
  if (second !== first) bubble(ctx, second, w * 0.71, h * 0.25, { font, w, maxWidth, tipX: w * 0.62, tipY: h * 0.37 });
}

function moustache(ctx, cx, cy, width) {
  const s = width / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, -1); // drawn as an arch; flipped so the tips curl upwards
  ctx.fillStyle = '#2b1a10';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.12);
  ctx.bezierCurveTo(s * 0.35, -s * 0.45, s * 0.8, -s * 0.3, s, s * 0.05);
  ctx.bezierCurveTo(s * 0.85, s * 0.05, s * 0.75, -s * 0.05, s * 0.6, s * 0.05);
  ctx.bezierCurveTo(s * 0.4, s * 0.25, s * 0.15, s * 0.15, 0, s * 0.05);
  ctx.bezierCurveTo(-s * 0.15, s * 0.15, -s * 0.4, s * 0.25, -s * 0.6, s * 0.05);
  ctx.bezierCurveTo(-s * 0.75, -s * 0.05, -s * 0.85, s * 0.05, -s, s * 0.05);
  ctx.bezierCurveTo(-s * 0.8, -s * 0.3, -s * 0.35, -s * 0.45, 0, -s * 0.12);
  ctx.fill();
  ctx.restore();
}

function drawDisguise(ctx, w, h) {
  emoji(ctx, '🕶️', w * 0.5, h * 0.4, w * 0.4);
  moustache(ctx, w * 0.5, h * 0.55, w * 0.26);
}

function drawCrown(ctx, w, h) {
  emoji(ctx, '👑', w * 0.5, h * 0.13, w * 0.32, -0.08);
  emoji(ctx, '✨', w * 0.22, h * 0.09, w * 0.1);
  emoji(ctx, '✨', w * 0.8, h * 0.17, w * 0.08);
}

function drawParty(ctx, w, h) {
  emoji(ctx, '🎉', w * 0.12, h * 0.09, w * 0.17, -0.3);
  emoji(ctx, '🎊', w * 0.88, h * 0.09, w * 0.15, 0.3);
  emoji(ctx, '🎈', w * 0.09, h * 0.83, w * 0.16, -0.15);
  emoji(ctx, '🥂', w * 0.9, h * 0.87, w * 0.15, 0.15);
  emoji(ctx, '🥳', w * 0.5, h * 0.08, w * 0.12);
}

function drawLove(ctx, w, h) {
  const hearts = [
    ['❤️', 0.1, 0.1, 0.12, -0.3], ['💖', 0.88, 0.08, 0.1, 0.25], ['💕', 0.08, 0.5, 0.09, -0.2],
    ['💗', 0.92, 0.45, 0.09, 0.2], ['💘', 0.12, 0.88, 0.12, -0.2], ['❤️', 0.88, 0.9, 0.11, 0.3],
  ];
  hearts.forEach(([c, x, y, s, a]) => emoji(ctx, c, w * x, h * y, w * s, a));
}
