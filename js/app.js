import { startCamera, listCameras, capturePhoto } from './camera.js';
import { composeGrid, previewGrid, canvasToBlob, FONTS, loadFonts } from './grid.js';
import { PATTERNS, drawBackground } from './backgrounds.js';
import * as store from './store.js';
import { canShareFiles, shareFiles, toFile, downloadFile, downloadZip } from './exporter.js';

// Tweak these after a test run.
const CONFIG = {
  photosPerTurn: 4,
  countdownSeconds: 3,
  pauseBetweenPhotosMs: 1500,
  hostHoldMs: 3000,
  photo: { width: 900, height: 1200 }, // 3:4 portrait
  grid: { gap: 30, border: 60, background: '#ffffff', jpegQuality: 0.9 },
  shareBatchSize: 30,
};

const PRINT_KEY = 'photobooth.printEnabled';
const BACKUP_KEY = 'photobooth.backupEnabled';
const CAMERA_KEY = 'photobooth.cameraId';
const STYLE_KEY = 'photobooth.gridStyle';

const $ = (id) => document.getElementById(id);
const els = {
  preview: $('preview'),
  countdown: $('countdown'),
  flash: $('flash'),
  result: $('result'),
  dots: [...document.querySelectorAll('#progress .dot')],
  start: $('start'),
  print: $('print'),
  done: $('done'),
  saveWarning: $('save-warning'),
  hotspot: $('host-hotspot'),
  host: $('host'),
  hostClose: $('host-close'),
  hostCount: $('host-count'),
  shareBatches: $('share-batches'),
  shareNote: $('share-note'),
  zip: $('zip'),
  printToggle: $('print-toggle'),
  backupToggle: $('backup-toggle'),
  cameraSelect: $('camera-select'),
  caption: $('caption'),
  dateToggle: $('date-toggle'),
  swatches: $('swatches'),
  fonts: $('fonts'),
  patterns: $('patterns'),
  colour: $('colour'),
  stylePreview: $('style-preview'),
  clear: $('clear'),
  message: $('message'),
  messageText: $('message-text'),
  messageRetry: $('message-retry'),
  printSheet: $('print-sheet'),
};

let state = 'idle'; // idle | turn | review
let reviewUrl = null;
let camera = { deviceId: null, facingMode: null }; // the camera in use

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setState(next) {
  state = next;
  document.body.dataset.state = next;
}

// ---------- Messages ----------

let messageTimer = null;
function showMessage(text, { retry = null, timeoutMs = 0 } = {}) {
  clearTimeout(messageTimer);
  els.messageText.textContent = text;
  els.messageRetry.hidden = !retry;
  els.messageRetry.onclick = retry;
  els.message.hidden = false;
  if (timeoutMs) messageTimer = setTimeout(hideMessage, timeoutMs);
}
function hideMessage() {
  els.message.hidden = true;
}

// ---------- Camera ----------

// Front cameras are mirrored, like a mirror; back cameras are not.
const mirrored = () => camera.facingMode !== 'environment';

function chosenCameraId() {
  try {
    return localStorage.getItem(CAMERA_KEY);
  } catch {
    return null;
  }
}

// `switching` is true when the Host has just picked a camera, so a failure is shown, not hidden.
async function initCamera({ switching = false } = {}) {
  els.start.disabled = true;
  try {
    const chosen = chosenCameraId();
    let fallbackNote = null;
    try {
      camera = await startCamera(els.preview, chosen);
    } catch (err) {
      if (!chosen || err.name === 'NotAllowedError') throw err;
      // The chosen camera wouldn't start (unplugged, busy, or the browser reset its ids): use the default one.
      console.warn('Chosen camera unavailable, using the default', err);
      fallbackNote = `Couldn't start that camera (${err.name}: ${err.message}), so the front camera is being used.`;
      camera = await startCamera(els.preview);
    }
    els.preview.classList.toggle('unmirrored', !mirrored());
    if (fallbackNote) showMessage(fallbackNote, { timeoutMs: switching ? 0 : 8000 });
    else hideMessage();
    els.start.disabled = false;
  } catch (err) {
    console.error(err);
    els.start.disabled = true;
    showMessage(`Camera unavailable: ${err.message}. Check camera permission for this site.`, { retry: initCamera });
  }
}

// ---------- Turn ----------

async function onStart() {
  if (state !== 'idle') return;
  goFullscreen();
  keepAwake();
  hideMessage();
  setState('turn');
  els.dots.forEach((d) => d.classList.remove('taken'));

  try {
    const photos = [];
    for (let i = 0; i < CONFIG.photosPerTurn; i++) {
      await countdown(CONFIG.countdownSeconds);
      photos.push(capturePhoto(els.preview, { ...CONFIG.photo, mirror: mirrored() }));
      flash();
      els.dots[i].classList.add('taken');
      if (i < CONFIG.photosPerTurn - 1) await sleep(CONFIG.pauseBetweenPhotosMs);
    }

    await loadFonts();
    const canvas = composeGrid(photos, gridStyle());
    const blob = await canvasToBlob(canvas, CONFIG.grid.jpegQuality);
    photos.forEach((p) => (p.width = 0)); // free canvas memory on small devices
    canvas.width = 0;

    // Every Grid is kept: save before showing it.
    const createdAt = Date.now();
    let saved = true;
    let id = 'unsaved';
    try {
      id = await store.addGrid(blob, createdAt);
    } catch (err) {
      console.error(err);
      saved = false;
    }
    const file = toFile({ data: blob, type: blob.type, createdAt, id });
    if (backupEnabled()) downloadFile(file); // second copy, outside the browser
    showReview(file, saved);
  } catch (err) {
    console.error(err);
    els.countdown.textContent = '';
    setState('idle');
    showMessage('Something went wrong — tap Start to try again.', { timeoutMs: 5000 });
  }
}

async function countdown(seconds) {
  for (let n = seconds; n > 0; n--) {
    els.countdown.textContent = n;
    await sleep(1000);
  }
  els.countdown.textContent = '';
}

function flash() {
  els.flash.classList.remove('on');
  void els.flash.offsetWidth; // restart the animation
  els.flash.classList.add('on');
}

// ---------- Review ----------

function showReview(file, saved) {
  reviewUrl = URL.createObjectURL(file);
  els.result.src = reviewUrl;
  els.result.hidden = false;
  els.saveWarning.hidden = saved;
  els.print.hidden = !printEnabled();
  setState('review'); // stays on this Grid until someone taps Done
}

function endReview() {
  if (state !== 'review') return;
  els.result.hidden = true;
  els.result.removeAttribute('src');
  els.printSheet.replaceChildren();
  if (reviewUrl) URL.revokeObjectURL(reviewUrl);
  reviewUrl = null;
  els.saveWarning.hidden = true;
  setState('idle');
}

// ---------- Backup ----------

// Off by default on iPhone/iPad, where every download asks first and lands in Files.
function backupEnabled() {
  try {
    const v = localStorage.getItem(BACKUP_KEY);
    if (v !== null) return v === 'true';
  } catch {
    /* fall through to the default */
  }
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return !ios;
}

// ---------- Grid style: caption and colour ----------

const SWATCHES = ['#ffffff', '#111111', '#ff4f6d', '#f7c8d0', '#ffd23f', '#3a86ff', '#2a9d8f', '#c8b6ff'];

// The Host's saved caption/colour on top of the defaults in CONFIG.
function gridStyle() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STYLE_KEY) || '{}');
  } catch {
    /* use the defaults */
  }
  return { caption: '', showDate: false, font: 'system', pattern: 'plain', ...CONFIG.grid, ...saved };
}

function saveGridStyle(changes) {
  const { caption, showDate, background, font, pattern } = { ...gridStyle(), ...changes };
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify({ caption, showDate, background, font, pattern }));
  } catch {
    showMessage('Could not save the Grid style on this device.', { timeoutMs: 4000 });
  }
  renderStyle();
}

function setupStyle() {
  els.swatches.replaceChildren(
    ...SWATCHES.map((colour) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = colour;
      b.dataset.colour = colour;
      b.setAttribute('aria-label', colour);
      b.addEventListener('click', () => saveGridStyle({ background: colour }));
      return b;
    }),
  );
  els.fonts.replaceChildren(
    ...FONTS.map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'font-choice';
      b.textContent = f.name;
      b.style.fontFamily = f.family;
      b.style.fontWeight = f.weight;
      b.dataset.font = f.id;
      b.addEventListener('click', () => saveGridStyle({ font: f.id }));
      return b;
    }),
  );
  els.patterns.replaceChildren(
    ...PATTERNS.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pattern-choice';
      b.dataset.pattern = p.id;
      b.setAttribute('aria-label', p.name);
      const thumb = document.createElement('canvas');
      thumb.width = 120;
      thumb.height = 72;
      const name = document.createElement('span');
      name.textContent = p.name;
      b.append(thumb, name);
      b.addEventListener('click', () => saveGridStyle({ pattern: p.id }));
      return b;
    }),
  );
  els.colour.addEventListener('input', () => saveGridStyle({ background: els.colour.value }));
  els.caption.addEventListener('input', () => saveGridStyle({ caption: els.caption.value }));
  els.dateToggle.addEventListener('change', () => saveGridStyle({ showDate: els.dateToggle.checked }));
}

function renderStyle() {
  const style = gridStyle();
  if (document.activeElement !== els.caption) els.caption.value = style.caption;
  els.dateToggle.checked = style.showDate;
  els.colour.value = style.background;
  els.swatches.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('selected', b.dataset.colour === style.background));
  els.patterns.querySelectorAll('.pattern-choice').forEach((b) => {
    b.classList.toggle('selected', b.dataset.pattern === style.pattern);
    const thumb = b.querySelector('canvas');
    drawBackground(thumb.getContext('2d'), thumb.width, thumb.height, { background: style.background, pattern: b.dataset.pattern }, 0.4);
  });
  els.fonts.querySelectorAll('.font-choice').forEach((b) => b.classList.toggle('selected', b.dataset.font === style.font));
  const canvas = previewGrid(style);
  const ctx = els.stylePreview.getContext('2d');
  els.stylePreview.width = canvas.width;
  els.stylePreview.height = canvas.height;
  ctx.drawImage(canvas, 0, 0);
}

// ---------- Printing ----------

function printEnabled() {
  try {
    return localStorage.getItem(PRINT_KEY) === 'true';
  } catch {
    return false;
  }
}

async function onPrint() {
  if (!reviewUrl) return;
  const imgs = Array.from({ length: 4 }, () => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const img = new Image();
    img.src = reviewUrl;
    cell.appendChild(img);
    return { cell, img };
  });
  els.printSheet.replaceChildren(...imgs.map((x) => x.cell));
  await Promise.all(imgs.map(({ img }) => img.decode().catch(() => {})));
  window.print();
}

// ---------- Host panel ----------

function setupHost() {
  let holdTimer = null;
  const cancelHold = () => {
    clearTimeout(holdTimer);
    els.hotspot.classList.remove('holding');
  };
  els.hotspot.addEventListener('pointerdown', () => {
    if (state === 'turn') return;
    cancelHold();
    els.hotspot.classList.add('holding');
    holdTimer = setTimeout(() => {
      cancelHold();
      openHost();
    }, CONFIG.hostHoldMs);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => els.hotspot.addEventListener(e, cancelHold));
  els.hotspot.addEventListener('contextmenu', (e) => e.preventDefault());

  els.hostClose.addEventListener('click', () => {
    els.host.hidden = true;
    disarmClear();
  });
  els.printToggle.addEventListener('change', () => {
    try {
      localStorage.setItem(PRINT_KEY, String(els.printToggle.checked));
    } catch {
      showMessage('Could not save the printing setting on this device.', { timeoutMs: 4000 });
    }
  });
  els.backupToggle.addEventListener('change', () => {
    try {
      localStorage.setItem(BACKUP_KEY, String(els.backupToggle.checked));
    } catch {
      showMessage('Could not save the backup setting on this device.', { timeoutMs: 4000 });
    }
  });
  els.cameraSelect.addEventListener('change', async () => {
    try {
      localStorage.setItem(CAMERA_KEY, els.cameraSelect.value);
    } catch {
      showMessage('Could not save the camera setting on this device.', { timeoutMs: 4000 });
    }
    els.cameraSelect.disabled = true;
    await initCamera({ switching: true });
    await renderCameras();
  });
  els.zip.addEventListener('click', onZip);
  els.clear.addEventListener('click', onClear);
}

let unexportedCount = 0;

async function openHost() {
  endReview();
  els.printToggle.checked = printEnabled();
  els.backupToggle.checked = backupEnabled();
  els.host.hidden = false;
  renderStyle();
  await Promise.all([renderHost(), renderCameras()]);
}

async function renderCameras() {
  els.cameraSelect.replaceChildren(new Option('Looking for cameras…', ''));
  els.cameraSelect.disabled = true;
  let cameras = [];
  try {
    cameras = await listCameras();
  } catch (err) {
    console.error(err);
  }
  const options = cameras.map(({ deviceId, label }) => new Option(label, deviceId));
  const inUse = cameras.some((c) => c.deviceId === camera.deviceId);
  if (!inUse) options.unshift(new Option(cameras.length ? 'Camera not started — pick one' : 'No camera found', '', true, true));
  els.cameraSelect.replaceChildren(...options);
  if (inUse) els.cameraSelect.value = camera.deviceId;
  els.cameraSelect.disabled = cameras.length === 0 || (inUse && cameras.length < 2);
}

async function renderHost() {
  const ids = await store.listGridIds();
  const exported = store.exportedIds();
  unexportedCount = ids.filter((id) => !exported.has(id)).length;
  els.hostCount.textContent = `${ids.length} Grid${ids.length === 1 ? '' : 's'} in this Event · ${unexportedCount} not yet exported`;
  els.zip.disabled = ids.length === 0;

  const sharing = canShareFiles();
  els.shareNote.hidden = sharing || ids.length === 0;
  els.shareBatches.replaceChildren();
  if (!sharing) return;

  for (let i = 0; i < ids.length; i += CONFIG.shareBatchSize) {
    const batch = ids.slice(i, i + CONFIG.shareBatchSize);
    const done = batch.every((id) => exported.has(id));
    const btn = document.createElement('button');
    btn.textContent = `Share Grids ${i + 1}–${i + batch.length}${done ? ' ✓' : ''}`;
    btn.addEventListener('click', () => onShareBatch(btn, batch));
    els.shareBatches.appendChild(btn);
  }
}

async function onShareBatch(btn, ids) {
  try {
    // Reuse files prepared on an earlier tap, if the browser needed a second tap.
    btn._files ??= (await store.getGrids(ids)).map(toFile);
    const shared = await shareFiles(btn._files);
    if (shared) {
      store.markExported(ids);
      await renderHost();
    }
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      // Loading took too long for the browser's "user tapped" window. Files are ready now.
      btn.textContent = 'Ready — tap again to share';
      return;
    }
    console.error(err);
    showMessage(`Sharing failed: ${err.message}. Try the zip instead.`, { timeoutMs: 6000 });
  }
}

async function onZip() {
  els.zip.disabled = true;
  try {
    const ids = await store.listGridIds();
    downloadZip(await store.getGrids(ids));
    store.markExported(ids);
    await renderHost();
  } catch (err) {
    console.error(err);
    showMessage(`Zip failed: ${err.message}`, { timeoutMs: 6000 });
  } finally {
    els.zip.disabled = false;
  }
}

let clearArmed = false;
let clearTimer = null;

function disarmClear() {
  clearArmed = false;
  clearTimeout(clearTimer);
  els.clear.textContent = 'Clear & start new Event';
}

async function onClear() {
  if (!clearArmed) {
    clearArmed = true;
    els.clear.textContent = unexportedCount
      ? `⚠ ${unexportedCount} Grid${unexportedCount === 1 ? '' : 's'} not exported! Tap again to delete everything`
      : 'Tap again to clear this Event';
    clearTimer = setTimeout(disarmClear, 5000);
    return;
  }
  disarmClear();
  try {
    await store.clearEvent();
    await renderHost();
  } catch (err) {
    console.error(err);
    showMessage(`Clear failed: ${err.message}`, { timeoutMs: 6000 });
  }
}

// ---------- Device: wake lock, fullscreen, offline ----------

async function keepAwake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      await navigator.wakeLock.request('screen');
    }
  } catch {
    /* not supported or refused; the setup checklist covers auto-lock */
  }
}

function goFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

function registerServiceWorker() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && !local) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Offline support unavailable', err));
  }
}

// ---------- Boot ----------

els.start.addEventListener('click', onStart);
els.done.addEventListener('click', endReview);
els.print.addEventListener('click', onPrint);
document.addEventListener('visibilitychange', keepAwake);
setupHost();
setupStyle();
loadFonts().then(() => !els.host.hidden && renderStyle());
registerServiceWorker();
keepAwake();
navigator.storage?.persist?.().catch(() => {});
initCamera();
