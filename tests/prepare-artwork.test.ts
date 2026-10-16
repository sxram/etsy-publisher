import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { analyzeArtwork, prepareArtwork, WHITE_PRINT_NOTICE } from '../src/prepare-artwork.js';

test('preparation preserves white and existing alpha, writes 300dpi and preserves pixel values at target dimensions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'artwork-'));
  try {
    const source = join(dir, 'input.png'), output = join(dir, 'output.png');
    const pixels = Buffer.alloc(3800 * 4);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    pixels.set([255,255,255,255, 255,0,0,128, 253,253,253,255, 0,0,0,0], 100 * 4);
    await sharp(pixels, { raw: { width: 3800, height: 1, channels: 4 } }).png().toFile(source);
    const original = await readFile(source);
    await prepareArtwork(source, output);
    assert.deepEqual(await sharp(output).raw().toBuffer(), pixels);
    const info = await sharp(output).metadata();
    assert.equal(info.density, 300); assert.equal(info.width, 3800); assert.equal(info.height, 1);
    assert.deepEqual(await readFile(source), original);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rectangle heuristic distinguishes filled rectangular artwork from a circular motif', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shape-'));
  try {
    const source = join(dir, 'shape.png');
    const pixels = Buffer.alloc(40 * 40 * 4, 255);
    const paint = (x: number, y: number) => { const i = (y * 40 + x) * 4; pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; };
    for (let y = 5; y < 35; y++) for (let x = 5; x < 35; x++) paint(x, y);
    await sharp(pixels, { raw: { width: 40, height: 40, channels: 4 } }).png().toFile(source);
    assert.equal((await analyzeArtwork(source)).rectangular, true);
    pixels.fill(255);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if ((x - 20) ** 2 + (y - 20) ** 2 < 15 ** 2) paint(x, y);
    await sharp(pixels, { raw: { width: 40, height: 40, channels: 4 } }).png().toFile(source);
    assert.equal((await analyzeArtwork(source)).allowedColors, 'all-template-colors');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('small portrait is upscaled proportionally to 3800 pixels and 300dpi', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'upscale-'));
  try {
    const source = join(dir, 'input.png'), output = join(dir, 'output.png');
    await sharp({ create: { width: 112, height: 140, channels: 4, background: { r: 100, g: 50, b: 20, alpha: 0.5 } } }).png().toFile(source);
    const prepared = await prepareArtwork(source, output);
    assert.ok(prepared.fileBytes <= 10_000_000);
    const meta = await sharp(output).metadata();
    assert.equal(meta.height, 3800); assert.equal(meta.width, 3040);
    assert.equal(meta.density, 300); assert.equal(meta.hasAlpha, true);
    const pixel = await sharp(output).extract({ left: 100, top: 100, width: 1, height: 1 }).raw().toBuffer();
    assert.ok(pixel[3]! >= 126 && pixel[3]! <= 129);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('nonrectangular artwork retains exterior white border and enclosed white', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'crop-'));
  try {
    const source = join(dir, 'input.png'), output = join(dir, 'output.png');
    const pixels = Buffer.alloc(100 * 100 * 4, 255);
    for (let y = 20; y <= 80; y++) for (let x = 20; x <= 80; x++) {
      const distance = (x - 50) ** 2 + (y - 50) ** 2;
      if (distance <= 30 ** 2 && distance >= 20 ** 2) {
        const i = (y * 100 + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
      }
    }
    await sharp(pixels, { raw: { width: 100, height: 100, channels: 4 } }).png().toFile(source);
    const analysis = await analyzeArtwork(source);
    assert.equal(analysis.rectangular, false);
    assert.deepEqual(analysis.crop, { left: 0, top: 0, width: 100, height: 100 });
    assert.equal(analysis.preparedWidth, 3800);
    const prepared = await prepareArtwork(source, output);
    assert.ok(prepared.fileBytes <= 10_000_000);
    const meta = await sharp(output).metadata();
    assert.equal(meta.width, 3800); assert.equal(meta.height, 3800); assert.equal(meta.density, 300);
    const center = await sharp(output).extract({ left: 1900, top: 1900, width: 1, height: 1 }).raw().toBuffer();
    assert.deepEqual([...center], [255,255,255,255]);
    const corner = await sharp(output).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.deepEqual([...corner], [255,255,255,255]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('nonrectangular print notice is appended without duplicates', async () => {
  const { appendDescriptionDefaults } = await import('../src/folder-input.js');
  const description = appendDescriptionDefaults('My design.', [WHITE_PRINT_NOTICE]);
  assert.match(description, /white background and border.*printed.*colored T-shirts/);
  assert.equal(appendDescriptionDefaults(description, [WHITE_PRINT_NOTICE]), description);
});
