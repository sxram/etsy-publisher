import { config } from "./config.js";
import { authenticate } from "./auth.js";
import {
  createDigitalDraft,
  getAllListingFiles,
  getAllShopListings,
  getListing,
  getListingImages,
  getMyShop,
  getMyUserId,
  setListingInstantDownload,
  uploadDigitalFile,
} from "./etsy.js";
import { isLikelyPhysicalPoster } from "./posters.js";
import { exportListings, printListings } from "./output.js";
import {
  chooseBestGroup,
  normalizedKey,
  primaryListingTitle,
  scanDigitalFileGroups,
} from "./digital-files.js";
import { makeDigitalDescription, makeDigitalTags, makeDigitalTitle } from "./digital-listing.js";
import type { DigitalFileGroup, EtsyListing, EtsyListingFile } from "./types.js";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function requiredArg(name: string) {
  const v = arg(name);
  if (!v) throw new Error(`Missing argument ${name}`);
  return v;
}

function directoryArg() {
  return arg("--dir") || config.digitalFilesDir;
}

function printGroup(group: { displayName: string; files: string[] }) {
  console.log(`\n✓ ${group.displayName}`);
  for (const f of group.files) console.log(`  - ${f.split(/[\\/]/).pop()}`);
}

function isSafeMatch(score: number, secondScore: number) {
  return score >= 0.45 && score - secondScore >= 0.06;
}

type BatchMatch = {
  source: EtsyListing;
  group?: DigitalFileGroup;
  score: number;
  secondScore: number;
  status: "READY" | "AMBIGUOUS" | "GROUP_REUSED" | "EXISTS";
  reason?: string;
  newTitle: string;
};

async function resolveSourceAndGroup() {
  const listingId = Number(requiredArg("--listing"));
  if (!Number.isFinite(listingId)) throw new Error("--listing must be a numeric Etsy listing ID.");

  const dir = directoryArg();
  const source = await getListing(listingId);
  const groups = await scanDigitalFileGroups(dir);
  const explicitGroup = arg("--group");
  let selected;

  if (explicitGroup) {
    selected = groups.find(g => g.displayName.toLowerCase() === explicitGroup.toLowerCase());
    if (!selected) throw new Error(`No exact group named "${explicitGroup}" found in ${dir}`);
  } else {
    const best = chooseBestGroup(groups, source.title);
    if (!isSafeMatch(best.score, best.secondScore)) {
      console.error(`\nCould not safely auto-match files to:\n  ${source.title}`);
      console.error(`  Primary title used for matching: ${primaryListingTitle(source.title)}\n`);
      console.error("Top candidates:");
      for (const item of best.ranked.slice(0, 5)) {
        console.error(`  ${item.score.toFixed(3)}  ${item.group.displayName}`);
      }
      console.error("\nAvailable groups:");
      for (const g of groups) printGroup(g);
      throw new Error(`Ambiguous file match. Re-run with --group "EXACT GROUP NAME".`);
    }
    selected = best.group;
  }

  return { source, group: selected };
}

function existingTitleSet(listings: EtsyListing[]) {
  return new Set(listings.map(x => normalizedKey(x.title)));
}

async function buildBatchMatches(): Promise<BatchMatch[]> {
  const dir = directoryArg();
  const shop = await getMyShop();
  const [active, drafts] = await Promise.all([
    getAllShopListings(shop.shop_id, "active"),
    getAllShopListings(shop.shop_id, "draft"),
  ]);

  const posters = active.filter(isLikelyPhysicalPoster);
  const groups = await scanDigitalFileGroups(dir);
  const existingTitles = existingTitleSet([...active, ...drafts]);

  const matches: BatchMatch[] = posters.map(source => {
    const newTitle = makeDigitalTitle(source.title);
    const best = chooseBestGroup(groups, source.title);
    const safe = isSafeMatch(best.score, best.secondScore);

    if (existingTitles.has(normalizedKey(newTitle))) {
      return {
        source,
        group: best.group,
        score: best.score,
        secondScore: best.secondScore,
        status: "EXISTS",
        reason: "A listing with the generated digital title already exists.",
        newTitle,
      };
    }

    if (!safe) {
      return {
        source,
        group: best.group,
        score: best.score,
        secondScore: best.secondScore,
        status: "AMBIGUOUS",
        reason: "Automatic filename match is not clear enough.",
        newTitle,
      };
    }

    return {
      source,
      group: best.group,
      score: best.score,
      secondScore: best.secondScore,
      status: "READY",
      newTitle,
    };
  });

  // Never let one local file group silently feed multiple source listings.
  const groupUsers = new Map<string, BatchMatch[]>();
  for (const m of matches) {
    if (m.status !== "READY" || !m.group) continue;
    const arr = groupUsers.get(m.group.key) ?? [];
    arr.push(m);
    groupUsers.set(m.group.key, arr);
  }
  for (const users of groupUsers.values()) {
    if (users.length <= 1) continue;
    for (const m of users) {
      m.status = "GROUP_REUSED";
      m.reason = "The same local file group matched more than one Etsy listing.";
    }
  }

  return matches;
}

function printBatchTable(matches: BatchMatch[]) {
  console.table(matches.map(m => ({
    id: m.source.listing_id,
    status: m.status,
    score: m.score.toFixed(3),
    gap: (m.score - m.secondScore).toFixed(3),
    files: m.group?.files.length ?? 0,
    etsy: primaryListingTitle(m.source.title).slice(0, 42),
    local: (m.group?.displayName ?? "-").slice(0, 48),
    digitalTitle: m.newTitle.slice(0, 70),
  })));

  const counts = matches.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\nSummary:", counts);
}

function localFileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function comparableFileName(value: string) {
  const name = localFileName(value).normalize("NFKD").toLowerCase();
  const dot = name.lastIndexOf(".");
  const stem = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : "";

  // Etsy may remove spaces from digital file names when storing them.
  // Ignore separators so these compare as the same file:
  // "Purple Alien ..._300dpi.jpg"
  // "PurpleAlien..._300dpi.jpg"
  return stem.replace(/[\s_-]+/g, "") + ext;
}

function printVerifiedFiles(files: EtsyListingFile[]) {
  console.log("\nUploaded files confirmed by Etsy:");
  for (const file of files.sort((a, b) => a.rank - b.rank)) {
    const size = file.size_bytes ? ` (${(file.size_bytes / 1024 / 1024).toFixed(1)} MB)` : "";
    console.log(`✓ ${file.filename}${size}`);
  }
}

async function finalizeAndVerifyDigitalListing(
  shopId: number,
  listingId: number,
  expectedFiles: string[],
  whoMade = "i_did",
) {
  await setListingInstantDownload(shopId, listingId, whoMade);

  const [listing, files] = await Promise.all([
    getListing(listingId),
    getAllListingFiles(shopId, listingId),
  ]);

  const remoteNames = new Set(files.map(f => comparableFileName(f.filename)));
  const missing = expectedFiles
    .map(localFileName)
    .filter(name => !remoteNames.has(comparableFileName(name)));

  if (missing.length) {
    throw new Error(`verification failed: Etsy does not report these uploaded files: ${missing.join(", ")}`);
  }

  const type = (listing.type || listing.listing_type || "").toLowerCase();
  if (type && type !== "download") {
    throw new Error(`verification failed: listing type is '${type}', expected 'download'.`);
  }

  printVerifiedFiles(files);
  console.log(`Listing type: ${type || "download (PATCH accepted)"}`);
  return { listing, files };
}

async function createOneDigitalDraft(source: EtsyListing, group: DigitalFileGroup) {
  const shop = await getMyShop();
  let stage = "loading listing images";

  try {
    const images = source.images?.length
      ? source.images
      : await getListingImages(shop.shop_id, source.listing_id);

    const imageIds = images
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
      .map(x => x.listing_image_id);

    stage = "creating Etsy draft";
    const draft = await createDigitalDraft({
      shopId: shop.shop_id,
      source,
      imageIds,
      title: makeDigitalTitle(source.title),
      description: makeDigitalDescription(source, group),
      tags: makeDigitalTags(source),
      price: config.digitalPrice,
    });

    stage = "uploading digital files";
    for (let i = 0; i < group.files.length; i++) {
      await uploadDigitalFile(shop.shop_id, draft.listing_id, group.files[i], i + 1);
    }

    stage = "finalizing digital listing";
    await finalizeAndVerifyDigitalListing(shop.shop_id, draft.listing_id, group.files, source.who_made || "i_did");

    return draft;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${stage}: ${message}`);
  }
}


async function resumeExistingDraft(source: EtsyListing, group: DigitalFileGroup) {
  const shop = await getMyShop();
  const drafts = await getAllShopListings(shop.shop_id, "draft");
  const expectedTitle = makeDigitalTitle(source.title);
  const explicitDraftId = arg("--draft");

  let candidates = drafts.filter(d => normalizedKey(d.title) === normalizedKey(expectedTitle));

  if (explicitDraftId) {
    const draftId = Number(explicitDraftId);
    if (!Number.isFinite(draftId)) throw new Error("--draft must be a numeric Etsy listing ID.");
    const selected = drafts.find(d => d.listing_id === draftId);
    if (!selected) throw new Error(`Draft ${draftId} was not found in your Etsy draft listings.`);
    if (normalizedKey(selected.title) !== normalizedKey(expectedTitle) && !hasFlag("--force")) {
      throw new Error(`Draft ${draftId} does not have the expected generated title. Use --force only if you intentionally want to upload these files to that draft.`);
    }
    candidates = [selected];
  }

  if (!candidates.length) {
    throw new Error(`No matching Etsy draft found for:\n${expectedTitle}\nUse digital:create if you want to create a new draft.`);
  }

  if (candidates.length > 1) {
    console.error("\nMultiple matching drafts exist. Choose one explicitly with --draft <id>:\n");
    for (const draft of candidates) {
      console.error(`  ${draft.listing_id}  ${draft.title}`);
    }
    throw new Error("Multiple matching drafts found; refusing to guess.");
  }

  const draft = candidates[0];
  console.log("\nRESUMING EXISTING DRAFT");
  console.log(`Draft ID: ${draft.listing_id}`);
  console.log(`Title:    ${draft.title}`);
  printGroup(group);

  // Etsy returns an empty file list for a listing that is still physical,
  // even when a previous upload already attached files. Convert the draft
  // to a digital listing first so existing files become visible to the API.
  console.log("  Switching draft to digital download mode ...");
  await setListingInstantDownload(shop.shop_id, draft.listing_id, source.who_made || "i_did");

  const existingFiles = await getAllListingFiles(shop.shop_id, draft.listing_id);
  const existingNames = new Set(existingFiles.map(f => comparableFileName(f.filename)));
  let uploaded = 0;

  if (existingFiles.length) {
    console.log("  Existing Etsy files:");
    for (const file of existingFiles.sort((a, b) => a.rank - b.rank)) {
      console.log(`  ✓ ${file.filename}`);
    }
  }

  for (let i = 0; i < group.files.length; i++) {
    const file = group.files[i];
    const name = localFileName(file);
    if (existingNames.has(comparableFileName(name))) {
      console.log(`  Already on Etsy, skipping: ${name}`);
      continue;
    }
    console.log(`  Uploading ${name} ...`);
    await uploadDigitalFile(shop.shop_id, draft.listing_id, file, i + 1);
    uploaded++;
  }

  console.log("  Verifying digital listing ...");
  await finalizeAndVerifyDigitalListing(shop.shop_id, draft.listing_id, group.files, source.who_made || "i_did");

  console.log("\nSUCCESS");
  console.log(`Resumed Etsy draft: ${draft.listing_id}`);
  console.log(`${uploaded} new file(s) uploaded; ${group.files.length} expected file(s) verified.`);
  console.log("The listing remains a DRAFT and was NOT published.");
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === "auth") {
    await authenticate();
    return;
  }

  if (cmd === "whoami") {
    const userId = await getMyUserId();
    const shop = await getMyShop();
    console.log({
      userId,
      shopId: shop.shop_id,
      shopName: shop.shop_name,
      activeListings: shop.listing_active_count,
      digitalListings: shop.digital_listing_count,
    });
    return;
  }

  if (cmd === "digital:scan") {
    const dir = directoryArg();
    const groups = await scanDigitalFileGroups(dir);
    console.log(`\nDigital product groups found in ${dir}:`);
    for (const g of groups) printGroup(g);
    console.log(`\n${groups.length} product group(s).`);
    return;
  }

  if (cmd === "digital:preview") {
    const { source, group } = await resolveSourceAndGroup();
    console.log("\nSOURCE ETSY LISTING");
    console.log(`ID:    ${source.listing_id}`);
    console.log(`Title: ${source.title}`);
    console.log(`Primary title: ${primaryListingTitle(source.title)}`);
    console.log("\nMATCHED DIGITAL FILES");
    printGroup(group);
    console.log("\nNEW DRAFT TITLE");
    console.log(makeDigitalTitle(source.title));
    console.log(`Length: ${makeDigitalTitle(source.title).length}/140`);
    console.log("\nPRICE");
    console.log(`${config.digitalPrice.toFixed(2)} (shop currency)`);
    console.log("\nINSTANT DOWNLOAD MODE");
    console.log(`when_made=${config.digitalWhenMade} (not made_to_order)`);
    console.log("\nTAGS");
    console.log(makeDigitalTags(source).join(", "));
    console.log("\nDESCRIPTION");
    console.log(makeDigitalDescription(source, group));
    console.log("\nNothing has been written to Etsy.");
    return;
  }

  if (cmd === "digital:resume") {
    const { source, group } = await resolveSourceAndGroup();
    await resumeExistingDraft(source, group);
    return;
  }

  if (cmd === "digital:create") {
    const { source, group } = await resolveSourceAndGroup();
    const shop = await getMyShop();
    const [active, drafts] = await Promise.all([
      getAllShopListings(shop.shop_id, "active"),
      getAllShopListings(shop.shop_id, "draft"),
    ]);
    const newTitle = makeDigitalTitle(source.title);
    if (!hasFlag("--force") && existingTitleSet([...active, ...drafts]).has(normalizedKey(newTitle))) {
      throw new Error(`A listing with the generated title already exists. Use --force only if you intentionally want a duplicate.\n${newTitle}`);
    }

    console.log("\nAbout to create ONE Etsy digital draft:");
    console.log(`Source: ${source.listing_id} — ${source.title}`);
    console.log(`New title: ${newTitle}`);
    printGroup(group);

    try {
      const draft = await createOneDigitalDraft(source, group);
      console.log("\nSUCCESS");
      console.log(`Digital Etsy draft: ${draft.listing_id}`);
      console.log(`${group.files.length} file(s) uploaded.`);
      console.log("The listing remains a DRAFT and was NOT published.");
    } catch (error) {
      console.error("\nA draft may have been created before the upload failed. Nothing was published.");
      throw error;
    }
    return;
  }

  if (cmd === "digital:preview-all") {
    const matches = await buildBatchMatches();
    console.log("\nBATCH PREVIEW — no Etsy changes will be made\n");
    printBatchTable(matches);
    console.log("\nREADY items can be created with:");
    console.log(`npm run digital:create-all -- --dir ${directoryArg()} --confirm`);
    return;
  }

  if (cmd === "digital:create-all") {
    const matches = await buildBatchMatches();
    console.log("\nBATCH PLAN\n");
    printBatchTable(matches);

    const ready = matches.filter(m => m.status === "READY" && m.group);
    if (!hasFlag("--confirm")) {
      console.log("\nNothing has been written to Etsy.");
      console.log("To create all READY items as drafts, run again with --confirm:");
      console.log(`npm run digital:create-all -- --dir ${directoryArg()} --confirm`);
      return;
    }

    if (!ready.length) {
      console.log("\nNo READY items. Nothing to create.");
      return;
    }

    const results: Array<{ id: number; title: string; result: string; draft?: number }> = [];
    for (const m of ready) {
      console.log(`\n[${results.length + 1}/${ready.length}] ${m.source.listing_id} — ${primaryListingTitle(m.source.title)}`);
      console.log(`  ${m.group!.files.length} file(s): ${m.group!.displayName}`);
      try {
        const draft = await createOneDigitalDraft(m.source, m.group!);
        console.log(`  ✓ Draft ${draft.listing_id}`);
        results.push({ id: m.source.listing_id, title: primaryListingTitle(m.source.title), result: "CREATED", draft: draft.listing_id });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  ✗ FAILED: ${message}`);
        results.push({ id: m.source.listing_id, title: primaryListingTitle(m.source.title), result: `FAILED: ${message}` });
      }
    }

    console.log("\nBATCH RESULT");
    console.table(results);
    console.log("\nAll successfully created listings remain DRAFTS. Nothing was published.");
    return;
  }

  const shop = await getMyShop();
  const listings = await getAllShopListings(shop.shop_id, "active");

  if (cmd === "list") {
    printListings(listings);
    await exportListings("active-listings", listings);
    return;
  }

  if (cmd === "posters") {
    const posters = listings.filter(isLikelyPhysicalPoster);
    printListings(posters);
    await exportListings("physical-posters", posters);
    return;
  }

  console.log(`
Usage:
  npm run auth
  npm run whoami
  npm run list
  npm run posters

Single listing:
  npm run digital:preview -- --listing 1234567890 --dir ./originals
  npm run digital:create  -- --listing 1234567890 --dir ./originals
  npm run digital:resume  -- --listing 1234567890 --dir ./originals

All physical poster listings:
  npm run digital:preview-all -- --dir ./originals
  npm run digital:create-all  -- --dir ./originals
  npm run digital:create-all  -- --dir ./originals --confirm

Utilities:
  npm run digital:scan -- --dir ./originals

If a single match is ambiguous:
  npm run digital:preview -- --listing 1234567890 --dir ./originals --group "Yellow Alien Space Poster_Pip_Comet"

If a failed create already left a draft behind, use digital:resume instead of creating another one.
If multiple matching drafts exist, add --draft <draft_id>.
Use --force only when you deliberately want to bypass a title-safety check.
`);
}

main().catch(err => {
  console.error("\nERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});
