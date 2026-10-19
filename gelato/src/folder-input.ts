import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export function parseProductText(text: string) {
  const lines = text.split(/\r?\n/);
  const used = new Set<number>();
  const clean = (s: string) => s.trim().replace(/^#{1,6}\s+/, '').replace(/\*\*|__/g, '');
  const heading = /^(title|titel|tags|schlagwörter|description|beschreibung)(?:\s*:\s*(.*))?$/i;
  function field(names: RegExp) {
    const index = lines.findIndex(line => names.test(heading.exec(clean(line))?.[1] ?? ''));
    if (index < 0) return undefined;
    used.add(index);
    const inline = heading.exec(clean(lines[index]!))?.[2]?.trim();
    if (names.test('tags')) {
      const values: string[] = inline ? [inline] : [];
      let next = index + 1;
      if (!inline) while (next < lines.length && !lines[next]!.trim()) next++;
      while (next < lines.length) {
        const line = lines[next]!.trim();
        if (!line || heading.test(clean(line)) || /^#{1,6}\s+/.test(line) || /^\*\*[^*]+\*\*:?$/.test(line)) break;
        // A prose sentence after inline tags belongs to the description.
        if (/[.!?]$/.test(line)) break;
        used.add(next);
        values.push(line.replace(/^(?:[-*•]|\d+[.)])\s+/, ''));
        next++;
      }
      if (!values.length) throw new Error(`Inhalt nach ${clean(lines[index]!)} fehlt.`);
      return values.join(', ');
    }
    if (inline) return inline;
    let next = index + 1;
    while (next < lines.length && !lines[next]!.trim()) next++;
    if (next >= lines.length || heading.test(clean(lines[next]!))) throw new Error(`Inhalt nach ${clean(lines[index]!)} fehlt.`);
    used.add(next);
    const values = [lines[next]!.trim().replace(/^[-*•]\s+/, '')];
    return values.join(', ');
  }
  const titleField = field(/^(title|titel)$/i);
  const tagField = field(/^(tags|schlagwörter)$/i);
  if (!titleField || !tagField) throw new Error('Title/Titel und Tags/Schlagwörter sind erforderlich (inline oder als Markdown-Überschrift).');
  const title = titleField.replace(/\s*,\s*/g, ' | ').trim();
  if (title.length > 140) throw new Error(`Titel hat ${title.length} Zeichen, maximal 140 erlaubt.`);
  const tags = [...new Set(tagField.split(/[,;]/).map(t => t.trim()).filter(Boolean))];
  if (!tags.length || tags.length > 13 || tags.some(t => t.length > 20 || !/^[\p{L}\p{N} -]+$/u.test(t))) throw new Error('Tags: 1–13 Einträge, jeweils höchstens 20 Zeichen (Buchstaben, Zahlen, Leerzeichen, Bindestriche).');
  const description = lines.filter((line, i) => !used.has(i) && !/^(description|beschreibung):?$/i.test(clean(line))).join('\n').trim();
  if (!description) throw new Error('Artikelbeschreibung fehlt.');
  return { title, tags, description };
}
export async function readProductFolder(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  const images = entries.filter(e => e.isFile() && /\.(png|jpe?g)$/i.test(e.name));
  const texts = entries.filter(e => e.isFile() && /\.(txt|md)$/i.test(e.name));
  if (images.length !== 1 || texts.length !== 1) throw new Error(`Genau ein JPG/PNG und eine TXT/MD-Datei im Ordner erforderlich; gefunden: ${images.length} Bilder, ${texts.length} Texte.`);
  const image = join(dir, images[0]!.name);
  const bytes = await readFile(image);
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (/\.png$/i.test(image) ? !png : !jpg) throw new Error('Bildinhalt passt nicht zur JPG/PNG-Dateiendung.');
  return { image, bytes, metadata: parseProductText(await readFile(join(dir, texts[0]!.name), 'utf8')) };
}

export function appendDescriptionDefaults(description: string, defaults: string[] = []): string {
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
    .replace(/[*_`]/g, '').replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  const existing = normalize(description);
  const seen = new Set<string>();
  const missing = defaults.map(point => point.trim()).filter(point => {
    const key = normalize(point);
    if (!key || seen.has(key) || existing.includes(key)) return false;
    seen.add(key); return true;
  });
  return missing.length ? `${description.trimEnd()}\n\n${missing.map(point => `- ${point}`).join('\n')}` : description;
}

export function makeProfileTitle(source: string, suffix = ''): string {
  if (!suffix.trim()) return source;
  const normalize = (value: string) => value.toLowerCase().replace(/[®™]/g, '').replace(/\s+/g, ' ').trim();
  const parts = suffix.split('|').map(part => part.trim()).filter(Boolean);
  const sourceParts = source.split('|').map(part => part.trim()).filter(Boolean);
  const productKeys = new Set(parts.flatMap(part => [normalize(part), normalize(part.replace(/^Classic\s+/i, ''))]));
  const motif = sourceParts.filter(part => !productKeys.has(normalize(part))).join(' | ');
  let product = parts.join(' | ');
  if (`${motif} | ${product}`.length > 140) product = product.replace(/^Classic\s+/i, '');
  const room = 140 - product.length - 3;
  if (room < 1) throw new Error('Produkt-Titelzusatz ist zu lang.');
  let clipped = motif;
  if (clipped.length > room) {
    clipped = clipped.slice(0, room + 1);
    const space = clipped.lastIndexOf(' ');
    clipped = (space > 0 ? clipped.slice(0, space) : clipped.slice(0, room)).replace(/[|\s]+$/, '');
  }
  return clipped ? `${clipped} | ${product}` : product;
}

export function toGelatoHtml(text: string): string {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return text.trim().split(/\r?\n\s*\r?\n/).map(paragraph => `<p>${escape(paragraph).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\r?\n/g, '<br>')}</p>`).join('\n');
}
