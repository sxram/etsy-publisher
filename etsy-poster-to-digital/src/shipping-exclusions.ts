import { mkdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';

// ISO 3166-1 alpha-2 destinations plus Etsy's existing Kosovo code KV.
// Only exact Etsy rejections of unsupported destination countries may be skipped.
export const COUNTRIES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW KV'.split(' ');
export const EU = new Set('AT BE BG HR CY CZ DE DK EE ES FI FR GR HU IE IT LT LU LV MT NL PL PT RO SE SI SK'.split(' '));
type Money = { amount: number; divisor: number; currency_code: string };
export type Destination = { shipping_profile_destination_id: number; destination_country_iso: string; destination_region: string; primary_cost: Money; secondary_cost: Money; shipping_carrier_id: number; mail_class: string | null; min_delivery_days: number | null; max_delivery_days: number | null };
export type Profile = { shipping_profile_id: number; title: string; profile_type: string; user_id: number; shipping_profile_destinations: Destination[]; [key: string]: unknown };
export type Listing = { listing_id: number; shop_id: number; shop_section_id?: number | null; shipping_profile_id?: number | null; state: string; type?: string; listing_type?: string };
export type Rule = { country: string; primary_cost: number; secondary_cost: number; shipping_carrier_id?: number; mail_class?: string; min_delivery_days?: number; max_delivery_days?: number };
export function isUnsupportedCountry(error: unknown, country: string): boolean {
  if (!(error instanceof Error)) return false;
  const match = /^Etsy 400 [^:]+: (\{.*\})$/s.exec(error.message.trim());
  if (!match) return false;
  try {
    const body = JSON.parse(match[1]) as { error?: unknown };
    return body.error === `The destination country '${country}' is not currently supported.`
      || (COUNTRIES.includes(country) && body.error === `Value for destination_country_iso must be a valid ISO Country Code: ${country}.`);
  } catch { return false; }
}
export async function addReplacementRules(rules: Rule[], create: (rule: Rule) => Promise<unknown>, unsupported = new Set<string>(), report: (country: string, skipped: boolean) => void = () => {}) {
  const added: Rule[] = [];
  for (const rule of rules) {
    if (unsupported.has(rule.country)) { report(rule.country, true); continue; }
    try { await create(rule); added.push(rule); report(rule.country, false); }
    catch (error) {
      if (!isUnsupportedCountry(error, rule.country)) throw error;
      unsupported.add(rule.country); report(rule.country, true);
    }
  }
  return added;
}
function money(m: Money) {
  if (!m || m.currency_code !== 'EUR' || !Number.isFinite(m.amount) || !Number.isFinite(m.divisor) || m.amount < 0 || m.divisor <= 0) throw new Error('Versandkosten müssen gültige EUR-Beträge sein.');
  return m.amount / m.divisor;
}
function tariff(d: Destination) {
  const cost = { primary_cost: money(d.primary_cost), secondary_cost: money(d.secondary_cost) };
  if (d.mail_class && Number.isSafeInteger(d.shipping_carrier_id) && d.shipping_carrier_id > 0) return { ...cost, shipping_carrier_id: d.shipping_carrier_id, mail_class: d.mail_class };
  if (Number.isInteger(d.min_delivery_days) && Number.isInteger(d.max_delivery_days) && d.min_delivery_days! >= 1 && d.max_delivery_days! >= d.min_delivery_days!) return { ...cost, min_delivery_days: d.min_delivery_days!, max_delivery_days: d.max_delivery_days! };
  throw new Error('Lieferzeit oder Versanddienst nicht eindeutig übertragbar.');
}
const everywhere = (d: Destination) => !d.destination_country_iso && (!d.destination_region || d.destination_region === 'none');
export function effective(destinations: Destination[], country: string): Destination | undefined {
  return destinations.find(d => d.destination_country_iso === country) ?? (EU.has(country) ? destinations.find(d => !d.destination_country_iso && d.destination_region === 'eu') : undefined) ?? destinations.find(everywhere);
}
export function planProfile(profile: Profile, excluded: string[]) {
  if (profile.profile_type !== 'manual') throw new Error(`Profil ${profile.shipping_profile_id}: nur manuelle Versandprofile werden unterstützt.`);
  const blocked = [...new Set(excluded)].sort();
  if (!blocked.length || blocked.some(c => !EU.has(c))) throw new Error('Dieses Kommando unterstützt ausschließlich EU-Länderausschlüsse.');
  const ds = profile.shipping_profile_destinations;
  if (!ds?.length) throw new Error('Profil ohne Versandziele.');
  const keys = ds.map(d => d.destination_country_iso || d.destination_region || 'none');
  if (new Set(keys).size !== keys.length) throw new Error('Doppelte Versandziele im Profil.');
  if (ds.some(d => !d.destination_country_iso && !['none', 'eu', 'non_eu', ''].includes(d.destination_region))) throw new Error('Unbekannte Versandregion.');
  const global = ds.find(everywhere);
  if (global && ds.some(d => !d.destination_country_iso && d.destination_region === 'non_eu')) throw new Error('Weltweit plus Europa außerhalb EU: manuelle Prüfung erforderlich, um Länderpreise sicher zu erhalten.');
  const remove = ds.filter(d => blocked.includes(d.destination_country_iso) || (!d.destination_country_iso && d.destination_region === 'eu') || everywhere(d));
  // Do not rewrite EU/worldwide if none of the excluded countries is currently reachable.
  if (!blocked.some(c => effective(ds, c))) return { profileId: profile.shipping_profile_id, title: profile.title, excluded: blocked, add: [] as Rule[], remove: [] as Destination[] };
  const explicit = new Set(ds.filter(d => d.destination_country_iso).map(d => d.destination_country_iso));
  const add: Rule[] = [];
  for (const country of COUNTRIES) {
    if (blocked.includes(country) || explicit.has(country)) continue;
    const original = effective(ds, country);
    if (original) add.push({ country, ...tariff(original) });
  }
  const remaining = ds.length - remove.length + add.length;
  if (remaining < 1) throw new Error('Ausschluss würde alle Versandziele entfernen.');
  for (const d of ds) tariff(d);
  return { profileId: profile.shipping_profile_id, title: profile.title, excluded: blocked, add, remove };
}
export function selectPlans(profiles: Profile[], listings: Listing[], sections: Array<{ shop_section_id: number; title: string }>, exclusions: Record<string, string[]>) {
  const selected = new Map<number, { blocked: string[]; listings: number[] }>();
  for (const [name, blocked] of Object.entries(exclusions)) {
    const matches = sections.filter(s => s.title.trim() === name);
    if (matches.length !== 1) throw new Error(`Shop-Abteilung ${name} fehlt oder ist nicht eindeutig.`);
    for (const l of listings.filter(l => l.shop_section_id === matches[0].shop_section_id)) {
      if (l.type === 'download' || l.listing_type === 'download') continue;
      if (!l.shipping_profile_id) throw new Error(`Artikel ${l.listing_id}: kein Versandprofil.`);
      const previous = selected.get(l.shipping_profile_id);
      if (previous && JSON.stringify([...previous.blocked].sort()) !== JSON.stringify([...blocked].sort())) throw new Error(`Profil ${l.shipping_profile_id} wird mit unterschiedlichen Ausschlüssen geteilt. Profile zuerst trennen.`);
      selected.set(l.shipping_profile_id, { blocked, listings: [...(previous?.listings ?? []), l.listing_id] });
    }
  }
  return [...selected].map(([id, selection]) => {
    if (listings.some(l => l.shipping_profile_id === id && !selection.listings.includes(l.listing_id))) throw new Error(`Profil ${id} wird auch außerhalb der ausgewählten Artikel verwendet. Abbruch.`);
    const profile = profiles.find(p => p.shipping_profile_id === id);
    if (!profile) throw new Error(`Profil ${id} fehlt.`);
    return { ...planProfile(profile, selection.blocked), listings: selection.listings, before: profile };
  });
}
function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function comparable(ds: Destination[]) { return ds.map(d => ({ country: d.destination_country_iso, region: d.destination_region || 'none', ...tariff(d) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); }
export async function runShipping(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { confirm: { type: 'boolean', default: false }, listing: { type: 'string' }, 'expected-shop': { type: 'string' } } });
  const mode = positionals[0];
  if (positionals.length !== 1 || !['preview', 'apply'].includes(mode)) throw new Error('Aufruf: npm run shipping:exclude -- preview|apply [--confirm] [--listing ID] [--expected-shop ID]');
  if (mode === 'apply' && !values.confirm) throw new Error('Für Änderungen --confirm angeben.');
  for (const [name, value] of [['listing', values.listing], ['expected-shop', values['expected-shop']]]) if (value !== undefined && !/^[1-9]\d*$/.test(value)) throw new Error(`Ungültige --${name} ID.`);
  const { getMyShop, getAllShopListings, getListing, etsyFetch } = await import('./etsy.js');
  const { loadToken } = await import('./token-store.js');
  const out = resolve('out/shipping'); await mkdir(out, { recursive: true });
  const lockPath = join(out, 'operation.lock');
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Versandvorgang läuft bereits. out/shipping/operation.lock prüfen.'); });
  try {
    const shop = await getMyShop();
    if (values['expected-shop'] && String(shop.shop_id) !== values['expected-shop']) throw new Error('Etsy-Versandprüfung: unerwarteter Shop.');
    const target = values.listing ? await getListing(Number(values.listing)) : undefined;
    if (target && target.shop_id !== shop.shop_id) throw new Error('Artikel gehört nicht zum autorisierten Etsy-Shop.');
    if (target && (target.type === 'download' || target.listing_type === 'download')) {
      console.log(`Artikel ${target.listing_id}: digitaler Download, keine Versand-Länderausschlüsse erforderlich.`);
      return;
    }

    const sections = await etsyFetch<{ results: Array<{ shop_section_id: number; title: string }> }>(`/application/shops/${shop.shop_id}/sections`);
    const listings = (await Promise.all((['active', 'draft', 'inactive', 'sold_out', 'expired'] as const).map(s => getAllShopListings(shop.shop_id, s)))).flat();
    if (listings.some(l => l.shop_id !== shop.shop_id)) throw new Error('Artikel gehört nicht zum Shop.');
    const exclusions = JSON.parse(await readFile(resolve('config/shipping-exclusions.json'), 'utf8')) as Record<string, string[]>;
    if (target) {
      const sectionName = sections.results.find(s => s.shop_section_id === target.shop_section_id)?.title.trim();
      if (!sectionName || !exclusions[sectionName]) throw new Error('Artikel noch keiner konfigurierten Versand-Abteilung zugeordnet. Erst Etsy-Nachbearbeitung abschließen.');
      if (!target.shipping_profile_id) throw new Error('Etsy-Artikel hat noch kein Versandprofil. gelato:resume später erneut ausführen.');
      const index = listings.findIndex(l => l.listing_id === target.listing_id);
      if (index < 0) listings.push(target); else listings[index] = target;
    }

    const ids = new Set(listings.filter(l => sections.results.some(s => s.shop_section_id === l.shop_section_id && exclusions[s.title.trim()])).map(l => l.shipping_profile_id).filter((id): id is number => !!id));
    const profile = (id: number) => etsyFetch<Profile>(`/application/shops/${shop.shop_id}/shipping-profiles/${id}`);
    const profiles = []; for (const id of ids) profiles.push(await profile(id));
    if (profiles.some(p => p.user_id !== shop.user_id)) throw new Error('Fremdes Versandprofil.');
    const plans = selectPlans(profiles, listings, sections.results, exclusions).filter(p => !target || p.profileId === target.shipping_profile_id);
    if (target && plans.length !== 1) throw new Error('Kein eindeutiger Versandplan für den Artikel gefunden.');
    const changed = plans.filter(p => p.add.length || p.remove.length);
    console.table(plans.map(p => ({ profil: p.profileId, name: p.title, artikel: p.listings.length, ausschluss: p.excluded.join(', '), neueLaenderzeilen: p.add.length, entfernteZeilen: p.remove.length })));
    if (mode === 'preview') {
      await writeFile(join(out, 'preview.json'), JSON.stringify({ shopId: shop.shop_id, plans }, null, 2), { mode: 0o600 });
      console.log('Nur Vorschau. Keine Etsy-Versandprofile geändert. Details: out/shipping/preview.json');
      return;
    }
    if (!changed.length) { console.log('Alle Ausschlüsse bereits korrekt.'); return; }
    const token = await loadToken() as ({ scope?: string } | null);
    if (!token?.scope?.split(/\s+/).includes('shops_w')) throw new Error('Etsy-Berechtigung shops_w fehlt. Einmal ausführen: ETSY_SCOPES="shops_r shops_w listings_r listings_w" npm run auth. Danach Vorschau erneut prüfen und apply starten.');
    // All profiles must still match before the first write.
    for (const p of changed) if (hash(await profile(p.profileId)) !== hash(p.before)) throw new Error(`Profil ${p.profileId} inzwischen geändert. Vorschau erneut ausführen.`);
    const backup = join(out, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await writeFile(backup, JSON.stringify({ shopId: shop.shop_id, plans: changed }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(`Sicherung: ${backup}`);
    const unsupported = new Set<string>();
    const saveUnsupported = () => writeFile(join(out, 'unsupported-countries.json'), JSON.stringify({ shopId: shop.shop_id, checkedAt: new Date().toISOString(), countries: [...unsupported].sort() }, null, 2), { mode: 0o600 });
    for (const p of changed) {
      const base = `/application/shops/${shop.shop_id}/shipping-profiles/${p.profileId}/destinations`;
      // Create every supported replacement before removing original broad rules.
      // Other HTTP errors, rate limits and network failures still stop the run.
      const added = await addReplacementRules(p.add, async r => {
        const { country, ...fields } = r;
        const body = new URLSearchParams({ destination_country_iso: country, ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)])) });
        await etsyFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      }, unsupported, (country, skipped) => console.log(`${p.profileId}: ${country} ${skipped ? 'von Etsy nicht unterstützt, übersprungen' : 'ergänzt'}.`));
      await saveUnsupported();
      const expanded = await profile(p.profileId);
      const originalIds = new Set(p.before.shipping_profile_destinations.map(d => d.shipping_profile_destination_id));
      const originals = expanded.shipping_profile_destinations.filter(d => originalIds.has(d.shipping_profile_destination_id));
      if (JSON.stringify(comparable(originals)) !== JSON.stringify(comparable(p.before.shipping_profile_destinations))) throw new Error('Versandprofil während der Ergänzung geändert. Sammelziele bleiben bestehen.');
      for (const r of added) {
        const d = expanded.shipping_profile_destinations.find(d => d.destination_country_iso === r.country);
        if (!d || JSON.stringify({ country: r.country, ...tariff(d) }) !== JSON.stringify(r)) throw new Error(`Neue Länderzeile ${r.country} nicht bestätigt. Sammelziele bleiben bestehen.`);
      }
      if (expanded.shipping_profile_destinations.length - p.remove.length < 1) throw new Error('Keine unterstützten Versandziele übrig. Sammelziele bleiben bestehen.');
      for (const d of p.remove) await etsyFetch(`${base}/${d.shipping_profile_destination_id}`, { method: 'DELETE' });
      const after = await profile(p.profileId);
      const next = planProfile(after, p.excluded);
      if (next.add.length || next.remove.length) throw new Error(`Ausschluss für Profil ${p.profileId} nicht bestätigt.`);
      for (const c of COUNTRIES.filter(c => !p.excluded.includes(c) && !unsupported.has(c))) {
        const before = effective(p.before.shipping_profile_destinations, c); const now = effective(after.shipping_profile_destinations, c);
        if (!!before !== !!now || (before && now && JSON.stringify(tariff(before)) !== JSON.stringify(tariff(now)))) throw new Error(`Nachprüfung: Versandkosten für ${c} weichen ab.`);
      }
      console.log(`${p.profileId}: Ausschlüsse und übrige Länderpreise geprüft.`);
    }
    if (unsupported.size) console.log(`Von Etsy nicht unterstützte Länder: ${[...unsupported].sort().join(', ')}. Details: out/shipping/unsupported-countries.json`);
    console.log('Versandprofile aktualisiert. Künftige Anbieter-Synchronisationen können sie erneut ändern; Vorschau danach prüfen.');
  } finally { await lock.close(); await unlink(lockPath); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runShipping().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
