import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
export interface GalleryImage { listing_image_id: number; rank?: number; alt_text?: string }
export interface GalleryClient { list(): Promise<GalleryImage[]>; upload(bytes: Buffer, rank: number, alt: string, overwrite?: boolean): Promise<GalleryImage> }
interface Entry { hash: string; marker: string; status: 'planned' | 'pending' | 'done'; imageId?: number; replaces?: { id: number; rank: number; marker: string } }
interface Journal { listingId: number; shopId: number; sourceHash: string; baseline: GalleryImage[]; entries: Entry[] }
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export async function appendColorImages(reportFile: string, shopId: number, listingId: number, client: GalleryClient, apply: boolean, refreshManaged = false) {
  const report = JSON.parse(await readFile(reportFile, 'utf8')) as { model: string; readyForUpload: boolean; sourceImage: string; sourceSha256: string; overviewFiles: string[]; overviewSha256: string[] };
  if (report.model !== 'Gildan 5000B' || report.readyForUpload !== true || !report.overviewFiles?.length || report.overviewFiles.length > 2 || report.overviewFiles.length !== report.overviewSha256?.length) throw new Error('Freigegebener Mockup-Bericht mit maximal zwei Übersichten fehlt. gelato:mockups erneut ausführen.');
  if (digest(await readFile(report.sourceImage)) !== report.sourceSha256) throw new Error('Motiv seit Vorschau geändert. Mockups neu erzeugen.');
  const files = await Promise.all(report.overviewFiles.map(file => readFile(file)));
  if (files.some((bytes, i) => digest(bytes) !== report.overviewSha256[i] || bytes[0] !== 255 || bytes[1] !== 216)) throw new Error('Übersicht seit Vorschau geändert oder kein JPG.');
  const dir = dirname(resolve(reportFile)); await mkdir(dir, { recursive: true });
  const path = join(dir, `etsy-upload-${listingId}.json`);
  const lock = await open(`${path}.lock`, 'wx').catch(() => { throw new Error('Mockup-Upload läuft bereits; vorhandene Sperre vor erneutem Start prüfen.'); });
  try {
    const initial = await client.list();
    let journal: Journal;
    try { journal = JSON.parse(await readFile(path, 'utf8')) as Journal; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      journal = { listingId, shopId, sourceHash: report.sourceSha256, baseline: initial, entries: report.overviewSha256.map(hash => ({ hash, marker: `[giggle-colors:${hash}]`, status: 'planned' })) };
    }
    if (journal.shopId !== shopId || journal.listingId !== listingId || journal.sourceHash !== report.sourceSha256) throw new Error('Artikel, Shop oder Motiv unterscheiden sich vom früheren Upload.');
    if (JSON.stringify(journal.entries.map(e => e.hash)) !== JSON.stringify(report.overviewSha256)) {
      if (!refreshManaged || !apply || journal.entries.length !== report.overviewSha256.length || journal.entries.some(e => e.status !== 'done')) throw new Error('Mockups geändert. Für den gezielten Austausch ausschließlich eigener Übersichten --refresh-managed verwenden.');
      const replacements = journal.entries.map(entry => {
        const found = initial.find(image => image.listing_image_id === entry.imageId && image.alt_text?.includes(entry.marker));
        if (!found || !found.rank || journal.baseline.some(image => image.listing_image_id === found.listing_image_id)) throw new Error('Eigene Farbübersicht nicht eindeutig bestätigt; kein Austausch.');
        return { id: found.listing_image_id, rank: found.rank, marker: entry.marker };
      });
      await writeFile(`${path}.backup-${Date.now()}.json`, JSON.stringify(journal, null, 2), { mode: 0o600 });
      journal.entries = report.overviewSha256.map((hash, index) => ({ hash, marker: `[giggle-colors:${hash}]`, status: 'planned', replaces: replacements[index]! }));
    }
    const save = async () => { await writeFile(`${path}.tmp`, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 }); await rename(`${path}.tmp`, path); };
    const assertPreserved = (images: GalleryImage[]) => {
      if (journal.baseline.some(before => !images.some(now => now.listing_image_id === before.listing_image_id && now.rank === before.rank))) throw new Error('Vorhandene Etsy-Bilder oder Reihenfolge geändert. Upload angehalten.');
    };
    assertPreserved(initial);
    for (const entry of journal.entries) {
      const matches = initial.filter(i => i.alt_text?.includes(entry.marker));
      if (matches.length > 1) throw new Error('Doppelte Farbübersicht erkannt; manuell prüfen.');
      const found = matches[0] ?? (entry.imageId ? initial.find(i => i.listing_image_id === entry.imageId) : undefined);
      if (found) { entry.status = 'done'; entry.imageId = found.listing_image_id; }
      else if (entry.status === 'pending') throw new Error('Ungewisser früherer Upload. Etsy-Bilder prüfen; kein erneuter POST zur Vermeidung von Duplikaten.');
      else if (entry.status === 'done') throw new Error('Frühere Farbübersicht wurde entfernt. Kein automatischer Neu-Upload.');
    }
    const needed = journal.entries.filter(e => e.status !== 'done').length;
    if (initial.length + journal.entries.filter(e => e.status !== 'done' && !e.replaces).length > 20) throw new Error('Mit Farbübersichten wären mehr als 20 Etsy-Bilder vorhanden. Keine Bilder gelöscht.');
    if (!apply) { console.log(`Etsy ${listingId}: ${initial.length} Bilder vorhanden; ${needed} Farbübersichten würden angehängt. Bestehende Bilder bleiben erhalten.`); return { added: 0, pending: needed }; }
    await save();
    let added = 0;
    for (const [index, entry] of journal.entries.entries()) {
      if (entry.status === 'done') continue;
      const before = await client.list(); assertPreserved(before);
      if (before.length >= 20 && !entry.replaces) throw new Error('Etsy-Bilderlimit erreicht.');
      if (entry.replaces && !before.some(image => image.listing_image_id === entry.replaces!.id && image.rank === entry.replaces!.rank && image.alt_text?.includes(entry.replaces!.marker))) throw new Error('Zu ersetzende eigene Übersicht zwischenzeitlich geändert.');
      entry.status = 'pending'; await save();
      try {
        const result = await client.upload(files[index]!, entry.replaces?.rank ?? (Math.max(0, ...before.map(i => i.rank ?? 0)) + 1), `Gildan 5000B shirt design shown in available colors, overview ${index + 1}. ${entry.marker}`, !!entry.replaces);
        if (!Number.isSafeInteger(result.listing_image_id) || result.listing_image_id <= 0) throw new Error('Etsy-Antwort ohne gültige Bild-ID.');
        entry.imageId = result.listing_image_id;
      } catch (error) {
        // A lost response may have created the image. Reconcile by the marker, never blindly retry POST.
        const matches = (await client.list()).filter(i => i.alt_text?.includes(entry.marker));
        if (matches.length === 1) entry.imageId = matches[0]!.listing_image_id;
        else {
          if (/^Etsy (400|401|403|404|413|415|422)\b/.test(error instanceof Error ? error.message : '')) entry.status = 'planned';
          await save(); throw error;
        }
      }
      await save();
      const after = await client.list(); assertPreserved(after);
      if (!after.some(i => i.listing_image_id === entry.imageId)) throw new Error('Upload konnte nicht bestätigt werden.');
      entry.status = 'done'; delete entry.replaces; await save(); added++;
    }
    console.log(`Etsy ${listingId}: ${added} Farbübersichten ergänzt; alle ${journal.baseline.length} ursprünglichen Bilder erhalten.`);
    return { added, pending: 0 };
  } finally { await lock.close(); await unlink(`${path}.lock`); }
}
