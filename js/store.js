// The current Event: every Grid, kept in IndexedDB on this device.
// Grids are stored as ArrayBuffers (not Blobs) for compatibility with older iOS.

const DB_NAME = 'photobooth';
const STORE = 'grids';
const EXPORTED_KEY = 'photobooth.exportedIds';

let dbPromise;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Resolves to the new Grid's id.
export async function addGrid(blob, createdAt = Date.now()) {
  const data = await blob.arrayBuffer();
  return run('readwrite', (s) => s.add({ data, type: blob.type, createdAt }));
}

export function listGridIds() {
  return run('readonly', (s) => s.getAllKeys());
}

export async function getGrids(ids) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const out = [];
    ids.forEach((id) => {
      const req = store.get(id);
      req.onsuccess = () => req.result && out.push(req.result);
    });
    tx.oncomplete = () => resolve(out.sort((a, b) => a.id - b.id));
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearEvent() {
  await run('readwrite', (s) => s.clear());
  writeExported(new Set());
}

// Which Grids have been Exported (shared or zipped) at least once.
export function exportedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPORTED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function markExported(ids) {
  const set = exportedIds();
  ids.forEach((id) => set.add(id));
  writeExported(set);
}

function writeExported(set) {
  try {
    localStorage.setItem(EXPORTED_KEY, JSON.stringify([...set]));
  } catch {
    /* storage unavailable; the warning on Clear will just be over-cautious */
  }
}
