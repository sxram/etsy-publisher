import "dotenv/config";
import { mkdir, readFile, writeFile, rename, open, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { resolve, join } from "node:path";
import { etsyFetch, getMyShop, getAllShopListings, getListing, getListingImages } from "./etsy.js";
import { createMainMockup } from "./mockup-image.js";
import type { EtsyListingImage } from "./types.js";

type Entry = { listingId: number; title: string; originalId: number; rank: number; altText?: string; original: string; preview: string; status: "prepared" | "pending" | "applied" | "restoring" | "restored"; newId?: number; operation?: "insert"; previousIds?: number[] };
type Manifest = { version: 1; kind: "main-mockup"; shopId: number; entries: Entry[] };
const args = process.argv.slice(2);
function arg(key: string) { const i = args.indexOf(key); if (i < 0) return undefined; const v = args[i+1]; if (!v || v.startsWith("--")) throw new Error(`Missing value for ${key}`); return v; }
const states = ["active", "draft", "inactive", "expired", "sold_out"] as const;
async function upload(shop: number, e: Entry, path: string) {
  const form = new FormData();
  form.append("image", new Blob([await readFile(path)], { type: path.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream" }), "preview.jpg");
  form.append("rank", String(e.rank)); form.append("overwrite", "false");
  if (e.altText) form.append("alt_text", e.altText);
  return etsyFetch<EtsyListingImage>(`/application/shops/${shop}/listings/${e.listingId}/images`, { method: "POST", body: form });
}
function matchesGallery(images: EtsyListingImage[], ids: number[], inserted = false) {
  if (images.length !== ids.length || new Set(images.map(image => image.listing_image_id)).size !== ids.length) return false;
  const rankOf = (id: number) => images.find(image => image.listing_image_id === id)?.rank;
  if (ids.every((id, index) => rankOf(id) === index + 1)) return true;
  // Etsy may return the new image at rank 1 without incrementing old ranks.
  // Accept only this exact ID/rank pattern, not arbitrary duplicate ranks.
  return inserted && ids.length > 1 && rankOf(ids[0]) === 1 && ids.slice(1).every((id, index) => rankOf(id) === index + 1);
}
async function verifyGallery(shopId: number, listingId: number, ids: number[], inserted = false) {
  let last: EtsyListingImage[] = [];
  for (const waitMs of [0, 1000, 2000, 4000, 8000]) {
    if (waitMs) { console.log(`Waiting ${waitMs / 1000}s for Etsy gallery verification: ${listingId}`); await delay(waitMs); }
    last = await getListingImages(shopId, listingId);
    if (matchesGallery(last, ids, inserted)) return;
  }
  throw new Error(`Gallery verification failed for ${listingId}. Expected IDs by rank: ${ids.join(", ")}. Actual: ${[...last].sort((a,b) => a.rank! - b.rank!).map(i => `${i.rank}:${i.listing_image_id}`).join(", ")}. No upload will be retried. Run mockup:reconcile after checking Etsy.`);
}
async function main() {
  const allowed = new Set(["--dir", "--listing", "--state", "--limit", "--help"]);
  for (let i = 1; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`Unknown option: ${args[i]}`);
    if (!["--help"].includes(args[i])) { arg(args[i]); i++; }
  }
  const command = args[0];
  if (!command || command === "--help") { console.log("mockup: prepare | apply | restore | reconcile [--dir out/mockup] [--listing ID] [--state active,draft] [--limit N]"); return; }
  if (!["prepare", "apply", "restore", "reconcile"].includes(command)) throw new Error("Unknown command");
  const dir = resolve(arg("--dir") || "out/mockup");
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
    console.log("Main mockup scope: Poster, Poster-Digital");
    if (command === "prepare") {
      if (m) throw new Error("This directory already contains a manifest. Use apply or a new --dir; keep earlier backups.");
      const id = arg("--listing");
      if (id && (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) throw new Error("Invalid listing ID");
      const selectedStates = (arg("--state") || states.join(",")).split(",");
      if (selectedStates.some(s => !states.includes(s as typeof states[number]))) throw new Error("Invalid state");
      const listings = id ? [await getListing(Number(id))] : (await Promise.all(selectedStates.map(s => getAllShopListings(shop.shop_id, s as typeof states[number])))).flat();
      const selected = [...new Map(listings.map(l => [l.listing_id, l])).values()].filter(l => l.shop_id === shop.shop_id && allowedSections.has(l.shop_section_id ?? -1));
      if (id && !selected.length) throw new Error("Listing is not in Poster or Poster-Digital in your shop.");
      m = { version: 1, kind: "main-mockup", shopId: shop.shop_id, entries: [] };
      // No remote writes: all originals and previews must exist before manifest is committed.
      for (const l of selected) {
        const images = await getListingImages(shop.shop_id, l.listing_id);
        const primary = images.filter(image => image.rank === 1);
        if (primary.length !== 1) throw new Error(`Listing ${l.listing_id} has no unique rank-1 image.`);
        for (const image of primary) {
          if (!image.url_fullxfull || !Number.isInteger(image.rank) || image.rank! < 1) throw new Error("Image is missing URL or rank");
          const folder = join(dir, String(l.listing_id)); await mkdir(folder, { recursive: true });
          const original = `${l.listing_id}/${image.listing_image_id}-original.bin`, preview = `${l.listing_id}/${image.listing_image_id}-main-mockup.jpg`;
          const response = await fetch(image.url_fullxfull, { signal: AbortSignal.timeout(60000) });
          if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
          await writeFile(join(dir, original), Buffer.from(await response.arrayBuffer()));
          await createMainMockup(join(dir, original), join(dir, preview), l.shop_section_id === sections.results.find(section => section.title.trim() === "Poster-Digital")!.shop_section_id);
          m.entries.push({ listingId: l.listing_id, title: l.title, originalId: image.listing_image_id, rank: image.rank!, altText: image.alt_text, original, preview, status: "prepared" });
          console.log(`Prepared ${l.listing_id} image ${image.rank}: ${preview}`);
        }
      }
      await save(); console.log(`${m.entries.length} previews prepared. Etsy unchanged. Inspect JPGs, then run mockup:apply.`); return;
    }
    if (!m || m.kind !== "main-mockup" || m.version !== 1 || m.shopId !== shop.shop_id) throw new Error("Missing/incompatible manifest or wrong shop");
    const limit = Number(arg("--limit") || Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
    if (command === "reconcile") {
      let count = 0;
      for (const entry of m.entries) {
        if (!["pending", "restoring"].includes(entry.status)) continue;
        if (arg("--listing") && String(entry.listingId) !== arg("--listing")) continue;
        if (count >= limit) break;
        if (entry.operation !== "insert" || !entry.newId || !entry.previousIds?.length) throw new Error(`Cannot reconcile ${entry.listingId}: insertion metadata/newId missing. Inspect Etsy manually; no upload was attempted.`);
        const live = await getListing(entry.listingId);
        if (live.shop_id !== shop.shop_id || !allowedSections.has(live.shop_section_id ?? -1)) throw new Error("Listing ownership/section changed.");
        const expectedIds = entry.status === "pending" ? [entry.newId, ...entry.previousIds] : entry.previousIds;
        await verifyGallery(shop.shop_id, entry.listingId, expectedIds, entry.status === "pending");
        entry.status = entry.status === "pending" ? "applied" : "restored";
        await save(); count++;
        console.log(`Reconciled ${entry.listingId}: ${entry.status}. No images changed.`);
      }
      console.log(`${count} uncertain entries reconciled.`); return;
    }
    if (m.entries.some(e => e.status === "pending" || e.status === "restoring")) throw new Error(`An earlier upload has an uncertain outcome. Run npm run mockup:reconcile -- --dir "${dir}" before continuing; do not blindly retry.`);
    let count = 0;
    for (const e of m.entries) {
      if (e.rank !== 1) throw new Error("Mockup manifest may only contain rank-1 images.");
      if (arg("--listing") && String(e.listingId) !== arg("--listing")) continue;
      if (command === "apply" ? e.status !== "prepared" : e.status !== "applied") continue;
      if (count >= limit) break;
      const live = await getListing(e.listingId);
      if (live.shop_id !== shop.shop_id || !allowedSections.has(live.shop_section_id ?? -1)) throw new Error("Listing ownership/section changed; only Poster and Poster-Digital are allowed.");
      const images = await getListingImages(shop.shop_id, e.listingId);
      const expected = command === "apply" ? e.originalId : e.newId;
      if ((command === "apply" ? images.find(i => i.rank === e.rank)?.listing_image_id : images.find(i => i.listing_image_id === expected && i.rank === 1)?.listing_image_id) !== expected) throw new Error(`Image at rank ${e.rank} changed in listing ${e.listingId}; stopping.`);
      const ordered = [...images].sort((a, b) => a.rank! - b.rank!);
      if (command === "apply" && ordered.some((image, index) => image.rank !== index + 1)) throw new Error("Gallery ranks are not consecutive; stopping.");
      if (command === "apply") {
        if (images.length >= 20) throw new Error("Gallery has 20 images. No image was removed; free a slot manually before inserting a mockup.");
        const path = join(dir, e.preview);
        await readFile(path);
        e.operation = "insert";
        e.previousIds = ordered.map(image => image.listing_image_id);
        e.status = "pending"; await save();
        const result = await upload(shop.shop_id, e, path);
        if (!result.listing_image_id) throw new Error("Upload returned no image ID. Inspect Etsy before continuing.");
        e.newId = result.listing_image_id; await save();
        await verifyGallery(shop.shop_id, e.listingId, [e.newId, ...e.previousIds], true);
        e.status = "applied"; await save();
      } else {
        if (e.operation !== "insert" || !e.previousIds || !e.newId) throw new Error("This entry was applied by the old replacement workflow. Use the previous script version to restore it; it cannot be removed as an inserted image.");
        const expectedIds = [e.newId, ...e.previousIds];
        if (!matchesGallery(images, expectedIds, true)) throw new Error("Gallery changed since insertion; inspect Etsy before removing the mockup.");
        e.status = "restoring"; await save();
        await etsyFetch(`/application/shops/${shop.shop_id}/listings/${e.listingId}/images/${e.newId}`, { method: "DELETE" });
        await verifyGallery(shop.shop_id, e.listingId, e.previousIds);
        e.status = "restored"; await save();
      }
      console.log(`${command}: ${e.listingId} rank ${e.rank}`); count++;
    }
    console.log(`${count} images processed. Download files unchanged.`);
  } finally { await lock.close(); await unlink(lockPath); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
