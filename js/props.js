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
    slot: f.slot ?? 0,
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

// Speech bubbles are measured first, then placed (and pushed apart so they don't overlap),
// then drawn.
function measureBubble(ctx, text, { font, w, maxWidth }) {
  let size = w * 0.06;
  const setFont = () => (ctx.font = `700 ${size}px ${font}`);
  setFont();
  const lines = wrap(ctx, text, maxWidth);
  let widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (widest > maxWidth) {
    size *= maxWidth / widest; // still too long: shrink to fit
    setFont();
    widest = maxWidth;
  }
  const lineHeight = size * 1.15;
  const textHeight = lines.length * lineHeight;
  return {
    lines, size, font, lineHeight, textHeight,
    rx: (widest / 2) * 1.22 + size * 0.7,
    ry: (textHeight / 2) * 1.45 + size * 0.6,
  };
}

// Keeps a bubble's oval inside the Photo.
function clamp(b, w, h, margin) {
  b.cx = Math.min(Math.max(b.cx, b.rx + margin), w - b.rx - margin);
  b.cy = Math.min(Math.max(b.cy, b.ry + margin), h - b.ry - margin);
}

// Roughly where a head is (hair to chin), as an oval. Bubbles keep off heads, and tails
// stop at their edge.
function headOf(face) {
  const c = above(face, -face.d * 0.35);
  return { cx: c.x, cy: c.y, rx: face.d * 1.25, ry: face.d * 1.75 };
}

// How far two ovals overlap across and down, treated as boxes (not positive: they don't).
function overlap(a, b, pad) {
  return [a.rx + b.rx + pad - Math.abs(b.cx - a.cx), a.ry + b.ry + pad - Math.abs(b.cy - a.cy)];
}

// Moves bubbles until they overlap neither each other nor anyone's head, preferring
// upwards (away from faces) and then sideways, within the Photo.
function separate(bubbles, heads, w, h, margin) {
  const pad = w * 0.015;
  const roomAbove = (b) => b.cy - b.ry - margin;
  for (let round = 0; round < 16; round++) {
    let moved = false;
    for (let i = 0; i < bubbles.length; i++) {
      const a = bubbles[i];
      // Off heads: up if the bubble is above the head's middle and there's room, else sideways.
      for (const head of heads) {
        const [ox, oy] = overlap(a, head, pad);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const upBy = a.cy + a.ry + pad - (head.cy - head.ry);
        if (a.cy < head.cy && roomAbove(a) >= upBy) a.cy -= upBy;
        else a.cx += (a.cx < head.cx ? -1 : 1) * ox;
      }
      // Off each other: the higher one goes up if it can, else they move apart sideways.
      for (let j = i + 1; j < bubbles.length; j++) {
        const b = bubbles[j];
        const [ox, oy] = overlap(a, b, pad);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const upper = a.cy <= b.cy ? a : b;
        if (oy < ox && roomAbove(upper) >= oy) {
          upper.cy -= oy;
        } else {
          const sx = b.cx < a.cx ? -1 : 1;
          a.cx -= (sx * ox) / 2;
          b.cx += (sx * ox) / 2;
        }
      }
    }
    bubbles.forEach((b) => clamp(b, w, h, margin));
    if (!moved) break;
  }
}

// Where a bubble's tail ends: on the line from the bubble to the speaker's mouth, just
// outside their head, so it points at the mouth without covering the face.
function aimAt(b, face) {
  const { mouth, d } = face;
  const head = headOf(face);
  const vx = mouth.x - b.cx;
  const vy = mouth.y - b.cy;
  const dist = Math.hypot(vx, vy) || 1;
  const ux = vx / dist;
  const uy = vy / dist;
  const edge = 1 / Math.hypot(ux / b.rx, uy / b.ry); // bubble centre to its own outline
  // Where the line enters the head oval: solve |(p + t·u − c) / r| = 1 for the nearer t.
  const px = (b.cx - head.cx) / head.rx;
  const py = (b.cy - head.cy) / head.ry;
  const qx = ux / head.rx;
  const qy = uy / head.ry;
  const A = qx * qx + qy * qy;
  const B = 2 * (px * qx + py * qy);
  const C = px * px + py * py - 1;
  const disc = B * B - 4 * A * C;
  const entry = C > 0 && disc > 0 ? (-B - Math.sqrt(disc)) / (2 * A) : dist - d * 1.3;
  let reach = Math.max(entry - d * 0.1, edge + d * 0.45); // always show some tail
  reach = Math.min(reach, Math.max(dist - d * 0.4, edge + d * 0.15)); // never over the mouth
  return { tipX: b.cx + ux * reach, tipY: b.cy + uy * reach };
}

// A comic-style speech bubble: a white oval with a curved tail pointing at (tipX, tipY),
// a bold outline and a solid drop shadow.
function drawBubble(ctx, b, tipX, tipY, w) {
  const { cx, cy, rx, ry, lines, size, font, lineHeight, textHeight } = b;
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
  ctx.font = `700 ${size}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, cx, cy - textHeight / 2 + lineHeight * (i + 0.5) + size * 0.04));
}

function drawBubbles(ctx, w, h, { phrases, font, shot, faces }) {
  const margin = w * 0.02;
  if (faces) {
    // Up to three people get a bubble: the ones who've been in view longest (lowest slot),
    // so bubbles and phrases stay with the same people while they're there.
    const people = [...faces].sort((a, b) => a.slot - b.slot).slice(0, 3);
    const maxWidth = w * [0.38, 0.38, 0.32, 0.28][people.length];
    const heads = faces.map(headOf);
    const bubbles = people.map((face) => {
      const text = phrases[(shot * 2 + face.slot) % phrases.length];
      const b = measureBubble(ctx, text, { font, w, maxWidth });
      const head = headOf(face);
      const top = head.cy - head.ry;
      const gap = face.d * 0.7;
      if (top - gap - b.ry * 2 > margin) {
        // Above the head, a little to the outside of the picture.
        b.cx = head.cx + (face.x < w / 2 ? -1 : 1) * face.d * 0.9;
        b.cy = top - gap - b.ry;
      } else {
        // No room above: beside the head, on whichever side has more space.
        const side = face.x > w - face.x ? -1 : 1;
        b.cx = head.cx + side * (head.rx + gap + b.rx);
        b.cy = face.y - face.d * 0.5;
      }
      b.face = face;
      return b;
    });
    bubbles.forEach((b) => clamp(b, w, h, margin));
    separate(bubbles, heads, w, h, margin);
    for (const b of bubbles) {
      const { tipX, tipY } = aimAt(b, b.face);
      drawBubble(ctx, b, tipX, tipY, w);
    }
    return;
  }
  const first = phrases[(shot * 2) % phrases.length];
  const second = phrases[(shot * 2 + 1) % phrases.length];
  const maxWidth = w * 0.34;
  const fixed = (text, cx, cy, tipX, tipY) => {
    const b = { ...measureBubble(ctx, text, { font, w, maxWidth }), cx, cy };
    clamp(b, w, h, margin);
    drawBubble(ctx, b, tipX, tipY, w);
  };
  fixed(first, w * 0.29, h * 0.11, w * 0.36, h * 0.25);
  if (second !== first) fixed(second, w * 0.71, h * 0.25, w * 0.62, h * 0.37);
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
