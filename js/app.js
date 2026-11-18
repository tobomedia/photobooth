import { startCamera, capturePhoto } from './camera.js';
import { composeGrid, previewGrid, canvasToBlob, FONTS, fontById, loadFonts, LAYOUTS, layoutById } from './grid.js';
import { PATTERNS, drawBackground } from './backgrounds.js';
import { PROP_SETS, DEFAULT_PHRASES, drawProps, propForShot, shuffleMix } from './props.js';
import { startTracking, stopTracking, trackingActive, currentFaces, averageCheckMs } from './faces.js';
import { setupGallery, openGallery, closeGallery, galleryOpen } from './gallery.js';
import { FILTERS, filterById, applyFilter, setupFilterPreview, showFilterPreview } from './filters.js';
import * as store from './store.js';
import { canShareFiles, shareFiles, toFile, downloadFile, downloadZip } from './exporter.js';

// Tweak these after a test run.
const CONFIG = {
  photosPerTurn: 4,
  countdownSeconds: 3,
  pauseBetweenPhotosMs: 1000,
  propRevealMs: 2000, // time to get into position when new props appear, before the countdown
  hostHoldMs: 3000,
  grid: { gap: 30, border: 60, background: '#ffffff', jpegQuality: 0.9 },
  shareBatchSize: 30,
};

const PRINT_KEY = 'photobooth.printEnabled';
const AUTO_PRINT_KEY = 'photobooth.autoPrint'; // open the print screen by itself after each Turn
const AUTO_PRINT_DELAY_MS = 1500; // let the guests see their Grid before the print screen covers it
const PAPER_KEY = 'photobooth.printPaper'; // 'photo' (100×148 mm postcard, Selphy KP-108IN) or 'a4'
const BACKUP_KEY = 'photobooth.backupEnabled';
const CAMERA_KEY = 'photobooth.cameraFacing'; // 'user' (front, default) or 'environment' (back)
const STYLE_KEY = 'photobooth.gridStyle';
const PROPS_KEY = 'photobooth.props';
const FILTER_KEY = 'photobooth.filter';

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
  cancel: $('cancel'),
  saveWarning: $('save-warning'),
  hotspot: $('host-hotspot'),
  host: $('host'),
  hostClose: $('host-close'),
  hostCount: $('host-count'),
  shareBatches: $('share-batches'),
  shareNote: $('share-note'),
  zip: $('zip'),
  printToggle: $('print-toggle'),
  autoPrintToggle: $('auto-print-toggle'),
  paperButtons: [...document.querySelectorAll('#paper-choice button')],
  backupToggle: $('backup-toggle'),
  cameraButtons: [...document.querySelectorAll('#camera-choice button')],
  caption: $('caption'),
  dateToggle: $('date-toggle'),
  swatches: $('swatches'),
  fonts: $('fonts'),
  patterns: $('patterns'),
  colour: $('colour'),
  stylePreview: $('style-preview'),
  layouts: $('layouts'),
  stage: $('stage'),
  filterChoices: $('filter-choices'),
  guestFilterToggle: $('guest-filter-toggle'),
  filterPicker: $('filter-picker'),
  filterName: $('filter-name'),
  filterPrev: $('filter-prev'),
  filterNext: $('filter-next'),
  propsOverlay: $('props-overlay'),
  propCue: $('prop-cue'),
  cycleProps: $('cycle-props'),
  cycleIcon: $('cycle-icon'),
  guestProps: $('guest-props'),
  propSets: $('prop-sets'),
  phrases: $('phrases'),
  guestPropsToggle: $('guest-props-toggle'),
  followFacesToggle: $('follow-faces-toggle'),
  followFacesStatus: $('follow-faces-status'),
  clear: $('clear'),
  appVersion: $('app-version'),
  updateNow: $('update-now'),
  updateStatus: $('update-status'),
  message: $('message'),
  messageText: $('message-text'),
  messageRetry: $('message-retry'),
  messageClose: $('message-close'),
  printSheet: $('print-sheet'),
};

let state = 'idle'; // idle | turn | review
let reviewUrl = null;
let printedThisReview = false; // so the automatic print screen doesn't follow a tap on Print
let reviewLayout = 'grid'; // the layout of the Grid on screen, for printing
let facing = 'user'; // the camera in use: 'user' (front) or 'environment' (back)

// Waits are only used during a Turn, so Cancel can cut any of them short: they then
// throw an AbortError, which stops the Turn.
let turnAbort = null;
const sleep = (ms) =>
  new Promise((resolve, reject) => {
    const signal = turnAbort?.signal;
    if (signal?.aborted) return reject(new DOMException('Turn cancelled', 'AbortError'));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Turn cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

function setState(next) {
  state = next;
  document.body.dataset.state = next;
  if (next === 'idle') applyLayout(); // a layout change made during a Turn waits until it ends
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
  clearTimeout(messageTimer);
  els.message.hidden = true;
}

// ---------- Camera ----------

// Front cameras are mirrored, like a mirror; back cameras are not.
const mirrored = () => facing !== 'environment';

function chosenFacing() {
  try {
    localStorage.removeItem('photobooth.cameraId'); // the old camera list setting: start on the front camera
    return localStorage.getItem(CAMERA_KEY) === 'environment' ? 'environment' : 'user';
  } catch {
    return 'user';
  }
}

function saveFacing(value) {
  try {
    localStorage.setItem(CAMERA_KEY, value);
  } catch {
    showMessage('Could not save the camera setting on this device.', { timeoutMs: 4000 });
  }
}

// `switching` is true when the Host has just tapped Front/Back, so a failure stays on screen.
async function initCamera({ switching = false } = {}) {
  els.start.disabled = true;
  els.cameraButtons.forEach((b) => (b.disabled = true));
  try {
    const chosen = chosenFacing();
    try {
      facing = await startCamera(els.preview, chosen);
    } catch (err) {
      if (chosen === 'user' || err.name === 'NotAllowedError') throw err;
      // The back camera wouldn't start: go back to the front one, and remember that.
      console.warn('Back camera unavailable, using the front one', err);
      saveFacing('user');
      facing = await startCamera(els.preview, 'user');
      showMessage(`Couldn't start the back camera (${err.name}: ${err.message}), so the front camera is being used.`, {
        timeoutMs: switching ? 0 : 8000,
      });
      return;
    }
    if (switching) showMessage(`Using the ${facing === 'environment' ? 'back' : 'front'} camera.`, { timeoutMs: 3000 });
    else hideMessage();
  } catch (err) {
    console.error(err);
    showMessage(`Camera unavailable: ${err.message}. Check camera permission for this site.`, { retry: () => initCamera() });
  } finally {
    els.preview.classList.toggle('unmirrored', !mirrored());
    els.start.disabled = !els.preview.srcObject;
    renderCameraChoice();
    updateTracking();
  }
}

function renderCameraChoice() {
  els.cameraButtons.forEach((b) => {
    b.classList.toggle('selected', b.dataset.facing === facing);
    b.disabled = false;
  });
}

// ---------- Turn ----------

async function onStart() {
  if (state !== 'idle' || galleryOpen()) return;
  goFullscreen();
  keepAwake();
  hideMessage();
  clearTimeout(cycleCueTimer); // the Turn's own cues take over
  els.propCue.hidden = true;
  setState('turn');
  els.dots.forEach((d) => d.classList.remove('taken'));
  turnAbort = new AbortController();
  els.cancel.hidden = false;
  const photos = [];

  try {
    await loadFonts(); // speech bubbles use the Grid font
    const style = gridStyle(); // fixed for the whole Turn, even if the Host changes it mid-way
    const { photo: photoSize } = layoutById(style.layout);
    const filterId = filterForTurn();
    for (let i = 0; i < CONFIG.photosPerTurn; i++) {
      await revealProps(i);
      await countdown(CONFIG.countdownSeconds);
      const photo = capturePhoto(els.preview, { ...photoSize, mirror: mirrored() });
      applyFilter(photo, filterId); // before the props, so they stay in colour
      drawProps(photo.getContext('2d'), photo.width, photo.height, propsForTurn(), i);
      photos.push(photo);
      flash();
      els.dots[i].classList.add('taken');
      if (i < CONFIG.photosPerTurn - 1) await sleep(CONFIG.pauseBetweenPhotosMs);
    }
    // All Photos taken: too late to cancel, the Grid is made and saved.
    turnAbort = null;
    els.cancel.hidden = true;

    await loadFonts();
    const canvas = composeGrid(photos, style);
    reviewLayout = style.layout;
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
    const cancelled = err.name === 'AbortError';
    if (!cancelled) console.error(err);
    photos.forEach((p) => (p.width = 0)); // nothing from this Turn is kept
    turnAbort = null;
    els.cancel.hidden = true;
    els.countdown.textContent = '';
    els.propCue.hidden = true;
    els.dots.forEach((d) => d.classList.remove('taken'));
    if (cancelled) {
      guestPick = null; // start again fresh, as after a finished Turn
      guestFilter = null;
      renderFilter();
      mixOrder = shuffleMix();
      renderGuestProps();
    }
    setState('idle');
    drawOverlay(0);
    if (!cancelled) showMessage('Something went wrong — tap Start to try again.', { timeoutMs: 5000 });
  }
}

// Stops a Turn part-way through. Nothing is saved.
function cancelTurn() {
  turnAbort?.abort();
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
  printedThisReview = false;
  els.result.src = reviewUrl;
  els.result.hidden = false;
  els.saveWarning.hidden = saved;
  els.print.hidden = !printEnabled();
  setState('review'); // stays on this Grid until someone taps Done
  if (printEnabled() && autoPrintEnabled()) {
    const url = reviewUrl;
    // Skip if they've already tapped Done (or Print) by then.
    setTimeout(() => state === 'review' && reviewUrl === url && !printedThisReview && onPrint(), AUTO_PRINT_DELAY_MS);
  }
}

function endReview() {
  if (state !== 'review') return;
  guestPick = null; // the next group starts from the Host's choice
  guestFilter = null;
  renderFilter();
  mixOrder = shuffleMix(); // and gets a new surprise order
  renderGuestProps();
  drawOverlay(0);
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
  return { caption: '', showDate: false, font: 'system', pattern: 'plain', layout: 'grid', ...CONFIG.grid, ...saved };
}

function saveGridStyle(changes) {
  const { caption, showDate, background, font, pattern, layout } = { ...gridStyle(), ...changes };
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify({ caption, showDate, background, font, pattern, layout }));
  } catch {
    showMessage('Could not save the Grid style on this device.', { timeoutMs: 4000 });
  }
  renderStyle();
}

// The camera view takes the shape of the Photos (3:4 or square), so guests frame what's saved.
function applyLayout() {
  if (state !== 'idle') return;
  document.body.dataset.layout = layoutById(gridStyle().layout).id;
  drawOverlay(0);
}

function setupStyle() {
  els.layouts.replaceChildren(
    ...LAYOUTS.map((l) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'layout-choice';
      b.dataset.layout = l.id;
      b.textContent = l.name;
      b.addEventListener('click', () => saveGridStyle({ layout: l.id }));
      return b;
    }),
  );
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
  els.layouts.querySelectorAll('.layout-choice').forEach((b) => b.classList.toggle('selected', b.dataset.layout === style.layout));
  applyLayout();
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

// ---------- Filters ----------

let guestFilter = null; // a filter a guest swiped to, for this Turn only
let filterPreview = null;
let filterCueTimer = null;

function filterSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(FILTER_KEY) || '{}');
  } catch {
    /* use the defaults */
  }
  return { filter: 'none', guestChoice: true, ...saved };
}

function saveFilterSettings(changes) {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify({ ...filterSettings(), ...changes }));
  } catch {
    showMessage('Could not save the filter setting on this device.', { timeoutMs: 4000 });
  }
  renderFilter();
}

const filterForTurn = () => filterById(guestFilter ?? filterSettings().filter).id;

// Guests swipe left/right on the camera (or tap the arrows) to try each filter.
function stepFilter(dir) {
  if (state !== 'idle' || !filterSettings().guestChoice) return;
  const i = FILTERS.findIndex((f) => f.id === filterForTurn());
  const next = FILTERS[(i + dir + FILTERS.length) % FILTERS.length];
  guestFilter = next.id;
  renderFilter();
  els.propCue.textContent = `${next.icon} ${next.name}`;
  els.propCue.hidden = false;
  pop(els.propCue);
  clearTimeout(cycleCueTimer);
  clearTimeout(filterCueTimer);
  filterCueTimer = setTimeout(() => (els.propCue.hidden = true), 1200);
}

function setupFilters() {
  filterPreview = setupFilterPreview(els.stage, els.preview);
  els.filterChoices.replaceChildren(
    ...FILTERS.map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'filter-choice';
      b.dataset.filter = f.id;
      const icon = document.createElement('span');
      icon.className = 'prop-icon';
      icon.textContent = f.icon;
      const name = document.createElement('span');
      name.textContent = f.name;
      b.append(icon, name);
      b.addEventListener('click', () => saveFilterSettings({ filter: f.id }));
      return b;
    }),
  );
  els.guestFilterToggle.addEventListener('change', () => saveFilterSettings({ guestChoice: els.guestFilterToggle.checked }));
  els.filterPrev.addEventListener('click', () => stepFilter(-1));
  els.filterNext.addEventListener('click', () => stepFilter(1));

  let start = null;
  els.stage.addEventListener('pointerdown', (e) => {
    start = state === 'idle' ? { x: e.clientX, y: e.clientY } : null;
  });
  els.stage.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) stepFilter(dx < 0 ? 1 : -1);
  });
  els.stage.addEventListener('pointercancel', () => (start = null));
  renderFilter();
}

function renderFilter() {
  const s = filterSettings();
  const current = filterById(filterForTurn());
  showFilterPreview(filterPreview, current.id);
  els.filterChoices.querySelectorAll('.filter-choice').forEach((b) => b.classList.toggle('selected', b.dataset.filter === s.filter));
  els.guestFilterToggle.checked = s.guestChoice;
  els.filterPicker.hidden = !s.guestChoice;
  els.filterName.textContent = `${current.icon} ${current.name}`;
}

// ---------- Props ----------

let guestPick = null; // a set chosen on the start screen for this Turn only
let mixOrder = shuffleMix(); // the order of props for the next Turn when "Mix" is chosen

function propSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(PROPS_KEY) || '{}');
  } catch {
    /* use the defaults */
  }
  return { set: 'mix', phrases: DEFAULT_PHRASES, guestChoice: false, followFaces: false, ...saved };
}

function savePropSettings(changes) {
  try {
    localStorage.setItem(PROPS_KEY, JSON.stringify({ ...propSettings(), ...changes }));
  } catch {
    showMessage('Could not save the props setting on this device.', { timeoutMs: 4000 });
  }
  renderProps();
}

// What this Turn uses: the guest's pick if they made one, else the Host's choice.
function propsForTurn() {
  const s = propSettings();
  return {
    set: guestPick ?? s.set,
    mixOrder,
    phrases: s.phrases,
    font: fontById(gridStyle().font).family,
    faces: trackingActive() ? currentFaces() : null,
  };
}

// The overlay canvas covers the camera preview exactly (both are the Photo's shape), so props drawn
// at the same fractions land in the same place as in the saved Photo.
let overlayShot = 0; // which Photo of the Turn the overlay is showing props for

function drawOverlay(shot = 0) {
  overlayShot = shot;
  const canvas = els.propsOverlay;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  drawProps(ctx, w, h, propsForTurn(), shot);
}

// Before each Photo: if the props change, pop the new ones in and announce them,
// then give guests a moment to line up before the countdown starts.
async function revealProps(shot) {
  const settings = propsForTurn();
  const prop = propForShot(settings, shot);
  const changed = shot === 0 || prop?.id !== propForShot(settings, shot - 1)?.id;
  drawOverlay(shot);
  if (!prop?.draw || !changed) return;
  els.propCue.textContent = `${prop.icon} ${prop.cue}`;
  els.propCue.hidden = false;
  pop(els.propsOverlay, els.propCue);
  await sleep(CONFIG.propRevealMs);
  els.propCue.hidden = true;
}

function pop(...elements) {
  elements.forEach((el) => {
    el.classList.remove('pop');
    void el.offsetWidth; // restart the animation
    el.classList.add('pop');
  });
}

// The start screen's cycle button: each tap tries the next prop set on the live camera,
// and the Turn uses whichever is showing. Goes back to the Host's choice after each Turn.
const CYCLE = PROP_SETS.filter((p) => p.id !== 'none');
let cycleCueTimer = null;

function cycleProps() {
  if (state !== 'idle') return;
  const current = guestPick ?? propSettings().set;
  const next = CYCLE[(CYCLE.findIndex((p) => p.id === current) + 1) % CYCLE.length];
  guestPick = next.id;
  renderGuestProps();
  drawOverlay(0);
  els.propCue.textContent = next.id === 'mix' ? `${next.icon} Mix: a surprise every photo!` : `${next.icon} ${next.name}`;
  els.propCue.hidden = false;
  pop(els.propsOverlay, els.propCue, els.cycleIcon);
  clearTimeout(cycleCueTimer);
  cycleCueTimer = setTimeout(() => (els.propCue.hidden = true), 1500);
}

function propButtons(container, onPick) {
  container.replaceChildren(
    ...PROP_SETS.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'prop-choice';
      b.dataset.set = p.id;
      b.title = p.name;
      b.setAttribute('aria-label', p.name);
      const icon = document.createElement('span');
      icon.className = 'prop-icon';
      icon.textContent = p.icon;
      const name = document.createElement('span');
      name.className = 'prop-name';
      name.textContent = p.name;
      b.append(icon, name);
      b.addEventListener('click', () => onPick(p.id));
      return b;
    }),
  );
}

// ---------- Face tracking ----------

// Runs while "Props follow faces" is on and the camera is showing; off by default, as
// it's heavy work for older devices.
let trackingWanted = false;

async function updateTracking() {
  const want = propSettings().followFaces && !!els.preview.srcObject;
  if (want === trackingWanted) return;
  trackingWanted = want;
  if (!want) {
    stopTracking();
    renderTrackingStatus();
    if (state === 'idle') drawOverlay(0);
    return;
  }
  renderTrackingStatus();
  try {
    await startTracking(els.preview, {
      isMirrored: mirrored,
      photoAspect: () => { const p = layoutById(gridStyle().layout).photo; return p.width / p.height; },
      // Pause while the camera is covered: the Grid on screen, the Host panel, the gallery.
      shouldRun: () => state !== 'review' && els.host.hidden && !galleryOpen(),
      onUpdate: () => state !== 'review' && drawOverlay(overlayShot),
    });
    if (!trackingWanted) stopTracking(); // switched off while it was loading
  } catch (err) {
    console.error(err);
    trackingWanted = false;
    showMessage(`Face tracking couldn't start on this device (${err.message}), so props stay in fixed places.`, { timeoutMs: 8000 });
  }
  renderTrackingStatus();
}

function renderTrackingStatus() {
  const ms = averageCheckMs();
  let text = '';
  if (!propSettings().followFaces) text = '';
  else if (trackingWanted && !trackingActive()) text = 'Loading face tracking…';
  else if (!trackingActive()) text = 'Not running. Check the camera is on.';
  else if (ms == null) text = 'Running.';
  else text = `Running: each face check takes about ${Math.round(ms)} ms (${ms < 30 ? 'smooth' : ms < 60 ? 'OK' : 'slow on this device, consider turning it off'}).`;
  els.followFacesStatus.textContent = text;
  els.followFacesStatus.hidden = !text;
}

function setupProps() {
  propButtons(els.propSets, (id) => savePropSettings({ set: id }));
  propButtons(els.guestProps, (id) => {
    guestPick = id;
    renderGuestProps();
    drawOverlay(0);
  });
  els.phrases.addEventListener('input', () => {
    savePropSettings({ phrases: els.phrases.value.split('\n') });
  });
  els.guestPropsToggle.addEventListener('change', () => savePropSettings({ guestChoice: els.guestPropsToggle.checked }));
  els.followFacesToggle.addEventListener('change', () => {
    savePropSettings({ followFaces: els.followFacesToggle.checked });
    updateTracking();
  });
  els.cycleProps.addEventListener('click', cycleProps);
  new ResizeObserver(() => drawOverlay(0)).observe(els.propsOverlay);
  document.fonts?.addEventListener?.('loadingdone', () => state === 'idle' && drawOverlay(0));
  renderProps();
}

function renderProps() {
  const s = propSettings();
  els.propSets.querySelectorAll('.prop-choice').forEach((b) => b.classList.toggle('selected', b.dataset.set === s.set));
  if (document.activeElement !== els.phrases) els.phrases.value = s.phrases.join('\n');
  els.guestPropsToggle.checked = s.guestChoice;
  els.followFacesToggle.checked = s.followFaces;
  renderTrackingStatus();
  renderGuestProps();
  if (state === 'idle') drawOverlay(0);
}

function renderGuestProps() {
  const s = propSettings();
  els.guestProps.hidden = !s.guestChoice;
  const current = guestPick ?? s.set;
  els.guestProps.querySelectorAll('.prop-choice').forEach((b) => b.classList.toggle('selected', b.dataset.set === current));
  // The cycle button shows the props on the camera now; its little ↻ says tap for more.
  const set = PROP_SETS.find((p) => p.id === current) ?? PROP_SETS[0];
  els.cycleIcon.textContent = set.icon;
  els.cycleProps.setAttribute('aria-label', `Props: ${set.name}. Tap to try different props`);
}

// ---------- Printing ----------

function printEnabled() {
  try {
    return localStorage.getItem(PRINT_KEY) === 'true';
  } catch {
    return false;
  }
}

function autoPrintEnabled() {
  try {
    return localStorage.getItem(AUTO_PRINT_KEY) === 'true';
  } catch {
    return false;
  }
}

// Opening the print screen by itself only makes sense when printing is on.
function renderPrintToggles() {
  els.printToggle.checked = printEnabled();
  els.autoPrintToggle.checked = autoPrintEnabled();
  els.autoPrintToggle.disabled = !els.printToggle.checked;
}

function printPaper() {
  try {
    return localStorage.getItem(PAPER_KEY) === 'a4' ? 'a4' : 'photo';
  } catch {
    return 'photo';
  }
}

function renderPaper() {
  const paper = printPaper();
  els.paperButtons.forEach((b) => b.classList.toggle('selected', b.dataset.paper === paper));
}

// The page size has to be set in an @page rule, so it's swapped in just before printing.
function setPageSize(paper) {
  let style = document.getElementById('page-size');
  if (!style) {
    style = document.createElement('style');
    style.id = 'page-size';
    document.head.appendChild(style);
  }
  style.textContent = `@page { size: ${paper === 'photo' ? '100mm 148mm' : 'A4 portrait'}; margin: 0; }`;
}

function onPrint() {
  if (!reviewUrl) return;
  printedThisReview = true;
  printGrids([{ url: reviewUrl, layout: reviewLayout }]);
}

// Prints Grids (image URLs) on the Host's chosen paper, one sheet each, as one print job.
// Used by the review screen (one Grid) and the gallery (one, or a selection).
async function printGrids(grids) {
  // A4: 4 copies with cut lines. 4×6″: one Grid, or two Strips side by side to cut apart.
  const paper = printPaper();
  setPageSize(paper);
  const imgs = [];
  const pages = grids.map(({ url, layout }) => {
    const strip = layout === 'strip';
    const page = document.createElement('div');
    page.className = 'page';
    page.classList.toggle('photo', paper === 'photo');
    page.classList.toggle('strip', strip);
    const copies = paper === 'a4' ? 4 : strip ? 2 : 1;
    for (let i = 0; i < copies; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const img = new Image();
      img.src = url;
      cell.appendChild(img);
      page.appendChild(cell);
      imgs.push(img);
    }
    return page;
  });
  els.printSheet.replaceChildren(...pages);
  await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
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
    renderPrintToggles();
  });
  els.autoPrintToggle.addEventListener('change', () => {
    try {
      localStorage.setItem(AUTO_PRINT_KEY, String(els.autoPrintToggle.checked));
    } catch {
      showMessage('Could not save the printing setting on this device.', { timeoutMs: 4000 });
    }
  });
  els.paperButtons.forEach((b) =>
    b.addEventListener('click', () => {
      try {
        localStorage.setItem(PAPER_KEY, b.dataset.paper);
      } catch {
        showMessage('Could not save the paper setting on this device.', { timeoutMs: 4000 });
      }
      renderPaper();
    }),
  );
  els.backupToggle.addEventListener('change', () => {
    try {
      localStorage.setItem(BACKUP_KEY, String(els.backupToggle.checked));
    } catch {
      showMessage('Could not save the backup setting on this device.', { timeoutMs: 4000 });
    }
  });
  els.cameraButtons.forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.facing === facing) return;
      saveFacing(b.dataset.facing);
      initCamera({ switching: true });
    }),
  );
  els.zip.addEventListener('click', onZip);
  els.updateNow.addEventListener('click', forceUpdate);
  els.clear.addEventListener('click', onClear);
}

let unexportedCount = 0;

async function openHost() {
  endReview();
  closeGallery();
  renderPrintToggles();
  renderPaper();
  els.backupToggle.checked = backupEnabled();
  els.host.hidden = false;
  renderStyle();
  renderProps();
  renderCameraChoice();
  appVersion().then((v) => (els.appVersion.textContent = `App version: ${v}`));
  els.updateStatus.textContent = '';
  await renderHost();
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

// Offline support. A new version is fetched in the background whenever the app is opened or
// comes back to the screen; the booth then reloads itself the next time it's on the start screen.
const SW_OPTIONS = { updateViaCache: 'none' }; // always check sw.js itself, not a cached copy
let reloadPending = false;

function registerServiceWorker() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!('serviceWorker' in navigator) || local) return;
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true; // the first install took over: this page is already the newest
      return;
    }
    reloadPending = true;
    reloadWhenQuiet();
  });
  navigator.serviceWorker
    .register('./sw.js', SW_OPTIONS)
    .then((reg) => {
      const check = () => document.visibilityState === 'visible' && reg.update().catch(() => {});
      document.addEventListener('visibilitychange', check);
      setInterval(check, 30 * 60 * 1000);
    })
    .catch((err) => console.warn('Offline support unavailable', err));
}

// Never in the middle of a Turn, a Grid on screen, the Host panel or the gallery.
function reloadWhenQuiet() {
  if (!reloadPending) return;
  if (state === 'idle' && els.host.hidden && !galleryOpen()) location.reload();
  else setTimeout(reloadWhenQuiet, 2000);
}

async function appVersion() {
  try {
    const keys = await caches.keys();
    return keys.find((k) => k.startsWith('photobooth-'))?.replace('photobooth-', '') ?? 'not installed for offline use';
  } catch {
    return 'unknown';
  }
}

// Host panel "Update now": throws away the offline copy and fetches the app fresh.
// Grids are stored separately and are kept.
async function forceUpdate() {
  els.updateNow.disabled = true;
  els.updateStatus.textContent = 'Checking for internet…';
  try {
    await fetch('./sw.js', { cache: 'no-store' }); // don't throw away the offline copy without internet
  } catch {
    els.updateStatus.textContent = 'No internet: connect to Wi‑Fi and try again.';
    els.updateNow.disabled = false;
    return;
  }
  els.updateStatus.textContent = 'Downloading the latest version…';
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('photobooth-')).map((k) => caches.delete(k)));
    if (navigator.serviceWorker && !['localhost', '127.0.0.1'].includes(location.hostname)) {
      // Install afresh and wait until it has saved every file, so the reload gets the new version.
      const reg = await navigator.serviceWorker.register('./sw.js', SW_OPTIONS);
      const worker = reg.installing || reg.waiting || reg.active;
      if (worker && worker.state !== 'activated') {
        await new Promise((resolve) => worker.addEventListener('statechange', () => worker.state === 'activated' && resolve()));
      }
    }
  } catch (err) {
    console.warn('Update failed', err);
  }
  location.reload();
}

// ---------- Boot ----------

els.start.addEventListener('click', onStart);
els.done.addEventListener('click', endReview);
els.cancel.addEventListener('click', cancelTurn);
els.messageClose.addEventListener('click', hideMessage);
document.getElementById('gallery-open').addEventListener('click', () => {
  if (state === 'idle') openGallery().catch((err) => showMessage(`Couldn't open the Grids: ${err.message}`, { timeoutMs: 5000 }));
});
setupGallery({ canPrint: printEnabled, print: printGrids, showMessage });
els.print.addEventListener('click', onPrint);
document.addEventListener('visibilitychange', keepAwake);
setupHost();
setupStyle();
setupFilters();
setupProps();
applyLayout();
loadFonts().then(() => !els.host.hidden && renderStyle());
registerServiceWorker();
keepAwake();
navigator.storage?.persist?.().catch(() => {});
initCamera();
