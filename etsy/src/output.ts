import { mkdir, writeFile } from "node:fs/promises";
import type { EtsyListing } from "./types.js";

function money(listing: EtsyListing): string {
  const p = listing.price;
  if (!p) return "";
  return `${(p.amount / p.divisor).toFixed(2)} ${p.currency_code}`;
}

export function printListings(listings: EtsyListing[]) {
  console.table(listings.map(x => ({
    id: x.listing_id,
    type: x.listing_type || "",
    state: x.state,
    price: money(x),
    favorites: x.num_favorers ?? 0,
    title: x.title.length > 72 ? x.title.slice(0, 69) + "..." : x.title,
  })));
  console.log(`\n${listings.length} listing(s).`);
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  return `"${s.replaceAll('"', '""')}"`;
}

export async function exportListings(name: string, listings: EtsyListing[]) {
  await mkdir("out", { recursive: true });

  await writeFile(
    `out/${name}.json`,
    JSON.stringify(listings, null, 2),
    "utf8",
  );

  const rows = [
    ["listing_id", "title", "state", "listing_type", "price", "currency", "favorites", "url", "tags"],
    ...listings.map(x => [
      x.listing_id,
      x.title,
      x.state,
      x.listing_type || "",
      x.price ? (x.price.amount / x.price.divisor).toFixed(2) : "",
      x.price?.currency_code || "",
      x.num_favorers ?? 0,
      x.url || "",
      (x.tags || []).join("|"),
    ]),
  ];

  const csv = rows.map(row => row.map(csvEscape).join(",")).join("\n");
  await writeFile(`out/${name}.csv`, csv, "utf8");

  console.log(`Exported: out/${name}.json and out/${name}.csv`);
}
