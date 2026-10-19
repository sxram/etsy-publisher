import { getAllShopListings, getMyShop, getListing, etsyFetch } from "./etsy.js";

type Money = {
  amount: number;
  divisor: number;
  currency_code?: string;
};

type Offering = {
  offering_id?: number;
  quantity: number;
  is_enabled: boolean;
  is_deleted?: boolean;
  price: Money | number;
  readiness_state_id?: number | null;
};

type PropertyValue = {
  property_id: number;
  property_name?: string;
  scale_id?: number | null;
  scale_name?: string | null;
  value_ids?: number[];
  values?: string[];
  value_pairs?: unknown;
};

type Product = {
  product_id?: number;
  sku?: string;
  is_deleted?: boolean;
  offerings: Offering[];
  property_values?: PropertyValue[];
};

type Inventory = {
  products: Product[];
  price_on_property?: number[];
  quantity_on_property?: number[];
  sku_on_property?: number[];
  readiness_state_on_property?: number[];
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function moneyToNumber(value: Money | number): number {
  if (typeof value === "number") return value;
  return value.amount / value.divisor;
}

function inventoryPrices(inv: Inventory): number[] {
  return inv.products.flatMap(product =>
    (product.offerings || []).map(offering => moneyToNumber(offering.price))
  );
}

async function getInventory(listingId: number): Promise<Inventory> {
  return etsyFetch<Inventory>(
    `/application/listings/${listingId}/inventory`
  );
}

function buildInventoryPayload(inv: Inventory, newPrice: number) {
  const products = inv.products.map(product => ({
    sku: product.sku ?? "",
    property_values: (product.property_values || []).map(value => ({
      property_id: value.property_id,
      ...(value.property_name !== undefined
        ? { property_name: value.property_name }
        : {}),
      scale_id: value.scale_id ?? null,
      value_ids: value.value_ids || [],
      values: value.values || [],
    })),
    offerings: (product.offerings || []).map(offering => ({
      quantity: offering.quantity,
      is_enabled: offering.is_enabled,
      price: newPrice,
      ...(offering.readiness_state_id != null
        ? { readiness_state_id: offering.readiness_state_id }
        : {}),
    })),
  }));

  return {
    products,
    price_on_property: inv.price_on_property || [],
    quantity_on_property: inv.quantity_on_property || [],
    sku_on_property: inv.sku_on_property || [],
    ...(inv.readiness_state_on_property !== undefined
      ? { readiness_state_on_property: inv.readiness_state_on_property }
      : {}),
  };
}

async function updateInventoryPrice(
  listingId: number,
  inv: Inventory,
  newPrice: number,
): Promise<void> {
  const payload = buildInventoryPayload(inv, newPrice);

  await etsyFetch(
    `/application/listings/${listingId}/inventory`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
}

function allPricesEqual(prices: number[], expected: number): boolean {
  return (
    prices.length > 0 &&
    prices.every(price => Math.abs(price - expected) < 0.001)
  );
}

function formatPrices(prices: number[]): string {
  if (!prices.length) return "?";
  return [...new Set(prices.map(p => p.toFixed(2)))].join(", ");
}

async function main() {
  const mode = process.argv[2];

  if (!["preview", "update"].includes(mode || "")) {
    throw new Error(
      "Usage:\n" +
      "  npx tsx src/price-drafts.ts preview --price 2.49 [--state draft|active]\n" +
      "  npx tsx src/price-drafts.ts update --price 2.49 [--state draft|active] --confirm"
    );
  }

  if (hasFlag("--state") && !arg("--state")) throw new Error("Missing value for --state.");
  const stateRaw = arg("--state") ?? "draft";
  if (stateRaw !== "draft" && stateRaw !== "active") {
    throw new Error("--state must be draft or active (default: draft).");
  }
  const state = stateRaw;

  const priceRaw = arg("--price") || "2.49";
  const newPrice = Number(priceRaw.replace(",", "."));

  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    throw new Error(`Invalid --price value: ${priceRaw}`);
  }

  const shop = await getMyShop();
  const sections = await etsyFetch<{ results: Array<{ shop_section_id: number; title: string }> }>(
    `/application/shops/${shop.shop_id}/sections`
  );
  const matches = sections.results.filter(section => section.title.trim() === "Poster-Digital");
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0].shop_section_id) || matches[0].shop_section_id <= 0) {
    throw new Error('Shop section "Poster-Digital" was not found uniquely. No prices changed.');
  }
  const sectionId = matches[0].shop_section_id;
  const listings = await getAllShopListings(shop.shop_id, state);
  const targets = listings.filter(listing => listing.shop_section_id === sectionId);
  console.log(`Shop section: Poster-Digital (${sectionId}), state: ${state}`);

  if (!targets.length) {
    console.log(`No ${state} listings in Poster-Digital found.`);
    return;
  }

  console.log(`Found ${targets.length} ${state} listing(s) in Poster-Digital.\n`);

  const rows: Array<{
    id: number;
    currentPrice: string;
    newPrice: string;
    offerings: number;
    title: string;
  }> = [];

  const inventories = new Map<number, Inventory>();

  for (const listing of targets) {
    const inv = await getInventory(listing.listing_id);
    inventories.set(listing.listing_id, inv);

    const prices = inventoryPrices(inv);

    rows.push({
      id: listing.listing_id,
      currentPrice: formatPrices(prices),
      newPrice: newPrice.toFixed(2),
      offerings: prices.length,
      title:
        listing.title.length > 70
          ? listing.title.slice(0, 67) + "..."
          : listing.title,
    });
  }

  console.table(rows);

  if (mode === "preview") {
    console.log("\nPreview only. Nothing was changed.");
    return;
  }

  if (!hasFlag("--confirm")) {
    throw new Error(
      "No prices changed. Run preview first, then add --confirm."
    );
  }

  const results: Array<{
    id: number;
    result: string;
    verifiedPrice: string;
  }> = [];

  for (const listing of targets) {
    try {
      const inv = inventories.get(listing.listing_id);

      if (!inv) {
        throw new Error("Inventory was not loaded.");
      }

      if (!inv.products?.length) {
        throw new Error("Listing has no inventory products.");
      }

      const beforePrices = inventoryPrices(inv);

      if (allPricesEqual(beforePrices, newPrice)) {
        results.push({
          id: listing.listing_id,
          result: "SKIPPED: already correct",
          verifiedPrice: formatPrices(beforePrices),
        });
        continue;
      }

      console.log(
        `Updating ${listing.listing_id}: ${formatPrices(beforePrices)} -> ${newPrice.toFixed(2)}`
      );

      const current = await getListing(listing.listing_id);
      if (current.shop_id !== shop.shop_id || current.shop_section_id !== sectionId || current.state !== state) {
        throw new Error('Listing shop, section or state changed. Price update skipped.');
      }
      await updateInventoryPrice(listing.listing_id, inv, newPrice);

      const verified = await getInventory(listing.listing_id);
      const afterPrices = inventoryPrices(verified);

      if (!allPricesEqual(afterPrices, newPrice)) {
        throw new Error(
          `Verification failed. Etsy inventory now reports: ${formatPrices(afterPrices)}`
        );
      }

      results.push({
        id: listing.listing_id,
        result: "UPDATED + VERIFIED",
        verifiedPrice: formatPrices(afterPrices),
      });
    } catch (err) {
      results.push({
        id: listing.listing_id,
        result: `FAILED: ${err instanceof Error ? err.message : String(err)}`,
        verifiedPrice: "-",
      });
    }
  }

  console.log("\nPRICE UPDATE RESULT");
  console.table(results);

  const failed = results.filter(r => r.result.startsWith("FAILED"));
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error("\nERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});
