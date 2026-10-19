import sharp, { type OverlayOptions } from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readProductFolder } from './folder-input.js';
import { prepareArtwork } from './prepare-artwork.js';

interface Rect { left: number; top: number; width: number; height: number }
interface Placement extends Rect { file: string; sha256: string; label: string }
interface Calibration { model: string; reviewStatus: string; placements: Record<string, Placement>; missing: string[] }
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
export async function renderColorMockup(blank: Buffer, artwork: Buffer, rect: Rect): Promise<Buffer> {
  const meta = await sharp(blank).metadata();
  if (!meta.width || !meta.height || [rect.left, rect.top, rect.width, rect.height].some(v => !Number.isFinite(v) || v < 0) || rect.width <= 0 || rect.height <= 0 || rect.left + rect.width > meta.width || rect.top + rect.height > meta.height) throw new Error('Ungültiger Druckbereich.');
  const overlay = await sharp(artwork).rotate().resize(Math.round(rect.width), Math.round(rect.height), { fit: 'inside', withoutEnlargement: false }).png().toBuffer({ resolveWithObject: true });
  const left = Math.round(rect.left + (rect.width - overlay.info.width) / 2);
  const top = Math.round(rect.top + (rect.height - overlay.info.height) / 2);
  // Preserve the supplied file, including its opaque white background. Do not remove white or recolor fabric.
  return sharp(blank).composite([{ input: overlay.data, left, top }]).jpeg({ quality: 93, chromaSubsampling: '4:4:4' }).toBuffer();
}
const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
export function mapGelatoColors(values: string[], aliases: Record<string, string | null>) {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[ _-]+/g, '');
  const known = new Map<string, string>();
  for (const [alias, key] of Object.entries(aliases)) if (key) { known.set(normalize(alias), key); known.set(normalize(key), key); }
  known.set('ash', 'ash'); known.set('ashgrey', 'ash'); known.set('darkheather', 'dark_heather'); known.set('dunklesheidekraut', 'dark_heather');
  return [...new Set(values.map(value => { const key = known.get(normalize(value)); if (!key) throw new Error(`Keine Rohling-Zuordnung für Gelato-Farbe ${value}.`); return key; }))];
}
export function overviewPages<T extends { color: string }>(generated: T[]): T[][] {
 const colors = generated.filter(entry => entry.color !== 'white');
 return Array.from({length: Math.ceil(colors.length / 6)}, (_, index) => colors.slice(index * 6, index * 6 + 6));
}
export async function previewColorMockups(folder: string, requested?: string[]) {
  const dir = resolve(folder);
  const input = await readProductFolder(dir);
  const root = join(project, 'assets/mockups/gildan-5000b');
  const calibration = JSON.parse(await readFile(join(root, 'calibration.json'), 'utf8')) as Calibration;
  const out = join(dir, 'out/color-mockups'); await mkdir(out, { recursive: true });
  const prepared = join(out, 'artwork-prepared.png');
  await prepareArtwork(input.image, prepared);
  const artwork = await readFile(prepared);
  const selected = requested ?? [...Object.keys(calibration.placements), ...calibration.missing];
  const unknown = selected.filter(c => !calibration.placements[c] && !calibration.missing.includes(c));
  if (unknown.length) throw new Error(`Unbekannte Farben: ${unknown.join(', ')}`);
  const missing = selected.filter(c => !calibration.placements[c]);
  const generated: { color: string; label: string; file: string; rect: Rect }[] = [];
  for (const color of Object.keys(calibration.placements).filter(color => selected.includes(color))) {
    const placement = calibration.placements[color]; if (!placement) continue;
    const file = resolve(root, placement.file);
    if (!file.startsWith(root + sep)) throw new Error('Rohling liegt außerhalb des Vorlagenordners.');
    const blank = await readFile(file);
    if (digest(blank) !== placement.sha256) throw new Error(`Rohling ${color} geändert; Druckposition erneut kalibrieren.`);
    const image = await renderColorMockup(blank, artwork, placement);
    const output = join(out, `${color}.jpg`); await writeFile(output, image);
    generated.push({ color, label: placement.label, file: output, rect: { left: placement.left, top: placement.top, width: placement.width, height: placement.height } });
  }
  const overviewFiles: string[] = [];
  for (const page of overviewPages(generated)) {
    const layers: OverlayOptions[] = [];
    for (const [index, entry] of page.entries()) {
      const left = (index % 3) * 900, top = Math.floor(index / 3) * 1000 + 110;
      layers.push({ input: await sharp(entry.file).resize(860, 850, { fit: 'contain', background: 'white' }).toBuffer(), left: left + 20, top });
      layers.push({ input: Buffer.from(`<svg width="900" height="100"><rect width="100%" height="100%" fill="white"/><text x="450" y="57" text-anchor="middle" font-size="38" font-family="sans-serif">${xml(entry.label)}</text></svg>`), left, top: top + 850 });
    }
    layers.push({ input: Buffer.from('<svg width="2700" height="100"><rect width="100%" height="100%" fill="white"/><text x="1350" y="65" text-anchor="middle" font-size="44" font-family="sans-serif">Gildan 5000B — Color preview</text></svg>'), left: 0, top: 0 });
    const output = join(out, `colors-${overviewFiles.length + 1}.jpg`);
    await sharp({ create: { width: 2700, height: 2110, channels: 3, background: 'white' } }).composite(layers).jpeg({ quality: 90 }).toFile(output);
    overviewFiles.push(output);
  }
  const overviewSha256 = await Promise.all(overviewFiles.map(async file => digest(await readFile(file))));
  const report = { overviewSha256, model: calibration.model, sourceImage: input.image, sourceSha256: digest(input.bytes), artworkSha256: digest(artwork), calibrationStatus: calibration.reviewStatus, generated, overviewFiles, missing, readyForUpload: calibration.reviewStatus === 'approved-by-user', notes: ['Lokale Vorschau; keine Etsy-Bilder geändert.', 'Maßstab aus weißem Gelato-Referenzmockup abgeleitet; Position und Druckwirkung vor Verwendung prüfen.', 'Ash und Dark Heather werden nicht durch andere Farben ersetzt.', 'Verwendete Händlerrohlinge: Herkunft in assets/mockups/gildan-5000b/sources.json; keine Zusage exakter Farbtreue.'] };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${generated.length} Farbvorschauen und ${overviewFiles.length} Übersichten erstellt: ${out}`);
  if (missing.length) console.log(`Fehlende Rohlinge: ${missing.join(', ')}. Keine Ersatzfarbe verwendet.`);
  console.log('Nur lokale Vorschau. Keine Etsy-Bilder hochgeladen oder ersetzt.');
  return report;
}
export async function runColorMockups(args = process.argv.slice(2)) {
  const index = args.indexOf('--dir'), folder = args[index + 1];
  if (index < 0 || !folder || folder.startsWith('--')) throw new Error('Aufruf: npm run gelato:mockups -- --dir ./motiv [--colors white,black]');
  const ci = args.indexOf('--colors');
  if (ci >= 0 && (!args[ci + 1] || args[ci + 1]!.startsWith('--'))) throw new Error('--colors benötigt Farbnamen.');
  return previewColorMockups(folder, ci >= 0 ? args[ci + 1]!.split(',').map(c => c.trim()).filter(Boolean) : undefined);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runColorMockups().catch(error => { console.error(error instanceof Error ? error.message : 'Mockup-Fehler'); process.exitCode = 1; });
