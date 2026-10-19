import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watermarkImage, validateStyle } from "./watermark-image.js";
test("watermark changes pixels, retains dimensions and does not modify original", async () => {
 const dir = await mkdtemp(join(tmpdir(), "watermark-"));
 try {
  const input = join(dir, "original.png"), output = join(dir, "preview.jpg");
  await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#208090" } }).png().toFile(input);
  const before = await readFile(input);
  await watermarkImage(input, output, "Giggle & <Home>", 0.3);
  assert.deepEqual(await readFile(input), before);
  const meta = await sharp(output).metadata(); assert.equal(meta.width, 800); assert.equal(meta.height, 1000);
  const { channels } = await sharp(output).stats(); assert.ok(channels[0].stdev > 2);
 } finally { await rm(dir, { recursive: true, force: true }); }
});
test("reject invalid style before rendering", () => {
 for (const opacity of [NaN, -1, 0, 1]) assert.throws(() => validateStyle("Home", opacity));
 assert.throws(() => validateStyle("", 0.2));
});
