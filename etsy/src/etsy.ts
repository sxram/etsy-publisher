import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { API_BASE, config } from "./config.js";
import { loadToken, saveToken } from "./token-store.js";
import type { EtsyListing, EtsyListingFile, EtsyListingImage, EtsyShop, EtsyToken } from "./types.js";

function xApiKey() { return `${config.apiKey}:${config.sharedSecret}`; }

export async function fetchEtsyResponse(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(120_000) });
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    const code = cause?.code || (error instanceof Error ? error.name : "unknown");
    const target = new URL(url);
    throw new Error(`Etsy-Verbindungsfehler bei ${init.method || "GET"} ${target.hostname}${target.pathname} (${code}). Verbindung, DNS, VPN oder Proxy prüfen. Schreibzugriffe werden nicht automatisch wiederholt.`, { cause: error });
  }
}

async function refreshToken(token: EtsyToken): Promise<EtsyToken> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.apiKey,
    refresh_token: token.refresh_token,
  });
  const res = await fetchEtsyResponse(`${API_BASE}/public/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token refresh failed ${res.status}: ${await res.text()}`);
  const fresh = await res.json() as Omit<EtsyToken, "obtained_at">;
  const stored: EtsyToken = { ...fresh, obtained_at: Date.now() };
  await saveToken(stored);
  return stored;
}

export async function getAccessToken(): Promise<string> {
  let token = await loadToken();
  if (!token) throw new Error("Not authenticated. Run: npm run auth");
  if (Date.now() - token.obtained_at > Math.max(0, token.expires_in - 120) * 1000) token = await refreshToken(token);
  return token.access_token;
}

export async function etsyFetch<T>(path: string, init: RequestInit = {}, requireAuth = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-api-key", xApiKey());
  if (requireAuth) headers.set("Authorization", `Bearer ${await getAccessToken()}`);
  const res = await fetchEtsyResponse(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`Etsy ${res.status} ${res.statusText}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return await res.json() as T;
}

export async function getMyUserId(): Promise<number> {
  const accessToken = await getAccessToken();
  const id = Number(accessToken.split(".")[0]);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Could not determine Etsy user id from access token.");
  return id;
}

export async function getMyShop(): Promise<EtsyShop> {
  const userId = await getMyUserId();
  return etsyFetch<EtsyShop>(`/application/users/${userId}/shops`);
}

type PagedListings = { count: number; results: EtsyListing[] };
export async function getAllShopListings(shopId: number, state: "active" | "inactive" | "sold_out" | "draft" | "expired" = "active"): Promise<EtsyListing[]> {
  const all: EtsyListing[] = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    const q = new URLSearchParams({ state, limit: String(limit), offset: String(offset), sort_on: "created", sort_order: "desc" });
    const page = await etsyFetch<PagedListings>(`/application/shops/${shopId}/listings?${q.toString()}`);
    all.push(...page.results);
    if (page.results.length < limit || all.length >= page.count) break;
    offset += limit;
  }
  return all;
}

export async function getListing(listingId: number): Promise<EtsyListing> {
  return etsyFetch<EtsyListing>(`/application/listings/${listingId}?includes=Images`);
}

export async function getListingImages(shopId: number, listingId: number): Promise<EtsyListingImage[]> {
  const result = await etsyFetch<{ count: number; results: EtsyListingImage[] }>(`/application/listings/${listingId}/images`);
  return result.results;
}

export async function createDigitalDraft(input: {shopId:number; source:EtsyListing; imageIds:number[]; title:string; description:string; tags:string[]; price?:number; sectionId?:number;}): Promise<EtsyListing> {
  const src = input.source;
  if (!src.taxonomy_id) throw new Error("Source listing has no taxonomy_id.");
  if (!src.who_made) throw new Error("Source listing has no who_made value.");
  if (!src.when_made) throw new Error("Source listing has no when_made value.");
  const body = new URLSearchParams();
  body.set("quantity", "999");
  body.set("title", input.title);
  body.set("description", input.description);
  body.set("price", (input.price ?? config.digitalPrice).toFixed(2));
  body.set("who_made", src.who_made);
  // Do NOT copy "made_to_order" from a physical POD source listing.
  // For digital products Etsy interprets when_made=made_to_order as a
  // made-to-order digital item rather than an instant download.
  body.set("when_made", config.digitalWhenMade);
  body.set("is_supply", "false");
  body.set("taxonomy_id", String(src.taxonomy_id));
  body.set("type", "download");
  if (input.sectionId) body.set("shop_section_id", String(input.sectionId));
  if (input.imageIds.length) body.set("image_ids", input.imageIds.join(","));
  if (input.tags.length) body.set("tags", input.tags.slice(0, 13).join(","));
  return etsyFetch<EtsyListing>(`/application/shops/${input.shopId}/listings`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function uploadDigitalFile(shopId: number, listingId: number, filePath: string, rank = 1): Promise<unknown> {
  const bytes = await readFile(filePath);
  const fileName = basename(filePath);
  const form = new FormData();

  // Etsy uploadListingFile requires BOTH the binary `file` field and
  // a separate `name` field for a new upload. The filename passed to
  // FormData.append() alone is not sufficient.
  form.append("file", new Blob([bytes]), fileName);
  form.append("name", fileName);
  form.append("rank", String(rank));

  return etsyFetch(`/application/shops/${shopId}/listings/${listingId}/files`, {
    method: "POST",
    body: form,
  });
}


export async function setListingInstantDownload(
  shopId: number,
  listingId: number,
  whoMade = "i_did",
): Promise<EtsyListing> {
  const body = new URLSearchParams();
  body.set("type", "download");
  body.set("when_made", config.digitalWhenMade);
  body.set("who_made", whoMade);
  body.set("is_supply", "false");

  return etsyFetch<EtsyListing>(
    `/application/shops/${shopId}/listings/${listingId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );
}

// Backward-compatible alias used by older call sites.
export async function setListingTypeToDownload(
  shopId: number,
  listingId: number,
): Promise<EtsyListing> {
  return setListingInstantDownload(shopId, listingId);
}

export async function getAllListingFiles(shopId: number, listingId: number): Promise<EtsyListingFile[]> {
  const result = await etsyFetch<{ count: number; results: EtsyListingFile[] }>(
    `/application/shops/${shopId}/listings/${listingId}/files`
  );
  return result.results;
}
