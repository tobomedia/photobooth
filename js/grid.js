// Compose four Photos into one 2×2 Grid image.

export function gridSize(photoWidth, photoHeight, { gap, border }) {
  return {
    width: border * 2 + photoWidth * 2 + gap,
    height: border * 2 + photoHeight * 2 + gap,
  };
}

export function composeGrid(photos, { gap, border, background }) {
  if (photos.length !== 4) throw new Error(`a Grid needs 4 Photos, got ${photos.length}`);
  const pw = photos[0].width;
  const ph = photos[0].height;
  const { width, height } = gridSize(pw, ph, { gap, border });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  photos.forEach((photo, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    ctx.drawImage(photo, border + col * (pw + gap), border + row * (ph + gap));
  });
  return canvas;
}

export function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('could not encode the Grid'))),
      'image/jpeg',
      quality,
    );
  });
}
