import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getAllShopListings, getMyShop } from "./etsy.js";
import type { EtsyListing } from "./types.js";

const execFileAsync = promisify(execFile);

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function isDigitalDraft(listing: EtsyListing): boolean {
  const type = (listing.type || listing.listing_type || "").toLowerCase();
  const title = listing.title.toLowerCase();

  return (
    type === "download" ||
    title.includes("digital download") ||
    title.includes("printable wall art")
  );
}

function editorUrl(listingId: number): string {
  return `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`;
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function openUrl(url: string) {
  // macOS
  if (process.platform === "darwin") {
    await execFileAsync("open", [url]);
    return;
  }

  // Windows
  if (process.platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", url]);
    return;
  }

  // Linux
  await execFileAsync("xdg-open", [url]);
}

async function main() {
  const shouldOpen = hasFlag("--open");
  const delay = Number(arg("--delay") || "800");

  if (!Number.isFinite(delay) || delay < 0) {
    throw new Error("Invalid --delay value.");
  }

  const shop = await getMyShop();
  const drafts = await getAllShopListings(shop.shop_id, "draft");
  const targets = drafts.filter(isDigitalDraft);

  if (!targets.length) {
    console.log("No matching digital drafts found.");
    return;
  }

  console.log(`Found ${targets.length} digital draft(s).\n`);

  console.table(
    targets.map(listing => ({
      id: listing.listing_id,
      title:
        listing.title.length > 90
          ? listing.title.slice(0, 87) + "..."
          : listing.title,
      editor: editorUrl(listing.listing_id),
    })),
  );

  if (!shouldOpen) {
    console.log(
      "\nNothing was opened. To open all draft editors, run:\n\n" +
      "npx tsx src/open-ai-disclosure-drafts.ts --open\n"
    );
    return;
  }

  console.log(
    "\nOpening each Etsy draft editor.\n" +
    'For each listing select: "Mit einem KI-Generator", then save the draft.\n'
  );

  for (const listing of targets) {
    const url = editorUrl(listing.listing_id);

    console.log(`Opening ${listing.listing_id}: ${listing.title}`);
    await openUrl(url);

    if (delay > 0) {
      await sleep(delay);
    }
  }

  console.log(
    "\nDone opening draft editors. Etsy's Open API currently does not expose " +
    'the "How is this digital content created?" field, so this selection must ' +
    "be saved in Etsy's listing editor."
  );
}

main().catch(err => {
  console.error(
    "\nERROR:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
