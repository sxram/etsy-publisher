import "dotenv/config";
import { mkdir, readFile, writeFile, rename, open, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { etsyFetch, getMyShop, getAllShopListings, getListing, getListingImages } from "./etsy.js";
import { watermarkImage, validateStyle } from "./watermark-image.js";
import type { EtsyListingImage } from "./types.js";

type Entry = { listingId: number; title: string; originalId: number; rank: number; altText?: string; original: string; preview: string; status: "prepared" | "pending" | "applied" | "restoring" | "restored"; newId?: number };
type Manifest = { version: 1; shopId: number; text: string; opacity: number; entries: Entry[] };
const args = process.argv.slice(2);
function arg(key: string) { const i = args.indexOf(key); if (i < 0) return undefined; const v = args[i+1]; if (!v || v.startsWith("--")) throw new Error(`Missing value for ${key}`); return v; }
const states = ["active", "draft", "inactive", "expired", "sold_out"] as const;
async function upload(shop: number, e: Entry, path: string) {
  const form = new FormData();
  form.append("image", new Blob([await readFile(path)], { type: path.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream" }), "preview.jpg");
  form.append("rank", String(e.rank)); form.append("overwrite", "true");
  if (e.altText) form.append("alt_text", e.altText);
  return etsyFetch<EtsyListingImage>(`/application/shops/${shop}/listings/${e.listingId}/images`, { method: "POST", body: form });
}
async function main() {
  const allowed = new Set(["--dir", "--listing", "--text", "--opacity", "--state", "--limit", "--help"]);
  for (let i = 1; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`Unknown option: ${args[i]}`);
    if (!["--help"].includes(args[i])) { arg(args[i]); i++; }
  }
  const command = args[0];
  if (!command || command === "--help") { console.log("watermark: prepare | apply | restore [--dir out/watermark] [--listing ID] [--text GigglingHome] [--opacity 0.14] [--state active,draft] [--limit N]"); return; }
  if (!["prepare", "apply", "restore"].includes(command)) throw new Error("Unknown command");
  const dir = resolve(arg("--dir") || "out/watermark");
  await mkdir(dir, { recursive: true });
  const lockPath = join(dir, ".lock");
  const lock = await open(lockPath, "wx").catch(() => { throw new Error(`Another run is using ${dir}. After a crashed process, remove .lock only once it is stopped.`); });
  try {
    const file = join(dir, "manifest.json");
    let m: Manifest | undefined;
    try { m = JSON.parse(await readFile(file, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const save = async () => { await writeFile(file + ".tmp", JSON.stringify(m, null, 2)); await rename(file + ".tmp", file); };
    const shop = await getMyShop();
    const sections = await etsyFetch<{ results: Array<{ title: string; shop_section_id: number }> }>(`/application/shops/${shop.shop_id}/sections`);
    const allowedSections = new Set<number>();
    for (const name of ["Poster", "Poster-Digital"]) {
      const matches = sections.results.filter(section => section.title.trim() === name);
      if (matches.length !== 1 || !Number.isSafeInteger(matches[0].shop_section_id) || matches[0].shop_section_id <= 0) throw new Error(`Shop section "${name}" was not found uniquely. No images changed.`);
      allowedSections.add(matches[0].shop_section_id);
    }
    console.log("Watermark scope: Poster, Poster-Digital");
    if (command === "prepare") {
      if (m) throw new Error("This directory already contains a manifest. Use apply or a new --dir; keep earlier backups.");
      const text = arg("--text") || process.env.WATERMARK_TEXT || "GigglingHome";
      const opacity = Number(arg("--opacity") || process.env.WATERMARK_OPACITY || "0.14"); validateStyle(text, opacity);
      const id = arg("--listing");
      if (id && (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) throw new Error("Invalid listing ID");
      const selectedStates = (arg("--state") || states.join(",")).split(",");
      if (selectedStates.some(s => !states.includes(s as typeof states[number]))) throw new Error("Invalid state");
      const listings = id ? [await getListing(Number(id))] : (await Promise.all(selectedStates.map(s => getAllShopListings(shop.shop_id, s as typeof states[number])))).flat();
      const selected = [...new Map(listings.map(l => [l.listing_id, l])).values()].filter(l => l.shop_id === shop.shop_id && allowedSections.has(l.shop_section_id ?? -1));
      if (id && !selected.length) throw new Error("Listing is not in Poster or Poster-Digital in your shop.");
      m = { version: 1, shopId: shop.shop_id, text, opacity, entries: [] };
      // No remote writes: all originals and previews must exist before manifest is committed.
      for (const l of selected) {
        for (const image of await getListingImages(shop.shop_id, l.listing_id)) {
          if (!image.url_fullxfull || !Number.isInteger(image.rank) || image.rank! < 1) throw new Error("Image is missing URL or rank");
          const folder = join(dir, String(l.listing_id)); await mkdir(folder, { recursive: true });
          const original = `${l.listing_id}/${image.listing_image_id}-original.bin`, preview = `${l.listing_id}/${image.listing_image_id}-watermarked.jpg`;
          const response = await fetch(image.url_fullxfull, { signal: AbortSignal.timeout(60000) });
          if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
          await writeFile(join(dir, original), Buffer.from(await response.arrayBuffer()));
          await watermarkImage(join(dir, original), join(dir, preview), text, opacity);
          m.entries.push({ listingId: l.listing_id, title: l.title, originalId: image.listing_image_id, rank: image.rank!, altText: image.alt_text, original, preview, status: "prepared" });
          console.log(`Prepared ${l.listing_id} image ${image.rank}: ${preview}`);
        }
      }
      await save(); console.log(`${m.entries.length} previews prepared. Etsy unchanged. Inspect JPGs, then run watermark:apply.`); return;
    }
    if (!m || m.version !== 1 || m.shopId !== shop.shop_id) throw new Error("Missing/incompatible manifest or wrong shop");
    const limit = Number(arg("--limit") || Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
    if (m.entries.some(e => e.status === "pending" || e.status === "restoring")) throw new Error("An earlier upload has an uncertain outcome. Compare Etsy with the manifest and reconcile its status/newId before continuing; do not blindly retry.");
    let count = 0;
    for (const e of m.entries) {
      if (arg("--listing") && String(e.listingId) !== arg("--listing")) continue;
      if (command === "apply" ? e.status !== "prepared" : e.status !== "applied") continue;
      if (count >= limit) break;
      const live = await getListing(e.listingId);
      if (live.shop_id !== shop.shop_id || !allowedSections.has(live.shop_section_id ?? -1)) throw new Error("Listing ownership/section changed; only Poster and Poster-Digital are allowed.");
      const images = await getListingImages(shop.shop_id, e.listingId);
      const expected = command === "apply" ? e.originalId : e.newId;
      if (images.find(i => i.rank === e.rank)?.listing_image_id !== expected) throw new Error(`Image at rank ${e.rank} changed in listing ${e.listingId}; stopping.`);
      const path = join(dir, command === "apply" ? e.preview : e.original);
      await readFile(path); // Fail locally before recording a remote operation.
      e.status = command === "apply" ? "pending" : "restoring"; await save();
      const result = await upload(shop.shop_id, e, path);
      const after = await getListingImages(shop.shop_id, e.listingId);
      if (!result.listing_image_id || after.length !== images.length || after.find(i => i.rank === e.rank)?.listing_image_id !== result.listing_image_id || images.some(i => i.rank !== e.rank && !after.some(j => j.rank === i.rank && j.listing_image_id === i.listing_image_id))) throw new Error("Etsy overwrite verification failed. Inspect Etsy before continuing.");
      e.newId = result.listing_image_id; e.status = command === "apply" ? "applied" : "restored"; await save();
      console.log(`${command}: ${e.listingId} rank ${e.rank}`); count++;
    }
    console.log(`${count} images processed. Download files unchanged.`);
  } finally { await lock.close(); await unlink(lockPath); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
