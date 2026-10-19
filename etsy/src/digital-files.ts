import { readdir } from "node:fs/promises";
import { extname, join, basename } from "node:path";
import type { DigitalFileGroup } from "./types.js";

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".pdf", ".zip"]);

export function baseNameForGrouping(fileName: string): string {
  const ext = extname(fileName);
  let stem = basename(fileName, ext);
  stem = stem.replace(/[_\-\s]+300\s*dpi$/i, "");
  stem = stem.replace(/[_\-\s]+\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?\s*(?:cm|mm|in|inch|inches)$/i, "");
  stem = stem.replace(/[_\-\s]+\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?$/i, "");
  stem = stem.replace(/[_\-\s]+(?:portrait|vertical|hochformat|landscape|horizontal|querformat)$/i, "");
  return stem.replace(/[_\-\s]+$/g, "").trim();
}

export function normalizedKey(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9äöüß]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function primaryListingTitle(title: string): string {
  return title
    .split("|")[0]
    .split("—")[0]
    .split("–")[0]
    .trim();
}

export async function scanDigitalFileGroups(dir: string): Promise<DigitalFileGroup[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = new Map<string, DigitalFileGroup>();
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = extname(e.name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) continue;
    const displayName = baseNameForGrouping(e.name);
    const key = normalizedKey(displayName);
    if (!key) continue;
    const current = groups.get(key) ?? { key, displayName, files: [] };
    current.files.push(join(dir, e.name));
    groups.set(key, current);
  }
  return [...groups.values()]
    .map(g => ({ ...g, files: g.files.sort() }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function words(value: string): string[] {
  return normalizedKey(value).split(" ").filter(w => w.length >= 3);
}

function wordSet(value: string): Set<string> {
  return new Set(words(value));
}

function diceScore(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return (2 * common) / (a.size + b.size);
}

function leadingTokenMatchCount(aValue: string, bValue: string): number {
  const a = words(aValue);
  const b = words(bValue);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function startsWithWholeWords(candidate: string, prefix: string): boolean {
  const c = normalizedKey(candidate);
  const p = normalizedKey(prefix);
  return c === p || c.startsWith(p + " ");
}

export function scoreGroupAgainstTitle(group: DigitalFileGroup, listingTitle: string): number {
  const groupName = group.displayName;
  const primaryTitle = primaryListingTitle(listingTitle);

  const groupKey = normalizedKey(groupName);
  const primaryKey = normalizedKey(primaryTitle);
  const fullKey = normalizedKey(listingTitle);

  if (!groupKey || !primaryKey) return 0;

  // Strong deterministic matches first.
  if (groupKey === primaryKey) return 1.25;
  if (startsWithWholeWords(groupName, primaryTitle)) return 1.15;
  if (startsWithWholeWords(primaryTitle, groupName)) return 1.05;

  const primaryWords = wordSet(primaryKey);
  const fullWords = wordSet(fullKey);
  const groupWords = wordSet(groupKey);

  const primaryDice = diceScore(groupWords, primaryWords);
  const fullDice = diceScore(groupWords, fullWords);
  const leadingCount = leadingTokenMatchCount(groupName, primaryTitle);

  let score = primaryDice * 0.75 + fullDice * 0.25;

  // Reward identical leading phrase structure strongly.
  if (leadingCount >= 2) score += 0.15 + Math.min(leadingCount, 4) * 0.05;

  // Small bonus when the first word matches exactly.
  const groupFirst = words(groupName)[0];
  const titleFirst = words(primaryTitle)[0];
  if (groupFirst && titleFirst && groupFirst === titleFirst) score += 0.05;

  return score;
}

export function chooseBestGroup(groups: DigitalFileGroup[], listingTitle: string) {
  const ranked = groups
    .map(group => ({ group, score: scoreGroupAgainstTitle(group, listingTitle) }))
    .sort((a, b) => b.score - a.score || a.group.displayName.localeCompare(b.group.displayName));

  if (!ranked.length) throw new Error("No digital file groups found.");

  return {
    group: ranked[0].group,
    score: ranked[0].score,
    secondScore: ranked[1]?.score ?? 0,
    ranked,
  };
}
