// Export: hand the Event's Grids off the device, via the share sheet or a zip.

import { makeZip } from './zip.js';

const pad = (n) => String(n).padStart(2, '0');

function stamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function gridFileName(record) {
  return `grid-${stamp(new Date(record.createdAt))}-${record.id}.jpg`;
}

export function toFile(record) {
  return new File([record.data], gridFileName(record), {
    type: record.type || 'image/jpeg',
    lastModified: record.createdAt,
  });
}

export function canShareFiles() {
  try {
    const probe = new File([new Uint8Array(1)], 'probe.jpg', { type: 'image/jpeg' });
    return !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

// Resolves true if shared, false if the Host dismissed the share sheet.
export async function shareFiles(files) {
  try {
    await navigator.share({ files });
    return true;
  } catch (err) {
    if (err.name === 'AbortError') return false;
    throw err;
  }
}

// A plain browser download. Desktop/Android: Downloads folder.
// iPhone: asks first, then goes to the Files app (not Photos).
export function downloadFile(file, name = file.name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

export function downloadZip(records) {
  const blob = makeZip(
    records.map((r) => ({
      name: gridFileName(r),
      data: new Uint8Array(r.data),
      date: new Date(r.createdAt),
    })),
  );
  const d = new Date();
  downloadFile(blob, `photobooth-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`);
}
