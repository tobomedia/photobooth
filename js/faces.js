// Face tracking: finds faces in the camera picture several times a second, so props can
// sit on them. Uses Google's MediaPipe face detector (in /vendor, so it works offline),
// loaded only when the Host turns "Props follow faces" on.
//
// Face positions are given as fractions of the Photo (the 3:4 centre crop of the camera,
// mirrored like the preview), so they line up with the overlay and the saved Photos.

const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;
const MIN_INTERVAL_MS = 70; // at most ~14 checks a second; slower devices check less often
const MAX_INTERVAL_MS = 400;
const MAX_FACES = 6;
const SMOOTH = 0.45; // how much of the old position to keep each check: less jitter, a little lag
const FORGET_MS = 500; // keep a lost face this long, so props don't flicker when a face is missed
const MATCH_DISTANCE = 0.15; // a face this close to one from the last check is the same person

let loading = null;
let detector = null;
let timer = null;
// Each face keeps a `slot` (0, 1, 2…) while it stays in view, so speech bubbles and their
// phrases stay with the same person.
let tracked = []; // [{ eyes: [{x,y},{x,y}], nose, mouth, top, size, slot, seen }]
let checkMs = null; // average time one check takes, for the Host panel

export async function loadDetector() {
  loading ??= (async () => {
    const { FaceDetector } = await import(`${BASE}vision_bundle.mjs`);
    const fileset = {
      wasmLoaderPath: `${BASE}wasm/vision_wasm_internal.js`,
      wasmBinaryPath: `${BASE}wasm/vision_wasm_internal.wasm`,
    };
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: `${BASE}blaze_face_short_range.tflite`, delegate },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5,
    });
    try {
      return await FaceDetector.createFromOptions(fileset, options('GPU'));
    } catch (err) {
      console.warn('Face tracking: no GPU, using the CPU', err);
      return await FaceDetector.createFromOptions(fileset, options('CPU'));
    }
  })();
  try {
    return await loading;
  } catch (err) {
    loading = null; // let a later try start again
    throw err;
  }
}

// Starts checking `video` for faces. `isMirrored()` says whether the preview is mirrored,
// `shouldRun()` lets the app pause checks while the camera is hidden, and `onUpdate()`
// is called after every check.
export async function startTracking(video, { isMirrored, shouldRun, onUpdate }) {
  stopTracking();
  detector = await loadDetector();
  let warm = false;
  const loop = () => {
    let wait = MIN_INTERVAL_MS;
    if (shouldRun() && !document.hidden && video.readyState >= 2 && video.videoWidth) {
      const started = performance.now();
      try {
        const result = detector.detectForVideo(video, started);
        update(result.detections, video, isMirrored());
      } catch (err) {
        console.warn('Face tracking check failed', err);
      }
      const took = performance.now() - started;
      // The first check warms the detector up and is much slower, so it doesn't count.
      if (warm) checkMs = checkMs == null ? took : checkMs * 0.8 + took * 0.2;
      warm = true;
      // Leave the device time for everything else on slow devices.
      wait = Math.min(Math.max(MIN_INTERVAL_MS, (checkMs ?? 0) * 3), MAX_INTERVAL_MS);
      onUpdate();
    } else if (tracked.length) {
      tracked = [];
      onUpdate();
    }
    timer = setTimeout(loop, wait);
  };
  loop();
}

export function stopTracking() {
  clearTimeout(timer);
  timer = null;
  tracked = [];
}

export const trackingActive = () => timer !== null;
export const averageCheckMs = () => checkMs;

// The faces right now, biggest first.
export const currentFaces = () => tracked.map(({ eyes, nose, mouth, top, size, slot }) => ({ eyes, nose, mouth, top, size, slot }));

function update(detections, video, mirrored) {
  const now = performance.now();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  // The same 3:4 centre crop as capturePhoto and the preview's object-fit: cover.
  let sw = vw;
  let sh = vh;
  if (vw / vh > 3 / 4) sw = vh * 0.75;
  else sh = vw / 0.75;
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;
  const point = (k) => {
    const x = (k.x * vw - sx) / sw;
    return { x: mirrored ? 1 - x : x, y: (k.y * vh - sy) / sh };
  };

  const found = [];
  for (const d of detections) {
    const k = d.keypoints;
    if (!k || k.length < 4 || !d.boundingBox) continue;
    // Keypoints: 0 and 1 are the eyes, 2 the nose tip, 3 the mouth.
    const eyes = [point(k[0]), point(k[1])].sort((a, b) => a.x - b.x);
    const nose = point(k[2]);
    if (nose.x < 0 || nose.x > 1 || nose.y < 0 || nose.y > 1) continue; // mostly out of the Photo
    found.push({
      eyes,
      nose,
      mouth: point(k[3]),
      top: (d.boundingBox.originY - sy) / sh,
      size: d.boundingBox.width / sw,
    });
  }
  found.sort((a, b) => b.size - a.size);
  found.length = Math.min(found.length, MAX_FACES);

  // Match each face to the nearest one from the last check and glide towards its new place.
  const old = [...tracked];
  const next = found.map((face) => {
    let best = -1;
    let bestDist = MATCH_DISTANCE;
    old.forEach((o, i) => {
      const dist = Math.hypot(o.nose.x - face.nose.x, o.nose.y - face.nose.y);
      if (dist < bestDist) [best, bestDist] = [i, dist];
    });
    if (best < 0) return { ...face, slot: null, seen: now };
    const [prev] = old.splice(best, 1);
    return { ...blend(prev, face), slot: prev.slot, seen: now };
  });
  // Faces missed this time stay put briefly.
  for (const o of old) if (now - o.seen < FORGET_MS) next.push(o);
  // New faces get the lowest slot nobody else is using.
  const used = new Set(next.map((f) => f.slot));
  for (const f of next) {
    if (f.slot !== null) continue;
    let slot = 0;
    while (used.has(slot)) slot++;
    f.slot = slot;
    used.add(slot);
  }
  tracked = next.sort((a, b) => b.size - a.size);
}

const mix = (a, b) => a * SMOOTH + b * (1 - SMOOTH);
const mixPoint = (a, b) => ({ x: mix(a.x, b.x), y: mix(a.y, b.y) });

function blend(prev, face) {
  return {
    eyes: [mixPoint(prev.eyes[0], face.eyes[0]), mixPoint(prev.eyes[1], face.eyes[1])],
    nose: mixPoint(prev.nose, face.nose),
    mouth: mixPoint(prev.mouth, face.mouth),
    top: mix(prev.top, face.top),
    size: mix(prev.size, face.size),
  };
}
