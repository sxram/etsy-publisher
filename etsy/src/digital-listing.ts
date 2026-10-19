import { config } from "./config.js";
import type { EtsyListing, DigitalFileGroup } from "./types.js";

const MAX_TITLE = 140;
const MAX_TAGS = 13;
const MAX_TAG_LENGTH = 20;
const STOP_WORDS = new Set(["the", "with", "for", "and", "your", "this", "from", "that", "into", "beneath", "under", "above"]);

function cleanSegment(value: string): string {
  return value
    .replace(/\bphysical\s+print\b/gi, "")
    .replace(/\bprinted\s+poster\b/gi, "poster")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function segmentPriority(segment: string, index: number): number {
  if (index === 0) return 1000;
  const s = segment.toLowerCase();
  if (/\bgiggle\b|\bgigglinghome\b/.test(s)) return 10;
  if (/^(kids?|children'?s?) room wall art$/i.test(segment)) return 15;
  if (/^(kids?|children'?s?) wall art$/i.test(segment)) return 18;
  if (/^wall art$/i.test(segment)) return 20;
  if (/nursery|galaxy|space|fairytale|storybook|forest|village|unicorn|moon/i.test(segment)) return 70;
  if (/cute|alien|cat|fox|deer|character|animal|castle|mushroom|cosmic/i.test(segment)) return 80;
  return 50;
}

function suffixSegments(): string[] {
  const configured = config.digitalTitleSuffix
    .split("|")
    .map(s => s.trim())
    .filter(Boolean);
  const result = configured.length ? configured : ["Printable Wall Art", "Digital Download"];
  const withoutDigital = result.filter(s => !/digital\s+download/i.test(s));
  return [...withoutDigital, "Digital Download"];
}

function joinTitle(segments: string[]): string {
  return segments.filter(Boolean).join(" | ");
}

function truncateAtWord(value: string, max: number): string {
  if (value.length <= max) return value;
  const clipped = value.slice(0, max + 1);
  const cut = Math.max(clipped.lastIndexOf(" "), clipped.lastIndexOf("-"));
  return (cut > 12 ? clipped.slice(0, cut) : value.slice(0, max))
    .replace(/[|,\-\s]+$/g, "")
    .trim();
}

export function makeDigitalTitle(sourceTitle: string): string {
  const sourceSegments = sourceTitle
    .split("|")
    .map(cleanSegment)
    .filter(Boolean)
    .filter(s => !/\b(?:printable wall art|digital download)\b/i.test(s));

  const digitalSuffix = suffixSegments();
  if (!sourceSegments.length) return joinTitle(digitalSuffix).slice(0, MAX_TITLE);

  let kept = sourceSegments.map((text, index) => ({
    text,
    index,
    priority: segmentPriority(text, index),
  }));

  while (joinTitle([...kept.map(x => x.text), ...digitalSuffix]).length > MAX_TITLE && kept.length > 1) {
    const removable = kept
      .slice(1)
      .sort((a, b) => a.priority - b.priority || b.index - a.index)[0];
    kept = kept.filter(x => x !== removable);
  }

  let title = joinTitle([...kept.map(x => x.text), ...digitalSuffix]);
  if (title.length > MAX_TITLE) {
    const suffixText = joinTitle(digitalSuffix);
    const roomForPrimary = Math.max(20, MAX_TITLE - suffixText.length - 3);
    title = joinTitle([truncateAtWord(kept[0].text, roomForPrimary), ...digitalSuffix]);
  }
  return title;
}

export function extractArtworkDescription(description: string): string {
  const text = (description || "").trim();
  if (!text) return "";

  const heading = /^\s*print\s+details\s*$/im;
  const match = heading.exec(text);
  if (!match) return text;

  return text.slice(0, match.index).trim();
}

function readableFileDescription(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() || filePath;
  const noExt = name.replace(/\.[a-z0-9]+$/i, "");
  const ratio = noExt.match(/(?:^|[_\-\s])(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)(?=[_\-\s])/i);
  const sizes = [...noExt.matchAll(/(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)\s*(cm|mm|in|inch|inches)/gi)];
  const size = sizes.length ? sizes[sizes.length - 1] : undefined;
  const dpi = noExt.match(/(?:^|[_\-\s])(\d{2,4})\s*dpi$/i);

  const parts: string[] = [];
  if (ratio) {
    const a = Number(ratio[1].replace(",", "."));
    const b = Number(ratio[2].replace(",", "."));
    parts.push(`${ratio[1]}:${ratio[2]} ${a < b ? "portrait" : a > b ? "landscape" : "square"}`);
  }
  if (size) parts.push(`${size[1]} × ${size[2]} ${size[3].toLowerCase()}`);
  if (dpi) parts.push(`${dpi[1]} dpi`);

  return parts.length ? parts.join(" — ") : name;
}

export function makeDigitalDescription(source: EtsyListing, group: DigitalFileGroup): string {
  const artworkText = extractArtworkDescription(source.description || "");
  const fileLines = group.files.map(f => `- ${readableFileDescription(f)}`).join("\n");

  const orientationText = group.files.length > 1
    ? `You will receive ${group.files.length} high-resolution files. Use the version that matches the orientation and aspect ratio you want to print.`
    : "You will receive one high-resolution printable artwork file.";

  const intro = artworkText ? `${artworkText}\n\n` : "";

  return `${intro}DIGITAL DOWNLOAD\n\n${orientationText}\n\nIncluded files:\n${fileLines}\n\nHow to print\n- Download the files after purchase.\n- Print at home, at a local print shop, or upload the file to an online printing service.\n- For best results, use the file with the aspect ratio that matches your chosen print size.\n- Files can be printed at the listed maximum size or smaller while keeping the same aspect ratio.\n\nPlease note\n- This is a digital product. No physical item will be shipped.\n- Frame is not included.\n- Colors may vary slightly depending on your screen, printer, paper and print settings.\n- Digital files are for personal use only unless otherwise stated in the shop terms.`;
}

function normalizeTag(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9äöüß\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string): string[] {
  return normalizeTag(value)
    .split(" ")
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

function splitUsefulChunks(value: string): string[] {
  return value
    .split(/\s+(?:and|&|or)\s+|[,;/]+/i)
    .map(normalizeTag)
    .filter(Boolean);
}

function tagNgrams(value: string): string[] {
  const tokens = words(value);
  const out: string[] = [];
  for (const n of [4, 3, 2]) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const phrase = tokens.slice(i, i + n).join(" ");
      if (phrase.length <= MAX_TAG_LENGTH) out.push(phrase);
    }
  }
  return out;
}

function makeThemeTags(text: string): string[] {
  const hay = ` ${normalizeTag(text)} `;
  const tags: string[] = [];
  const has = (re: RegExp) => re.test(hay);

  if (has(/\balien\b/) && has(/\bnursery\b|\bkids\b/)) tags.push("alien nursery art");
  if (has(/\bspace\b/) && has(/\bnursery\b|\bkids\b/)) tags.push("space nursery decor");
  if (has(/\bgalaxy\b/) && has(/\bnursery\b|\bkids\b/)) tags.push("galaxy nursery decor");
  if (has(/\bspace\b/) && has(/\bposter\b/)) tags.push("space poster");
  if (has(/\bpurple\b/) && has(/\balien\b/)) tags.push("purple alien");
  if (has(/\bcosmic\b/) && has(/\bcat\b/)) tags.push("cosmic cat");
  if (has(/\bkids\b/) && has(/\broom\b/)) tags.push("kids room decor");
  if (has(/\bnursery\b/) && has(/\bprintable\b/)) tags.push("nursery printable");

  return tags.filter(t => t.length <= MAX_TAG_LENGTH);
}

function tokenSet(value: string): Set<string> {
  return new Set(words(value));
}

function isBlockedTag(tag: string): boolean {
  const normalized = normalizeTag(tag);
  const blocked = config.digitalBlockedTags.map(normalizeTag);
  return blocked.includes(normalized);
}

function isRedundant(candidate: string, existing: string[]): boolean {
  const c = normalizeTag(candidate);
  const cWords = tokenSet(c);
  if (!c || !cWords.size) return true;

  for (const ex of existing) {
    const e = normalizeTag(ex);
    if (c === e) return true;

    const eWords = tokenSet(e);
    let common = 0;
    for (const w of cWords) if (eWords.has(w)) common++;

    const candidateSubset = common === cWords.size;
    const existingSubset = common === eWords.size;
    if (candidateSubset || existingSubset) return true;

    const overlap = common / Math.max(cWords.size, eWords.size);
    if (overlap >= 0.8) return true;
  }
  return false;
}

function addTag(result: string[], seen: Set<string>, value: string) {
  const tag = normalizeTag(value);
  if (!tag || tag.length > MAX_TAG_LENGTH || seen.has(tag)) return;
  if (/^giggle|^gigglinghome/.test(tag)) return;
  if (isBlockedTag(tag)) return;
  if (isRedundant(tag, result)) return;
  seen.add(tag);
  result.push(tag);
}

export function makeDigitalTags(source: EtsyListing, digitalTitle = makeDigitalTitle(source.title)): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const sourceSegments = source.title.split("|").map(s => s.trim()).filter(Boolean);
  const artwork = extractArtworkDescription(source.description || "");

  // 0) Optional preferred tags from config, then automatic theme tags.
  for (const tag of config.digitalPreferredTags) addTag(result, seen, tag);
  for (const tag of makeThemeTags(`${source.title}\n${artwork}`)) addTag(result, seen, tag);

  // 1) Product-specific phrases from title get highest priority.
  for (const segment of sourceSegments) {
    for (const chunk of splitUsefulChunks(segment)) {
      if (chunk.length <= MAX_TAG_LENGTH && chunk.split(" ").length >= 2) addTag(result, seen, chunk);
      for (const phrase of tagNgrams(chunk)) addTag(result, seen, phrase);
    }
  }

  // 2) "Perfect for" bullets often contain useful niche phrases.
  const bullets = artwork
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^[-•]\s+/.test(line))
    .map(line => line.replace(/^[-•]\s+/, ""));

  for (const bullet of bullets) {
    for (const chunk of splitUsefulChunks(bullet)) {
      if (chunk.length <= MAX_TAG_LENGTH) addTag(result, seen, chunk);
      for (const phrase of tagNgrams(chunk)) addTag(result, seen, phrase);
    }
  }

  // 3) Digital-intent constants are always present. Reserve room for all of them.
  const constants = config.digitalConstantTags
    .map(normalizeTag)
    .filter(tag => tag && tag.length <= MAX_TAG_LENGTH && !isBlockedTag(tag));

  const specificLimit = Math.max(0, MAX_TAGS - new Set(constants).size);
  const specific = result.slice(0, specificLimit);
  const final: string[] = [];
  const finalSeen = new Set<string>();
  for (const tag of [...specific, ...constants]) addTag(final, finalSeen, tag);

  // 4) If needed, fill remaining slots from title-derived phrases.
  if (final.length < MAX_TAGS) {
    for (const segment of [...sourceSegments, digitalTitle]) {
      for (const phrase of tagNgrams(segment)) {
        addTag(final, finalSeen, phrase);
        if (final.length >= MAX_TAGS) break;
      }
      if (final.length >= MAX_TAGS) break;
    }
  }

  return final.slice(0, MAX_TAGS);
}
