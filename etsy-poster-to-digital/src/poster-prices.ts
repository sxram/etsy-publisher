import { mkdir, open, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const POSTER_PRICES = { '30x40': 20.99, '45x60': 24.99, '60x80': 30.99 } as const;
export type PosterPrices = Record<keyof typeof POSTER_PRICES, number>;
export function parsePriceOptions(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { state: { type: 'string', default: 'active' }, confirm: { type: 'boolean', default: false }, 'price-30x40': { type: 'string' }, 'price-45x60': { type: 'string' }, 'price-60x80': { type: 'string' } } });
  if (positionals.length !== 1 || !['preview', 'update'].includes(positionals[0])) throw new Error('Aufruf: npm run poster:prices -- preview|update [--price-30x40 20.99 --price-45x60 24.99 --price-60x80 30.99] [--state active|draft|all] [--confirm]');
  const prices: PosterPrices = { ...POSTER_PRICES };
  for (const size of Object.keys(prices) as Array<keyof PosterPrices>) {
    const raw = values[`price-${size}`];
    if (raw !== undefined) {
      if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw) || Number(raw.replace(',', '.')) <= 0 || !Number.isSafeInteger(Math.round(Number(raw.replace(',', '.')) * 100))) throw new Error(`Ungültiger Preis für ${size}: ${raw}. Positiver Eurobetrag mit maximal zwei Nachkommastellen erforderlich.`);
      prices[size] = Number(raw.replace(',', '.'));
    }
  }
  return { mode: positionals[0], state: values.state!, confirm: values.confirm, prices };
}
type Money = { amount: number; divisor: number; currency_code?: string };
type Property = { property_id: number; property_name?: string; scale_id?: number | null; value_ids?: number[]; values?: string[] };
type Offering = { quantity: number; is_enabled: boolean; is_deleted?: boolean; price: Money | number; readiness_state_id?: number | null };
export type Inventory = { products: Array<{ sku?: string; is_deleted?: boolean; property_values: Property[]; offerings: Offering[] }>; price_on_property?: number[]; quantity_on_property?: number[]; sku_on_property?: number[]; readiness_state_on_property?: number[] };
export function detectSize(text: string): keyof typeof POSTER_PRICES | undefined {
  const normalized = text.toLowerCase().replace(/[×✕]/g, 'x');
  const cm = [...normalized.matchAll(/(?<![\d.])(30\s*x\s*40|45\s*x\s*60|60\s*x\s*80)(?![\d.])/g)].map(m => m[1].replace(/\s/g, ''));
  const inch = [...normalized.matchAll(/(?<![\d.])(12\s*x\s*16|18\s*x\s*24|24\s*x\s*32)(?![\d.])/g)].map(m => ({ '12x16': '30x40', '18x24': '45x60', '24x32': '60x80' }[m[1].replace(/\s/g, '')]!));
  const sizes = [...new Set([...cm, ...inch])];
  if (sizes.length > 1) throw new Error(`Widersprüchliche Postergröße: ${text}`);
  return sizes[0] as keyof typeof POSTER_PRICES | undefined;
}
export function planPrices(inv: Inventory, prices: PosterPrices = POSTER_PRICES) {
  const products = inv.products.filter(p => !p.is_deleted);
  if (!products.length) throw new Error('Keine Varianten vorhanden.');
  const rows: Array<{ size: string; before: number; after: number }> = [];
  const sizeProperties = new Set<number>();
  const payloadProducts = products.map(product => {
    const matches = product.property_values.map(p => ({ p, size: detectSize((p.values ?? []).join(' / ')) })).filter(m => m.size);
    if (matches.length !== 1) throw new Error(`Größe nicht eindeutig unterstützt: ${product.property_values.flatMap(p => p.values ?? []).join(' / ')}`);
    const { p, size } = matches[0]; sizeProperties.add(p.property_id);
    const offerings = product.offerings.filter(o => !o.is_deleted).map(o => {
      if (typeof o.price !== 'number' && o.price.currency_code !== 'EUR') throw new Error('Nur EUR-Preise werden unterstützt.');
      const before = typeof o.price === 'number' ? o.price : o.price.amount / o.price.divisor;
      if (!Number.isFinite(before) || !Number.isInteger(o.quantity) || o.quantity < 0 || typeof o.is_enabled !== 'boolean') throw new Error('Ungültiges Angebot.');
      const after = prices[size!]; rows.push({ size: size!, before, after });
      return { quantity: o.quantity, is_enabled: o.is_enabled, price: after, ...(o.readiness_state_id != null ? { readiness_state_id: o.readiness_state_id } : {}) };
    });
    if (!offerings.length) throw new Error('Variante ohne Angebote.');
    return { sku: product.sku ?? '', property_values: product.property_values.map(p => ({ property_id: p.property_id, ...(p.property_name ? { property_name: p.property_name } : {}), scale_id: p.scale_id ?? null, value_ids: p.value_ids ?? [], values: p.values ?? [] })), offerings };
  });
  if (sizeProperties.size !== 1) throw new Error('Uneinheitliche Größen-Eigenschaft.');
  return { rows, payload: { products: payloadProducts, price_on_property: [...new Set([...(inv.price_on_property ?? []), ...sizeProperties])], quantity_on_property: inv.quantity_on_property ?? [], sku_on_property: inv.sku_on_property ?? [], ...(inv.readiness_state_on_property !== undefined ? { readiness_state_on_property: inv.readiness_state_on_property } : {}) } };
}
export async function runPosterPrices(args = process.argv.slice(2)) {
  const { mode, state, confirm, prices } = parsePriceOptions(args);
  const states = ['active', 'draft', 'inactive', 'sold_out', 'expired'] as const;
  if (state !== 'all' && !states.includes(state as typeof states[number])) throw new Error('Ungültiger --state.');
  if (mode === 'update' && !confirm) throw new Error('Zum Schreiben --confirm ergänzen. Zuerst preview ausführen.');
  const { getMyShop, getAllShopListings, getListing, etsyFetch } = await import('./etsy.js');
  const shop = await getMyShop();
  const sections = await etsyFetch<{ results: Array<{ title: string; shop_section_id: number }> }>(`/application/shops/${shop.shop_id}/sections`);
  const matches = sections.results.filter(s => s.title.trim() === 'Poster');
  if (matches.length !== 1) throw new Error('Shop-Abteilung Poster fehlt oder ist nicht eindeutig.');
  const section = matches[0].shop_section_id;
  const inventory = (id: number) => etsyFetch<Inventory>(`/application/listings/${id}/inventory?max_variations_supported=3`);
  const output = resolve('out/poster-prices'); await mkdir(output, { recursive: true });
  const lockPath = join(output, 'operation.lock');
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Preisvorgang läuft bereits (out/poster-prices/operation.lock).'); });
  try {
    const listings = (await Promise.all((state === 'all' ? states : [state as typeof states[number]]).map(s => getAllShopListings(shop.shop_id, s)))).flat().filter(l => l.shop_section_id === section);
    const plans = [];
    // Validate every listing before the first write, including unknown sizes.
    for (const listing of listings) {
      const live = await getListing(listing.listing_id);
      if (live.shop_id !== shop.shop_id || live.shop_section_id !== section || live.type === 'download' || live.listing_type === 'download' || live.price?.currency_code !== 'EUR') throw new Error(`Artikel ${listing.listing_id}: kein eigener physischer EUR-Posterartikel.`);
      const inv = await inventory(listing.listing_id);
      plans.push({ listing: live, inv, plan: planPrices(inv, prices) });
    }
    console.table(plans.flatMap(p => p.plan.rows.map(r => ({ id: p.listing.listing_id, state: p.listing.state, size: r.size, bisher: r.before.toFixed(2), neu: r.after.toFixed(2) }))));
    if (mode === 'preview') { console.log(`${plans.length} Artikel geprüft. Vorschau: keine Preise geändert.`); return; }
    const backup = join(output, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await writeFile(backup, JSON.stringify({ shopId: shop.shop_id, sectionId: section, plans }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(`Sicherung: ${backup}`);
    for (const { listing, inv, plan } of plans) {
      const current = await getListing(listing.listing_id);
      if (current.shop_id !== shop.shop_id || current.shop_section_id !== section || current.state !== listing.state || current.type === 'download') throw new Error(`Artikel ${listing.listing_id} inzwischen geändert. Abbruch.`);
      const fresh = await inventory(listing.listing_id);
      if (JSON.stringify(fresh) !== JSON.stringify(inv)) throw new Error(`Bestand von ${listing.listing_id} inzwischen geändert. Abbruch; erneut aufrufen.`);
      if (plan.rows.every(r => Math.abs(r.before - r.after) < .001)) { console.log(`${listing.listing_id}: bereits korrekt.`); continue; }
      await etsyFetch(`/application/listings/${listing.listing_id}/inventory?max_variations_supported=3`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan.payload) });
      const verified = planPrices(await inventory(listing.listing_id), prices);
      if (JSON.stringify(verified.payload) !== JSON.stringify(plan.payload) || verified.rows.some(r => Math.abs(r.before - r.after) > .001)) throw new Error(`Nachprüfung für ${listing.listing_id} fehlgeschlagen. Sicherung prüfen.`);
      console.log(`${listing.listing_id}: Preise aktualisiert und geprüft.`);
    }
  } finally { await lock.close(); await unlink(lockPath); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runPosterPrices().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
