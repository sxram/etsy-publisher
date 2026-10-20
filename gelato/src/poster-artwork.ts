import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { GelatoTemplate } from './clients/gelato.js';
export const posterSizes = ['30x40', '45x60', '60x80'] as const;
export type PosterSize = typeof posterSizes[number];
export function posterSize(variant: GelatoTemplate['variants'][number]): PosterSize {
  const text = (variant.variantOptions ?? []).map(o => o.value).join(' ').replace(/×/g, 'x');
  const matches = posterSizes.filter(size => {
    const [w,h] = size.split('x');
    return new RegExp(`(?:^|[^0-9])${w}\\s*(?:cm)?\\s*x\\s*${h}\\s*(?:cm)?(?:$|[^0-9])`, 'i').test(text);
  });
  if (matches.length !== 1) throw new Error(`Postergröße nicht eindeutig: ${variant.id} (${text}). Erwartet 30x40, 45x60 oder 60x80 cm.`);
  return matches[0]!;
}
export function validatePosterTemplate(template: GelatoTemplate) {
  const sizes = template.variants.map(posterSize);
  if (sizes.length !== 3 || new Set(sizes).size !== 3) throw new Error('Poster-Vorlage muss genau drei Varianten enthalten: 30x40, 45x60, 60x80 cm.');
  const names = template.variants.map(v => v.imagePlaceholders);
  if (names.some(n => n.length !== 1 || !n[0]?.name)) throw new Error('Jede Poster-Variante braucht genau einen Bildplatzhalter.');
}
export async function preparePosterArtwork(input: string, out: string) {
  // Read oriented dimensions rather than relying on EXIF's unrotated width/height.
  const { info } = await sharp(input).rotate().resize({ width: 300, height: 400, fit: 'inside' }).toBuffer({ resolveWithObject: true });
  if (Math.abs(info.width / info.height - 0.75) > 0.015) throw new Error('Poster benötigt ein 3:4-Hochformat. Kein automatischer Beschnitt oder Verzerren.');
  await mkdir(out, { recursive: true });
  const files: Record<string,string> = {};
  for (const size of posterSizes) {
    const [w,h] = size.split('x').map(Number);
    const path = join(out, `poster-${size}cm-300dpi.jpg`);
    await sharp(input).rotate().flatten({ background: 'white' }).resize(Math.round(w! / 2.54 * 300), Math.round(h! / 2.54 * 300), { fit: 'fill', kernel: 'lanczos3' }).sharpen({ sigma: 0.6 }).withMetadata({ density: 300 }).jpeg({ quality: 95, mozjpeg: true }).toFile(path);
    files[size] = path;
  }
  return files;
}
