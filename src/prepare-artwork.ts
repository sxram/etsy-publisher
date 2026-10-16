import sharp from 'sharp';
export const WHITE_PRINT_NOTICE = 'Please note: This design includes a white background and border that will be printed and remain visible on colored T-shirts. The background is not transparent.';
import { writeFile } from 'node:fs/promises';

export async function analyzeArtwork(input: string) {
  const { data, info } = await sharp(input, { failOn: 'error' }).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const foreground = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return data[i + 3]! > 16 && Math.min(data[i]!, data[i + 1]!, data[i + 2]!) < 245;
  };
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (foreground(x, y)) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('Kein erkennbares Motiv gefunden.');
  // A rectangular print must have substantial foreground coverage on all four
  // edges of its bounding box. A thin band tolerates antialiasing and noise.
  const w = right - left + 1, h = bottom - top + 1;
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.01));
  const horizontal = (y: number, direction: number) => {
    let hits = 0;
    for (let x = left; x <= right; x++) for (let offset = 0; offset < band; offset++) if (foreground(x, y + direction * offset)) { hits++; break; }
    return hits / w;
  };
  const vertical = (x: number, direction: number) => {
    let hits = 0;
    for (let y = top; y <= bottom; y++) for (let offset = 0; offset < band; offset++) if (foreground(x + direction * offset, y)) { hits++; break; }
    return hits / h;
  };
  const edgeCoverage = [horizontal(top, 1), horizontal(bottom, -1), vertical(left, 1), vertical(right, -1)];
  const rectangular = w >= width * 0.1 && h >= height * 0.1 && edgeCoverage.every(value => value >= 0.85);
  const crop = { left: 0, top: 0, width, height };
  const scale = 3800 / Math.max(crop.width, crop.height);
  return { rectangular, allowedColors: 'all-template-colors', edgeCoverage, width, height, crop, density: 300, preparedWidth: Math.round(crop.width * scale), preparedHeight: Math.round(crop.height * scale) };
}

export async function prepareArtwork(input: string, output: string) {
  const analysis = await analyzeArtwork(input);
  const { width, height } = analysis.crop;
  const make = (longEdge: number, palette: boolean) => {
    const image = sharp(input, { failOn: 'error' }).rotate().toColourspace('srgb').ensureAlpha();
    image.resize(width >= height ? { width: longEdge, kernel: 'lanczos3' } : { height: longEdge, kernel: 'lanczos3' });
    if (longEdge > Math.max(width, height)) image.sharpen({ sigma: 0.5 });
    return image.withMetadata({ density: 300 }).png({ compressionLevel: 9, ...(palette ? { palette: true, colours: 256, dither: 0.5 } : {}) }).toBuffer();
  };
  const limit = 10_000_000;
  let longEdge = 3800;
  let bytes = await make(longEdge, false);
  // Quantize only if lossless PNG compression exceeds the file-size target.
  if (bytes.length > limit) bytes = await make(longEdge, true);
  while (bytes.length > limit && longEdge > 1000) {
    longEdge = Math.max(1000, Math.floor(longEdge * 0.9));
    bytes = await make(longEdge, true);
  }
  if (bytes.length > limit) throw new Error('PNG lässt sich nicht unter 10 MB vorbereiten. Motiv prüfen.');
  await writeFile(output, bytes);
  const info = await sharp(bytes).metadata();
  return { preparedWidth: info.width!, preparedHeight: info.height!, fileBytes: bytes.length };
}
