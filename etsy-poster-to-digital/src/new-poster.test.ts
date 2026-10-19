import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { ensureDownloadDetails, extractPosterText, findPosterInput, preparePoster } from "./new-poster.js";

test("folder discovery accepts unrelated JPG/PNG and TXT/MD names and rejects ambiguity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "etsy-input-"));
  try {
    await assert.rejects(findPosterInput(dir), /genau eine Bilddatei/);
    await writeFile(join(dir, "art.JPG"), "image");
    await assert.rejects(findPosterInput(dir), /genau eine Beschreibung/);
    await mkdir(join(dir, "out"));
    await writeFile(join(dir, "out", "ignored.jpg"), "generated");
    for (const name of ["beschreibung.MD", "anderer-name.txt"]) {
      await writeFile(join(dir, name), "Mondwald");
      const input = await findPosterInput(dir);
      assert.equal(input.image, join(dir, "art.JPG"));
      assert.equal(input.text, "Mondwald");
      await rm(join(dir, name));
    }
    await rm(join(dir, "art.JPG"));
    await writeFile(join(dir, "art.PNG"), "image");
    await writeFile(join(dir, "description.md"), "PNG description");
    assert.equal((await findPosterInput(dir)).image, join(dir, "art.PNG"));
    await rm(join(dir, "description.md"));
    await writeFile(join(dir, "one.txt"), "one");
    await writeFile(join(dir, "two.md"), "two");
    await assert.rejects(findPosterInput(dir), /Beschreibung.*2/);
    await writeFile(join(dir, "other.jpeg"), "image");
    await assert.rejects(findPosterInput(dir), /Bilddatei.*2/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("description extraction respects title and Etsy tag limits", () => {
  const result = extractPosterText("Titel: Mond und Wald\nEin verträumter Wald unter dem Mond.\nTags: mond poster, wald kunst, mond poster, dieser tag ist leider viel zu lang");
  assert.equal(result.title, "Mond und Wald | Digital Download");
  assert.deepEqual(result.tags, ["digital download", "printable poster", "mond poster", "wald kunst"]);
  assert.match(result.description, /Ein verträumter Wald/);
  assert.doesNotMatch(result.description, /Tags:/);
  assert.throws(() => extractPosterText("  "));
  const generated = extractPosterText("Ein magischer Wald mit bunten Blumen und einem kleinen Fuchs. Ein Poster für Kinder.");
  assert.ok(generated.tags.includes("magischer wald"));
  assert.ok(generated.tags.length <= 13);
  assert.ok(extractPosterText("A".repeat(300)).title.length <= 140);
});

test("upscale creates 60x80cm JPG at 300dpi and preserves full image", async () => {
  const dir = await mkdtemp(join(tmpdir(), "etsy-poster-"));
  try {
    const image = join(dir, "input.png");
    const output = join(dir, "output.jpg");
    await sharp({ create: { width: 100, height: 100, channels: 3, background: "red" } }).png().toFile(image);
    await preparePoster(image, output);
    const info = await sharp(output).metadata();
    assert.equal(info.width, 7087);
    assert.equal(info.height, 9449);
    assert.equal(info.density, 300);
    const corner = await sharp(output).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.ok([...corner].every(c => c > 245), "white margin instead of cropping");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

const downloadDetails = `Your digital download includes:
- 1 high-quality JPG file
- 7087 × 9449 pixels
- 300 dpi
- 3:4 portrait format

Prepared for printing at 60 × 80 cm, or smaller 3:4 sizes such as 30 × 40 cm and 45 × 60 cm`;

test("missing download details are appended exactly and existing details are preserved", () => {
  assert.equal(ensureDownloadDetails("Artwork description."), `Artwork description.\n\n${downloadDetails}`);
  assert.equal(ensureDownloadDetails(downloadDetails), downloadDetails);
  const formatted = downloadDetails.replaceAll("×", "x").replace("300 dpi", "**300 DPI**");
  assert.equal(ensureDownloadDetails(formatted), formatted);
  const partial = ensureDownloadDetails("Artwork. 300 dpi");
  assert.equal(partial.match(/300 dpi/g)?.length, 1);
  assert.ok(partial.includes("- 7087 × 9449 pixels"));
  assert.ok(partial.includes("45 × 60 cm"));
  assert.equal(ensureDownloadDetails(partial), partial);
  const result = extractPosterText(`Titel: Moon Forest\n${downloadDetails}`);
  assert.equal(result.description.match(/7087/g)?.length, 1);
});

test("Markdown field headings read their following content without leaking into description", () => {
  for (const heading of ["**Title**", "**TITLE:**", "## Titel", "Title:"]) {
    const result = extractPosterText(`${heading}\n\nMoon Forest\n\n**Tags**\nmoon poster, forest art\n\nA dreamy woodland scene.`);
    assert.equal(result.title, "Moon Forest | Digital Download");
    assert.deepEqual(result.tags, ["digital download", "printable poster", "moon poster", "forest art"]);
    assert.match(result.description, /A dreamy woodland scene/);
    assert.doesNotMatch(result.description, /Moon Forest|moon poster|\*\*Tags/);
  }
  const bullets = extractPosterText("**Title:** Moon Forest\n**Schlagwörter**\n- moon poster\n- forest art\n\nArtwork description.");
  assert.ok(bullets.tags.includes("forest art"));
  assert.doesNotMatch(bullets.description, /forest art/);
  assert.throws(() => extractPosterText("**Title**\n\n**Tags**\nmoon poster"), /Kein Inhalt/);
});

test("title commas become pipes and English footer has paragraph breaks", () => {
  const result = extractPosterText("Title: Moon Forest, Fox Art, Nursery Poster\nA dreamy woodland scene.");
  assert.equal(result.title, "Moon Forest | Fox Art | Nursery Poster | Digital Download");
  assert.match(result.description, /45 × 60 cm\n\nNo physical item will be shipped\. Frame not included\.\n\nThis artwork was created using an AI generator\./);
  assert.doesNotMatch(result.description, /Kein physischer|Rahmen nicht|Das Motiv/);
  const long = extractPosterText(`Title: ${"Moon, Forest, ".repeat(30)}\nArtwork.`);
  assert.ok(long.title.length <= 140);
  assert.doesNotMatch(long.title, /,|\|\s*\|/);
});
