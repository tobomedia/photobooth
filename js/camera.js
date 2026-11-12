// Camera access and Photo capture.

let currentStream = null;

// Starts the chosen camera (by deviceId), or the front camera if none is chosen.
// Resolves to { deviceId, facingMode } of the camera actually in use.
export async function startCamera(video, deviceId = null) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('this browser has no camera access (the page must be opened over https)');
  }
  stopCamera(video);
  const size = { width: { ideal: 1920 }, height: { ideal: 1440 } };
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: 'user', ...size },
  });
  currentStream = stream;
  video.srcObject = stream;
  await video.play();
  const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
  return { deviceId: settings.deviceId ?? null, facingMode: settings.facingMode ?? null };
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
