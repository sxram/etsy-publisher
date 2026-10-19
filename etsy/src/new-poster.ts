import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import type { EtsyListing } from "./types.js";

export function ensureDownloadDetails(description: string): string {
  const normalized = description.toLowerCase().replace(/[*_`]/g, "").replace(/\s+/g, " ");
  const dimensions = (width: string, height: string, unit: string) =>
    new RegExp(`${width}\\s*[×x]\\s*${height}\\s*${unit}`, "i").test(normalized);
  const missing: string[] = [];
  if (!/\b(?:1|one|ein(?:e|en)?)\s+(?:(?:high[- ]quality|hochwertige[nr]?|hochauflösende[nr]?)\s+)?jpe?g\s*(?:file|datei)\b/i.test(normalized)) missing.push("- 1 high-quality JPG file");
  if (!dimensions("7087", "9449", "(?:pixels?|pixeln?)")) missing.push("- 7087 × 9449 pixels");
  if (!/\b300\s*dpi\b/i.test(normalized)) missing.push("- 300 dpi");
  if (!/3\s*:\s*4\s*(?:portrait(?:\s+format)?|hochformat)/i.test(normalized)) missing.push("- 3:4 portrait format");
  const hasPrintSizes = dimensions("60", "80", "cm") && dimensions("30", "40", "cm") && dimensions("45", "60", "cm");
  if (!missing.length && hasPrintSizes) return description;
  const additions: string[] = [];
  if (missing.length) additions.push(`Your digital download includes:\n${missing.join("\n")}`);
  if (!hasPrintSizes) additions.push("Prepared for printing at 60 × 80 cm, or smaller 3:4 sizes such as 30 × 40 cm and 45 × 60 cm");
  return `${description.trim()}\n\n${additions.join("\n\n")}`;
}

export function extractPosterText(text: string) {
  const lines = text.trim().split(/\r?\n/);
  const consumed = new Set<number>();
  const cleanHeading = (line: string) => line.trim().replace(/^#{1,6}\s+/, "").replace(/\*\*|__/g, "");
  const fieldHeading = /^(titel|title|tags|schlagwörter)(?:\s*:\s*(.*))?$/i;
  function field(names: RegExp): string | undefined {
    const index = lines.findIndex(l => {
      const match = fieldHeading.exec(cleanHeading(l));
      return match && names.test(match[1]);
    });
    if (index < 0) return undefined;
    consumed.add(index);
    const inline = fieldHeading.exec(cleanHeading(lines[index]))![2]?.trim();
    if (inline) return inline;
    let next = index + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    if (next >= lines.length || fieldHeading.test(cleanHeading(lines[next])) || /^\s*#/.test(lines[next]) || /^\s*\*\*[^*]+\*\*\s*$/.test(lines[next])) {
      throw new Error(`Kein Inhalt nach ${cleanHeading(lines[index])}.`);
    }
    consumed.add(next);
    const values = [lines[next].trim().replace(/^[-*•]\s+/, "")];
    if (names.test("tags")) {
      while (next + 1 < lines.length && /^\s*[-*•]\s+/.test(lines[next + 1])) {
        next++;
        consumed.add(next);
        values.push(lines[next].trim().replace(/^[-*•]\s+/, ""));
      }
    }
    return values.join(", ");
  }
  const explicitTitle = field(/^(titel|title)$/i);
  const explicitTags = field(/^(tags|schlagwörter)$/i);
  const primary = (explicitTitle || lines.find((l, i) => l.trim() && !consumed.has(i)) || "")
    .replace(/^#+\s*/, "").split(/(?<=[.!?])\s/)[0].trim();
  if (!primary) throw new Error("Beschreibung ist leer.");
  const suffix = " | Digital Download";
  const normalizedTitle = primary.replace(/\s*,\s*/g, " | ");
  const title = normalizedTitle.slice(0, 140 - suffix.length).replace(/[|\s]+$/g, "") + suffix;
  const stop = new Set("ein eine einer eines der die das und oder mit für von im in ist sind auf an dem den des this the and for with ein digitales poster".split(" "));
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(w => w.length > 2 && !stop.has(w)) || [];
  const phrases = tokens.flatMap((word, i) => [tokens[i + 1] ? `${word} ${tokens[i + 1]}` : word, word]);
  const candidates = explicitTags ? explicitTags.split(/[,;]/) : phrases;
  const tags = [...new Set(["digital download", "printable poster", ...candidates.map(t => t.trim().toLowerCase())])]
    .filter(t => t.length > 0 && t.length <= 20 && /^[\p{L}\p{N} -]+$/u.test(t)).slice(0, 13);
  const description = lines.filter((_, i) => !consumed.has(i)).join("\n").trim() || primary;
  return { title, tags, description: `${ensureDownloadDetails(description)}\n\nNo physical item will be shipped. Frame not included.\n\nThis artwork was created using an AI generator. The file has been upscaled and sharpened. Colors may vary depending on your screen and print settings.` };
}

export async function preparePoster(image: string, output: string) {
  // Contain preserves the complete artwork; differing aspect ratios get white margins.
  await sharp(image, { failOn: "error" }).rotate().flatten({ background: "white" })
    .resize(7087, 9449, { fit: "contain", background: "white", kernel: "lanczos3" })
    .sharpen({ sigma: 1 }).withMetadata({ density: 300 }).jpeg({ quality: 95, mozjpeg: true }).toFile(output);
  const info = await sharp(output).metadata();
  const { size } = await import("node:fs/promises").then(fs => fs.stat(output));
  if (info.width !== 7087 || info.height !== 9449 || info.density !== 300 || size > 20 * 1024 * 1024) {
    throw new Error("Druckdatei ungültig oder größer als Etsys 20-MB-Limit.");
  }
}

export async function findPosterInput(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  const images = entries.filter(e => e.isFile() && /\.(jpe?g|png)$/i.test(e.name));
  const descriptions = entries.filter(e => e.isFile() && /\.(txt|md)$/i.test(e.name));
  if (images.length !== 1) throw new Error(`Im Eingabeordner muss genau eine Bilddatei (.jpg, .jpeg oder .png) liegen; gefunden: ${images.length}.`);
  if (descriptions.length !== 1) throw new Error(`Im Eingabeordner muss genau eine Beschreibung (.txt oder .md) liegen; gefunden: ${descriptions.length}.`);
  const image = images[0];
  return {
    image: join(dir, image.name),
    stem: basename(image.name, extname(image.name)),
    text: await readFile(join(dir, descriptions[0].name), "utf8"),
  };
}

async function resumePoster(manifest: Record<string, unknown>, manifestPath: string) {
  const id = Number(manifest.listingId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Keine gespeicherte Etsy-ID. Zuerst in Etsy prüfen, ob ein Entwurf angelegt wurde.");
  const { getMyShop, getListing, getListingImages, getAllListingFiles, uploadDigitalFile, etsyFetch } = await import("./etsy.js");
  const shop = await getMyShop();
  const listing = await getListing(id);
  if (listing.shop_id !== shop.shop_id || listing.state !== "draft" || listing.title !== manifest.title || (listing.type || listing.listing_type) !== "download") throw new Error(`Entwurf ${id} passt nicht zum gespeicherten Auftrag. Bitte in Etsy prüfen.`);
  const images = await getListingImages(shop.shop_id, id);
  if (!images.length) {
    console.log(`Artikelbild für Entwurf ${id} hochladen …`);
    const form = new FormData();
    const image = String(manifest.image);
    form.append("image", new Blob([await readFile(image)]), basename(image));
    form.append("rank", "1");
    await etsyFetch(`/application/shops/${shop.shop_id}/listings/${id}/images`, { method: "POST", body: form });
  }
  const file = String(manifest.file);
  const comparable = (name: string) => name.toLowerCase().replace(/[\s_-]+/g, "");
  const files = await getAllListingFiles(shop.shop_id, id);
  if (!files.some(f => comparable(f.filename) === comparable(basename(file)))) {
    console.log(`Druckdatei für Entwurf ${id} hochladen …`);
    await uploadDigitalFile(shop.shop_id, id, file);
  }
  const [verified, gallery, uploaded, sections] = await Promise.all([
    getListing(id), getListingImages(shop.shop_id, id), getAllListingFiles(shop.shop_id, id),
    etsyFetch<{ results: Array<{ title: string; shop_section_id: number }> }>(`/application/shops/${shop.shop_id}/sections`),
  ]);
  const section = sections.results.find(s => s.title === "Poster-Digital");
  if (!gallery.length || !uploaded.some(f => comparable(f.filename) === comparable(basename(file))) || verified.state !== "draft" || verified.quantity !== 999 || !section || verified.shop_section_id !== section.shop_section_id || verified.price?.currency_code !== "EUR" || verified.price.amount / verified.price.divisor !== 1.49 || (manifest.tags as string[]).some(t => !verified.tags?.includes(t))) throw new Error(`Prüfung fehlgeschlagen; Entwurf ${id} in Etsy prüfen.`);
  manifest.etsyStatus = "needs_ai_disclosure";
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Entwurf fortgesetzt: https://www.etsy.com/your/shops/me/listing-editor/edit/${id}\nNoch erforderlich: „Mit einem KI-Generator“ auswählen und Entwurf speichern.`);
}

async function main() {
  const args = process.argv.slice(2);
  const create = args.includes("--create");
  const dirIndex = args.indexOf("--dir");
  const folder = dirIndex >= 0 ? args[dirIndex + 1] : args.find(a => !a.startsWith("--"));
  if (!folder || folder.startsWith("--")) throw new Error('Bitte Eingabeordner angeben: npm run poster:preview -- --dir "./mein-poster"');
  const dir = resolve(folder);
  const pairs = [await findPosterInput(dir)];
  for (const pair of pairs) {
    const output = join(dir, "out", "new-posters", pair.stem);
    await mkdir(output, { recursive: true });
    const manifestPath = join(output, "listing.json");
    let previous: Record<string, unknown> | undefined;
    try { previous = JSON.parse(await readFile(manifestPath, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (args.includes("--resume")) {
      if (!previous?.etsyStatus) throw new Error("Kein vorheriger Etsy-Versuch zum Fortsetzen gefunden.");
      await resumePoster(previous, manifestPath);
      continue;
    }
    if (previous?.etsyStatus) throw new Error(`Vorheriger Etsy-Versuch in ${manifestPath}. Entwurf/Status prüfen; kein automatischer Doppelversuch.`);
    const metadata = extractPosterText(pair.text);
    const file = join(output, "poster_60x80cm_300dpi.jpg");
    await preparePoster(pair.image, file);
    const manifest: Record<string, unknown> = { ...metadata, image: pair.image, file, price: 1.49, currency: "EUR", quantity: 999, section: "Poster-Digital", aiDisclosure: "MANUELL IM ETSY-EDITOR AUSWÄHLEN: Mit einem KI-Generator" };
    const save = () => writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    if (!create) { if (!previous?.etsyStatus) await save(); console.log(JSON.stringify(manifest, null, 2)); continue; }
    const { etsyFetch, getMyShop, createDigitalDraft, uploadDigitalFile, getListing, getListingImages, getAllListingFiles } = await import("./etsy.js");
    const shop = await getMyShop();
    if ((shop as typeof shop & { currency_code?: string }).currency_code !== "EUR") throw new Error("Shop-Währung muss EUR sein; keine Erstellung mit unbestätigter Währung.");
    const sections = await etsyFetch<{ results: Array<{ title: string; shop_section_id: number }> }>(`/application/shops/${shop.shop_id}/sections`);
    const section = sections.results.find(s => s.title === "Poster-Digital");
    if (!section) throw new Error('Shop-Abteilung "Poster-Digital" fehlt. Bitte in Etsy anlegen.');
    type Node = { id: number; name: string; children: Node[] };
    const tree = await etsyFetch<{ results: Node[] }>("/application/seller-taxonomy/nodes", {}, false);
    const flatten = (nodes: Node[]): Node[] => nodes.flatMap(n => [n, ...flatten(n.children || [])]);
    const taxonomy = flatten(tree.results).find(n => n.name.toLowerCase() === "digital prints");
    if (!taxonomy) throw new Error("Etsy-Kategorie Digital Prints nicht gefunden.");
    manifest.etsyStatus = "creating";
    await save();
    const source = { taxonomy_id: taxonomy.id, who_made: "i_did", when_made: "2020_2026" } as EtsyListing;
    const draft = await createDigitalDraft({ shopId: shop.shop_id, source, imageIds: [], ...metadata, price: 1.49, sectionId: section.shop_section_id });
    manifest.listingId = draft.listing_id;
    manifest.editorUrl = `https://www.etsy.com/your/shops/me/listing-editor/edit/${draft.listing_id}`;
    manifest.etsyStatus = "uploading";
    await save();
    const form = new FormData();
    form.append("image", new Blob([await readFile(pair.image)]), basename(pair.image));
    form.append("rank", "1");
    await etsyFetch(`/application/shops/${shop.shop_id}/listings/${draft.listing_id}/images`, { method: "POST", body: form });
    await uploadDigitalFile(shop.shop_id, draft.listing_id, file);
    const [listing, files, gallery] = await Promise.all([getListing(draft.listing_id), getAllListingFiles(shop.shop_id, draft.listing_id), getListingImages(shop.shop_id, draft.listing_id)]);
    if ((listing.type || listing.listing_type) !== "download" || listing.state !== "draft" || listing.quantity !== 999 || listing.shop_section_id !== section.shop_section_id || !gallery.length || !files.some(f => f.filename === basename(file)) || listing.price?.currency_code !== "EUR" || listing.price.amount / listing.price.divisor !== 1.49 || listing.title !== metadata.title || metadata.tags.some(t => !listing.tags?.includes(t))) throw new Error(`Prüfung fehlgeschlagen; Etsy-Entwurf ${draft.listing_id} manuell prüfen.`);
    manifest.etsyStatus = "needs_ai_disclosure";
    await save();
    console.log(`Entwurf erstellt: ${manifest.editorUrl}\nNoch erforderlich: „Mit einem KI-Generator“ auswählen und Entwurf speichern.`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
