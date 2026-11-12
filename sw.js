// Offline support: cache the app so a refresh at the party works without internet.
// Bump VERSION whenever you deploy changes, so devices pick up the new files.
const VERSION = 'photobooth-v19';

const FILES = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/camera.js',
  './js/grid.js',
  './js/backgrounds.js',
  './js/gallery.js',
  './js/props.js',
  './js/faces.js',
  './js/store.js',
  './js/exporter.js',
  './js/zip.js',
  './fonts/pacifico.woff2',
  './fonts/dancingscript.woff2',
  './fonts/caveat.woff2',
  './fonts/playfairdisplay.woff2',
  './fonts/bebasneue.woff2',
  // Face tracking (about 14 MB): cached so it works offline even if it's switched on later.
  './vendor/mediapipe/vision_bundle.mjs',
  './vendor/mediapipe/wasm/vision_wasm_internal.js',
  './vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  './vendor/mediapipe/blaze_face_short_range.tflite',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)),
  );
});
