import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { etsyFetch, getMyShop, getListing } from './etsy.js';
import { manufacturerDescription, isPhysicalListing, type ManufacturerContact } from './gpsr-text.js';
export async function runManufacturer(args = process.argv.slice(2)) {
const value = (name: string) => args[args.indexOf(name) + 1];
const id = args.includes('--listing') ? value('--listing') : '';
const contactPath = args.includes('--contact') ? value('--contact') : '';
if (!/^[1-9]\d*$/.test(id ?? '') || !contactPath) throw new Error('Aufruf: --listing ID --contact /pfad/product-contact.json [--apply]');
const contact = JSON.parse(await readFile(resolve(contactPath), 'utf8')) as ManufacturerContact;
const shop = await getMyShop();
const before = await getListing(Number(id));
if (before.shop_id !== shop.shop_id) throw new Error('Artikel gehört nicht zum angemeldeten Shop.');
if (!isPhysicalListing(before)) throw new Error('Nur physische Gelato-Artikel unterstützen diesen Herstellerkontakt.');
const sections = await etsyFetch<{ results: { shop_section_id: number; title: string }[] }>(`/application/shops/${shop.shop_id}/sections`);
const section = sections.results.find(s => s.shop_section_id === before.shop_section_id)?.title;
if (!['Kids T-Shirts', 'Poster'].includes(section ?? '')) throw new Error('Artikel muss in Kids T-Shirts oder Poster liegen.');
// These sections may also contain Printify products: verify the actual production partner.
const partners = await etsyFetch<{ results: { production_partner_id: number; partner_name: string }[] }>(`/application/shops/${shop.shop_id}/production-partners`);
const gelatoIds = partners.results.filter(p => p.partner_name.trim().toLowerCase() === 'gelato').map(p => p.production_partner_id);
const raw = before as unknown as { production_partner_ids?: number[]; production_partners?: { production_partner_id: number }[] };
const listingPartners = [...(raw.production_partner_ids ?? []), ...(raw.production_partners ?? []).map(p => p.production_partner_id)];
if (!listingPartners?.some(id => gelatoIds.includes(id))) throw new Error('Gelato ist nicht als Produktionspartner am Artikel bestätigt. Bitte im Etsy-Editor zuordnen.');
const description = manufacturerDescription(before.description ?? '', contact);
if (description === before.description) { console.log(`Etsy ${id}: GPSR-Herstellerkontakt bereits vorhanden.`); }
else if (!args.includes('--apply')) { console.log(description); console.log('Vorschau; zum Speichern --apply ergänzen.'); }
else {
  const out = resolve('out/gpsr'); await mkdir(out, { recursive: true });
  await writeFile(`${out}/${id}-${Date.now()}.json`, JSON.stringify({ listingId: id, description: before.description, state: before.state }, null, 2), { mode: 0o600 });
  // Recheck before write to avoid overwriting edits made during preflight.
  if ((await getListing(Number(id))).description !== before.description) throw new Error('Beschreibung zwischenzeitlich geändert. Erneut ausführen.');
  await etsyFetch(`/application/shops/${shop.shop_id}/listings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ description }) });
  const after = await getListing(Number(id));
  if (after.description !== description || after.state !== before.state) throw new Error('GPSR-Änderung konnte nicht bestätigt werden.');
  console.log(`Etsy ${id}: GPSR-Herstellerkontakt in Beschreibung gespeichert. Separate GPSR-Felder und Sicherheitsinformationen bleiben manuell.`);
}

}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runManufacturer().catch(error => { console.error(error instanceof Error ? error.message : 'GPSR-Herstellerprüfung fehlgeschlagen.'); process.exitCode = 1; });
}
