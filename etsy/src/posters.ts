import { config } from "./config.js";
import type { EtsyListing } from "./types.js";

export function isLikelyPhysicalPoster(listing: EtsyListing): boolean {
  // Exclude digital downloads.
  if ((listing.listing_type || "").toLowerCase() === "download") return false;

  const haystack = [
    listing.title,
    ...(listing.tags || []),
  ].join(" ").toLowerCase();

  return config.posterKeywords.some(keyword => haystack.includes(keyword));
}
