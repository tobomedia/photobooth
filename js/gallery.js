// The gallery: every Grid in the current Event as small thumbnails, newest first.
// Tap one to see it full size.
//
// Grids are big (about 1920×2770), so the gallery never shows them at full size in
// the list: each is shrunk to a small thumbnail once, one at a time, only when it
// scrolls into view. That keeps memory low on phones and tablets even with hundreds.

import * as store from './store.js';

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
};

const thumbs = new Map(); // Grid id → Promise of a thumbnail URL (kept between openings)
let queue = Promise.resolve(); // makes thumbnails one after another
let ids = [];
let viewing = -1; // index into ids of the Grid shown full size
let viewerUrl = null;
let idleTimer = null;
let observer = null;

export function setupGallery() {
  els.close.addEventListener('click', closeGallery);
  els.viewerClose.addEventListener('click', closeViewer);
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
  els.count.textContent = ids.length ? `${ids.length} Grid${ids.length === 1 ? '' : 's'}` : 'No Grids yet';
  els.list.replaceChildren(
    ...ids.map((id, i) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.dataset.id = id;
      tile.setAttribute('aria-label', `Grid ${ids.length - i}`);
      tile.addEventListener('click', () => showGrid(i));
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
  els.viewer.hidden = false;
}

function closeViewer() {
  els.viewer.hidden = true;
  els.viewerImg.removeAttribute('src');
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = null;
  viewing = -1;
}
