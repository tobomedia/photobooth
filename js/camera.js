// Camera access and Photo capture.

let currentStream = null;

// Starts the chosen camera (by deviceId), or the front camera if none is chosen.
// Resolves to { deviceId, facingMode } of the camera actually in use.
export async function startCamera(video, deviceId = null) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('this browser has no camera access (the page must be opened over https)');
  }
  stopCamera(video);
  const stream = await openStream(deviceId);
  currentStream = stream;
  video.srcObject = stream;
  await video.play();
  const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
  return { deviceId: settings.deviceId ?? null, facingMode: settings.facingMode ?? null };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZE = { width: { ideal: 1920 }, height: { ideal: 1440 } };

// Android often refuses to open a second camera for a moment after the first one is
// stopped ("Could not start video source"), and some cameras reject the size request.
// So try a few ways, with short pauses, before giving up.
async function openStream(deviceId) {
  if (!deviceId) return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', ...SIZE } });

  const label = (await listCameras().catch(() => [])).find((c) => c.deviceId === deviceId)?.label ?? '';
  const attempts = [
    { wait: 0, video: { deviceId: { exact: deviceId }, ...SIZE } },
    { wait: 400, video: { deviceId: { exact: deviceId }, ...SIZE } },
    { wait: 800, video: { deviceId: { exact: deviceId } } },
  ];
  // Android names cameras like "camera2 0, facing back": asking by direction sometimes works when the id doesn't.
  if (/back|rear|environment/i.test(label)) attempts.push({ wait: 400, video: { facingMode: { exact: 'environment' }, ...SIZE } });

  let lastErr;
  for (const { wait, video } of attempts) {
    if (wait) await sleep(wait);
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video });
    } catch (err) {
      console.warn('Camera attempt failed', video, err);
      lastErr = err;
      if (err.name === 'NotAllowedError') break; // permission refused: retrying won't help
    }
  }
  throw lastErr;
}

export function stopCamera(video) {
  currentStream?.getTracks().forEach((t) => t.stop());
  currentStream = null;
  video.srcObject = null;
}

// Every camera on the device. Names are only filled in once camera permission is granted.
export async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

// Grab the current video frame as one Photo: centre-cropped to the
// requested shape (3:4 portrait) and optionally mirrored.
export function capturePhoto(video, { width, height, mirror }) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error('camera is not ready');

  const target = width / height;
  let sw = vw;
  let sh = vh;
  if (vw / vh > target) sw = vh * target;
  else sh = vw / target;
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
  return canvas;
}
