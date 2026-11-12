# MediaPipe (vendored)

Face detection for props that follow faces. Kept here, not loaded from a CDN, so the
booth works offline.

- `vision_bundle.mjs`, `wasm/vision_wasm_internal.*`: `@mediapipe/tasks-vision` 1.1.1 from npm.
- `blaze_face_short_range.tflite`: the BlazeFace short-range face detector model, from
  storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/.

Both are © Google LLC and licensed under the Apache License 2.0:
https://www.apache.org/licenses/LICENSE-2.0
