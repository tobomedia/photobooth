// Camera access and Photo capture.

let currentStream = null;

// Starts the front ('user') or back ('environment') camera.
export async function startCamera(video, facing = 'user') {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('this browser has no camera access (the page must be opened over https)');
  }
  stopCamera(video);
  const stream = await openStream(facing);
  currentStream = stream;
  video.srcObject = stream;
  await video.play();
  return facing;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZE = { width: { ideal: 1920 }, height: { ideal: 1440 } };

async function openStream(facing) {
  // Front: a preference, so laptops and webcams with no "facing" still work.
  // Back: must really be the back camera, so a failure is reported rather than hidden.
  // Android can refuse to open a camera for a moment after the other one is stopped
  // ("Could not start video source"), so retry with growing pauses.
  const want = facing === 'user' ? 'user' : { exact: 'environment' };
  const attempts = [
    { wait: 0, video: { facingMode: want, ...SIZE } },
    { wait: 500, video: { facingMode: want, ...SIZE } },
    { wait: 1500, video: { facingMode: want } },
  ];
  let lastErr;
  for (const { wait, video } of attempts) {
    if (wait) await sleep(wait);
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video });
    } catch (err) {
      console.warn('Camera attempt failed', video, err);
      lastErr = err;
      if (err.name === 'NotAllowedError' || err.name === 'OverconstrainedError') break; // retrying won't help
    }
  }
  throw lastErr;
}

export function stopCamera(video) {
  currentStream?.getTracks().forEach((t) => t.stop());
  currentStream = null;
  video.srcObject = null;
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
