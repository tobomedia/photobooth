// Props: speech bubbles, glasses, crowns and so on, in fixed places over the camera.
// Guests line themselves up with them. The same drawing is used for the live preview
// and for the saved Photos, so what guests see is what they get.
//
// Positions and sizes are fractions of the Photo's width/height, so props land in
// the same place at any size. When face tracking is on, `faces` (from faces.js) puts
// glasses, crowns and speech bubbles on the people instead; with no faces found they
// fall back to the fixed places. Everything is drawn in code or with emoji: no image
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
// `phrases` are the speech bubble lines; `font` is a CSS font family for them;
// `faces` are tracked faces, or null to use the fixed places.
export function drawProps(ctx, width, height, settings, shot = 0) {
  const { phrases = DEFAULT_PHRASES, font = 'sans-serif' } = settings;
  const faces = settings.faces?.length ? settings.faces.map((f) => geometry(f, width, height)) : null;
  const prop = propForShot(settings, shot);
  if (!prop?.draw) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // the Photo may have been drawn mirrored; props never are
  const list = phrases.map((p) => p.trim()).filter(Boolean);
  prop.draw(ctx, width, height, { phrases: list.length ? list : DEFAULT_PHRASES, font, shot, faces });
  ctx.restore();
}

// A face in pixels: the point between the eyes, the eye distance `d` (the face's scale),
// its tilt, and `up`, a unit vector from chin to crown.
function geometry(f, w, h) {
  const [a, b] = f.eyes.map((p) => ({ x: p.x * w, y: p.y * h }));
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    d: Math.max(Math.hypot(b.x - a.x, b.y - a.y), w * 0.03),
    angle,
    up: { x: Math.sin(angle), y: -Math.cos(angle) },
    nose: { x: f.nose.x * w, y: f.nose.y * h },
    mouth: { x: f.mouth.x * w, y: f.mouth.y * h },
  };
}

// The point `dist` above the eyes, along the face's own up direction.
const above = (face, dist) => ({ x: face.x + face.up.x * dist, y: face.y + face.up.y * dist });

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
// a bold outline and a solid drop shadow. `place(rx, ry)` gives the centre and tail tip
// once the bubble's size is known; the bubble is kept inside the Photo.
function bubble(ctx, text, place, { font, w, h, maxWidth }) {
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
  const margin = w * 0.02;
  let { cx, cy, tipX, tipY } = place(rx, ry);
  cx = Math.min(Math.max(cx, rx + margin), w - rx - margin);
  cy = Math.min(Math.max(cy, ry + margin), h - ry - margin);

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

function drawBubbles(ctx, w, h, { phrases, font, shot, faces }) {
  const first = phrases[(shot * 2) % phrases.length];
  const second = phrases[(shot * 2 + 1) % phrases.length];
  if (faces) {
    // A bubble for each of the biggest three faces, above the head and to the outside.
    const people = faces.slice(0, 3);
    const maxWidth = w * (people.length > 1 ? 0.3 : 0.38);
    people.forEach((face, i) => {
      const text = phrases[(shot * 2 + i) % phrases.length];
      const side = face.x < w / 2 ? -1 : 1;
      const head = above(face, face.d * 1.7);
      bubble(ctx, text, (rx, ry) => {
        const gap = face.d * 0.5;
        if (head.y - gap - ry * 2 > w * 0.02) {
          return { cx: head.x + side * face.d * 0.7, cy: head.y - gap - ry, tipX: head.x + side * face.d * 0.2, tipY: head.y - face.d * 0.1 };
        }
        // No room above: beside the head instead.
        return { cx: face.x + side * (face.d * 1.4 + rx), cy: face.y - face.d * 0.6, tipX: face.x + side * face.d * 1.1, tipY: face.y - face.d * 0.2 };
      }, { font, w, h, maxWidth });
    });
    return;
  }
  const maxWidth = w * 0.34;
  const at = (cx, cy, tipX, tipY) => () => ({ cx, cy, tipX, tipY });
  bubble(ctx, first, at(w * 0.29, h * 0.11, w * 0.36, h * 0.25), { font, w, h, maxWidth });
  if (second !== first) bubble(ctx, second, at(w * 0.71, h * 0.25, w * 0.62, h * 0.37), { font, w, h, maxWidth });
}

function moustache(ctx, cx, cy, width, angle = 0) {
  const s = width / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
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

function drawDisguise(ctx, w, h, { faces }) {
  if (faces) {
    for (const face of faces) {
      emoji(ctx, '🕶️', face.x, face.y + face.d * 0.05, face.d * 2.3, face.angle);
      // Between the nose and the mouth, a little nearer the mouth.
      const x = face.nose.x * 0.45 + face.mouth.x * 0.55;
      const y = face.nose.y * 0.45 + face.mouth.y * 0.55;
      moustache(ctx, x, y, face.d * 1.25, face.angle);
    }
    return;
  }
  emoji(ctx, '🕶️', w * 0.5, h * 0.4, w * 0.4);
  moustache(ctx, w * 0.5, h * 0.55, w * 0.26);
}

function drawCrown(ctx, w, h, { faces }) {
  if (faces) {
    for (const face of faces) {
      const size = face.d * 2.2;
      const crown = above(face, face.d * 1.5 + size * 0.4); // sits on top of the head
      emoji(ctx, '👑', crown.x, Math.max(crown.y, size * 0.4), size, face.angle); // never off the top
    }
    emoji(ctx, '✨', w * 0.12, h * 0.08, w * 0.09);
    emoji(ctx, '✨', w * 0.88, h * 0.12, w * 0.07);
    return;
  }
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
