// The gallery: every Grid in the current Event as small thumbnails, newest first.
// Tap one to see it full size, or tap Select to pick several to share or print.
//
// Grids are big (about 1920×2770), so the gallery never shows them at full size in
// the list: each is shrunk to a small thumbnail once, one at a time, only when it
// scrolls into view. That keeps memory low on phones and tablets even with hundreds.

import * as store from './store.js';
import { canShareFiles, shareFiles, toFile, downloadFile, downloadZip } from './exporter.js';

const THUMB_WIDTH = 320;
const AUTO_CLOSE_MS = 60_000; // close if nobody touches it, so the booth isn't left blocked

const $ = (id) => document.getElementById(id);
const els = {
  root: $('gallery'),
  list: $('gallery-list'),
  count: $('gallery-count'),
  close: $('gallery-close'),
  viewer: $('viewer'),
  viewerImg: $('viewer-img'),
  prev: $('viewer-prev'),
  next: $('viewer-next'),
  viewerClose: $('viewer-close'),
  viewerPrint: $('viewer-print'),
  select: $('gallery-select'),
  bar: $('selection-bar'),
  barCount: $('selection-count'),
  share: $('selection-share'),
  print: $('selection-print'),
};

const thumbs = new Map(); // Grid id → Promise of a thumbnail URL (kept between openings)
let queue = Promise.resolve(); // makes thumbnails one after another
let ids = [];
let viewing = -1; // index into ids of the Grid shown full size
let viewerUrl = null;
let idleTimer = null;
let observer = null;
let printing = { canPrint: () => false, print: () => {} };
let notify = (text) => console.warn(text);
let selecting = false;
const selected = new Set(); // Grid ids picked in Select mode
let printUrls = []; // object URLs of Grids handed to the printer, freed on the next print or on close

// canPrint(): whether the Host has the Print button switched on.
// print([{ url, layout }]): prints Grids on the Host's chosen paper, one sheet each.
// showMessage(text, options): shows a message to the guests.
export function setupGallery({ canPrint, print, showMessage } = {}) {
  if (canPrint && print) printing = { canPrint, print };
  if (showMessage) notify = (text) => showMessage(text, { timeoutMs: 5000 });
  els.close.addEventListener('click', closeGallery);
  els.select.addEventListener('click', () => setSelecting(!selecting));
  els.share.addEventListener('click', () => shareSelected().catch((err) => notify(`Couldn't share: ${err.message}`)));
  els.print.addEventListener('click', () => printSelected().catch((err) => notify(`Couldn't print: ${err.message}`)));
  els.viewerClose.addEventListener('click', closeViewer);
  els.viewerPrint.addEventListener('click', printShown);
  els.prev.addEventListener('click', () => showGrid(viewing - 1));
  els.next.addEventListener('click', () => showGrid(viewing + 1));
  els.root.addEventListener('pointerdown', resetIdle);
  observer = new IntersectionObserver(onVisible, { root: els.list, rootMargin: '300px' });
}

export const galleryOpen = () => !els.root.hidden;

export async function openGallery() {
  ids = (await store.listGridIds()).reverse();
  // Forget thumbnails of Grids that have been cleared.
  for (const [id, url] of thumbs) {
    if (!ids.includes(id)) {
      url.then((u) => u && URL.revokeObjectURL(u));
      thumbs.delete(id);
    }
  }
  setSelecting(false);
  renderCount();
  els.select.hidden = !ids.length;
  els.list.replaceChildren(
    ...ids.map((id, i) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.dataset.id = id;
      tile.setAttribute('aria-label', `Grid ${ids.length - i}`);
      tile.addEventListener('click', () => (selecting ? toggleSelected(id, tile) : showGrid(i)));
      return tile;
    }),
  );
  els.list.scrollTop = 0;
  els.root.hidden = false;
  els.list.querySelectorAll('.tile').forEach((tile) => observer.observe(tile));
  resetIdle();
}

export function closeGallery() {
  closeViewer();
  setSelecting(false);
  freePrintUrls();
  observer.disconnect();
  els.list.replaceChildren();
  els.root.hidden = true;
  clearTimeout(idleTimer);
}

function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(closeGallery, AUTO_CLOSE_MS);
}

function onVisible(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const tile = entry.target;
    observer.unobserve(tile);
    thumbFor(Number(tile.dataset.id)).then((url) => {
      if (!url || !tile.isConnected) return;
      const img = new Image();
      img.alt = '';
      img.src = url;
      tile.appendChild(img);
    });
  }
}

function thumbFor(id) {
  if (!thumbs.has(id)) {
    const p = (queue = queue.then(() => makeThumb(id)).catch((err) => {
      console.warn('Thumbnail failed', id, err);
      return null;
    }));
    thumbs.set(id, p);
  }
  return thumbs.get(id);
}

async function gridBlob(id) {
  const [record] = await store.getGrids([id]);
  return record ? new Blob([record.data], { type: record.type || 'image/jpeg' }) : null;
}

async function decode(blob) {
  try {
    return await createImageBitmap(blob);
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function makeThumb(id) {
  if (!galleryOpen()) {
    thumbs.delete(id); // closed before we got to it: make it next time instead
    return null;
  }
  const blob = await gridBlob(id);
  if (!blob) return null;
  const image = await decode(blob);
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_WIDTH;
  canvas.height = Math.round((image.height / image.width) * THUMB_WIDTH);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  const small = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  canvas.width = 0;
  return small ? URL.createObjectURL(small) : null;
}

async function showGrid(index) {
  if (index < 0 || index >= ids.length) return;
  viewing = index;
  els.prev.disabled = index === 0;
  els.next.disabled = index === ids.length - 1;
  const blob = await gridBlob(ids[index]);
  if (viewing !== index || !blob) return; // another tap got there first
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = URL.createObjectURL(blob);
  els.viewerImg.src = viewerUrl;
  els.viewerPrint.hidden = !printing.canPrint();
  els.viewer.hidden = false;
}

// Strips are one tall column (about 1:4); 2×2 Grids are nearly 3:4. The stored Grid doesn't
// record its layout, so tell them apart by shape.
async function printShown() {
  if (!viewerUrl) return;
  const img = els.viewerImg;
  await img.decode().catch(() => {});
  const layout = img.naturalHeight > img.naturalWidth * 2 ? 'strip' : 'grid';
  printing.print([{ url: viewerUrl, layout }]);
}

function closeViewer() {
  els.viewer.hidden = true;
  els.viewerImg.removeAttribute('src');
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = null;
  viewing = -1;
}

// ---------- Select several ----------

function renderCount() {
  els.count.textContent = selecting
    ? 'Tap Grids to select'
    : ids.length
      ? `${ids.length} Grid${ids.length === 1 ? '' : 's'}`
      : 'No Grids yet';
}

function setSelecting(on) {
  selecting = on;
  selected.clear();
  els.list.querySelectorAll('.tile.selected').forEach((t) => {
    t.classList.remove('selected');
    t.removeAttribute('aria-pressed');
  });
  els.root.classList.toggle('selecting', on);
  els.select.textContent = on ? 'Cancel' : 'Select';
  renderCount();
  renderBar();
}

function toggleSelected(id, tile) {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  const on = selected.has(id);
  tile.classList.toggle('selected', on);
  tile.setAttribute('aria-pressed', String(on));
  renderBar();
}

function renderBar() {
  els.bar.hidden = !selecting;
  const n = selected.size;
  els.barCount.textContent = `${n} selected`;
  els.share.textContent = canShareFiles() ? 'Share' : 'Download';
  els.share.disabled = !n;
  els.print.hidden = !printing.canPrint();
  els.print.disabled = !n;
}

// Newest first, the same order as the gallery.
const selectedIds = () => ids.filter((id) => selected.has(id));

async function shareSelected() {
  const records = await store.getGrids(selectedIds());
  if (!records.length) return;
  const files = records.map(toFile);
  if (canShareFiles() && navigator.canShare?.({ files })) {
    await shareFiles(files);
  } else if (files.length === 1) {
    downloadFile(files[0]);
  } else {
    downloadZip(records);
  }
}

async function printSelected() {
  freePrintUrls();
  const grids = [];
  for (const id of selectedIds()) {
    const blob = await gridBlob(id);
    if (!blob) continue;
    const image = await decode(blob);
    // Strips are one tall column (about 1:4); 2×2 Grids are nearly 3:4.
    const layout = image.height > image.width * 2 ? 'strip' : 'grid';
    image.close?.();
    const url = URL.createObjectURL(blob);
    printUrls.push(url);
    grids.push({ url, layout });
  }
  if (grids.length) await printing.print(grids);
}

function freePrintUrls() {
  printUrls.forEach((u) => URL.revokeObjectURL(u));
  printUrls = [];
}
