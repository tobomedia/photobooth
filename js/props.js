// Props: speech bubbles, glasses, crowns and so on, in fixed places over the camera.
// Guests line themselves up with them. The same drawing is used for the live preview
// and for the saved Photos, so what guests see is what they get.
//
// Positions and sizes are fractions of the Photo's width/height, so props land in
// the same place at any size. Everything is drawn in code or with emoji: no image
// files, so it works offline.

export const DEFAULT_PHRASES = ['Party time!', 'Cheers!', 'Say cheese!', 'Best night ever!'];

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export const PROP_SETS = [
  { id: 'none', name: 'None', icon: '🚫' },
  { id: 'bubbles', name: 'Speech bubbles', icon: '💬', draw: drawBubbles },
  { id: 'disguise', name: 'Glasses', icon: '🤓', draw: drawDisguise },
  { id: 'crown', name: 'Crown', icon: '👑', draw: drawCrown },
  { id: 'party', name: 'Party', icon: '🎉', draw: drawParty },
  { id: 'love', name: 'Hearts', icon: '😍', draw: drawLove },
  { id: 'mix', name: 'Mix', icon: '🔀' },
];

const MIX = ['bubbles', 'disguise', 'party', 'crown'];

// The set used for a given Photo of a Turn (0–3). "Mix" changes it on every Photo.
export function setForShot(setId, shot) {
  return setId === 'mix' ? MIX[shot % MIX.length] : setId;
}

// Draws the props for one Photo onto ctx, covering a width×height area.
// `phrases` are the speech bubble lines; `font` is a CSS font family for them.
export function drawProps(ctx, width, height, { set = 'none', phrases = DEFAULT_PHRASES, font = 'sans-serif' }, shot = 0) {
  const prop = PROP_SETS.find((p) => p.id === setForShot(set, shot));
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

// A white speech bubble with a tail pointing down towards `tailX` (a fraction of the bubble's width).
function bubble(ctx, text, cx, cy, maxW, { font, tailX = 0.5, w }) {
  let size = w * 0.07;
  ctx.font = `700 ${size}px ${font}`;
  const textW = ctx.measureText(text).width;
  if (textW > maxW - size) {
    size *= (maxW - size) / textW; // shrink long phrases to fit
    ctx.font = `700 ${size}px ${font}`;
  }
  const bw = Math.min(maxW, ctx.measureText(text).width + size * 1.4);
  const bh = size * 2;
  const x = cx - bw / 2;
  const y = cy - bh / 2;
  const r = bh / 2;
  const line = Math.max(2, w * 0.006);
  const tx = x + bw * tailX;

  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, r);
  ctx.moveTo(tx - bh * 0.25, y + bh - line);
  ctx.lineTo(tx + (tailX < 0.5 ? -1 : 1) * bh * 0.15, y + bh + bh * 0.55);
  ctx.lineTo(tx + bh * 0.25, y + bh - line);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = line;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill(); // over the stroke's inner half, which also hides the join between bubble and tail

  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + size * 0.05);
}

function drawBubbles(ctx, w, h, { phrases, font, shot }) {
  const first = phrases[(shot * 2) % phrases.length];
  const second = phrases[(shot * 2 + 1) % phrases.length];
  bubble(ctx, first, w * 0.29, h * 0.1, w * 0.5, { font, tailX: 0.7, w });
  if (second !== first) bubble(ctx, second, w * 0.71, h * 0.2, w * 0.5, { font, tailX: 0.3, w });
}

function moustache(ctx, cx, cy, width) {
  const s = width / 2;
  ctx.save();
  ctx.translate(cx, cy);
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
