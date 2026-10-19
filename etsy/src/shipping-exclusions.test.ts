import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, EU, isUnsupportedCountry, addReplacementRules, effective, planProfile, selectPlans, type Destination, type Profile } from './shipping-exclusions.js';
const destination = (id: number, country = '', region = 'none', price = 5): Destination => ({ shipping_profile_destination_id: id, destination_country_iso: country, destination_region: region, primary_cost: { amount: Math.round(price * 100), divisor: 100, currency_code: 'EUR' }, secondary_cost: { amount: 125, divisor: 100, currency_code: 'EUR' }, shipping_carrier_id: 0, mail_class: null, min_delivery_days: 2, max_delivery_days: 6 });
const profile = (destinations: Destination[]): Profile => ({ shipping_profile_id: 10, title: 'Test', profile_type: 'manual', user_id: 1, shipping_profile_destinations: destinations });
function simulate(p: Profile, excluded: string[]) {
  const plan = planProfile(p, excluded);
  const remaining = p.shipping_profile_destinations.filter(d => !plan.remove.includes(d));
  const added = plan.add.map((r, i) => ({ ...destination(1000 + i, r.country, 'none', r.primary_cost), secondary_cost: { amount: Math.round(r.secondary_cost * 100), divisor: 100, currency_code: 'EUR' }, min_delivery_days: r.min_delivery_days ?? null, max_delivery_days: r.max_delivery_days ?? null }));
  return { plan, after: profile([...remaining, ...added]) };
}
test('EU expansion preserves explicit country overrides and excludes FR/ES', () => {
  const p = profile([destination(1, '', 'eu', 3.99), destination(2, 'DE', 'none', 4.19), destination(3, 'FR', 'none', 7)]);
  const { plan, after } = simulate(p, ['FR', 'ES']);
  assert.equal(plan.add.length, 24); assert.equal(plan.remove.length, 2);
  assert.equal(effective(after.shipping_profile_destinations, 'FR'), undefined);
  assert.equal(effective(after.shipping_profile_destinations, 'ES'), undefined);
  assert.equal(effective(after.shipping_profile_destinations, 'DE')!.primary_cost.amount, 419);
  assert.equal(effective(after.shipping_profile_destinations, 'IT')!.primary_cost.amount, 399);
});
test('worldwide + EU becomes individual countries, retains rates everywhere else, repeat is no-op', () => {
  const p = profile([destination(1, '', 'none', 10.64), destination(2, '', 'eu', 3.99), destination(3, 'DE', 'none', 4.19), destination(4, 'US', 'none', 4.17)]);
  const original = structuredClone(p);
  const { after } = simulate(p, ['FR', 'ES']);
  assert.deepEqual(p, original);
  for (const c of COUNTRIES) {
    const d = effective(after.shipping_profile_destinations, c);
    if (['FR', 'ES'].includes(c)) assert.equal(d, undefined);
    else { const old = effective(p.shipping_profile_destinations, c)!; assert.deepEqual(d!.primary_cost, old.primary_cost); assert.deepEqual(d!.secondary_cost, old.secondary_cost); }
  }
  const next = planProfile(after, ['FR', 'ES']); assert.equal(next.add.length, 0); assert.equal(next.remove.length, 0);
});
test('poster rule retains France and excludes Spain; limited Printify profile unchanged', () => {
  const { after } = simulate(profile([destination(1, '', 'eu')]), ['ES']);
  assert.ok(effective(after.shipping_profile_destinations, 'FR')); assert.equal(effective(after.shipping_profile_destinations, 'ES'), undefined);
  const p = profile([destination(1, 'US'), destination(2, 'CA'), destination(3, 'AU')]);
  assert.equal(planProfile(p, ['FR', 'ES']).remove.length, 0); assert.equal(planProfile(p, ['FR', 'ES']).add.length, 0);
});
test('shared profiles outside the scope or conflicting section rules fail', () => {
  const p = profile([destination(1, '', 'eu')]);
  const sections = [{ title: 'Poster', shop_section_id: 1 }, { title: 'Kids T-Shirts', shop_section_id: 2 }];
  const listings = [{ listing_id: 1, shop_id: 1, shop_section_id: 1, shipping_profile_id: 10, state: 'active' }, { listing_id: 2, shop_id: 1, shop_section_id: 2, shipping_profile_id: 10, state: 'draft' }];
  assert.throws(() => selectPlans([p], listings, sections, { Poster: ['ES'], 'Kids T-Shirts': ['FR', 'ES'] }), /unterschiedlichen/);
  assert.throws(() => selectPlans([p], listings, sections, { Poster: ['ES'] }), /außerhalb/);
});
test('rejects ambiguous tariffs, invalid currency and calculated profiles', () => {
  assert.throws(() => planProfile({ ...profile([destination(1)]), profile_type: 'calculated' }, ['ES']), /manuelle/);
  assert.throws(() => planProfile(profile([destination(1, '', 'eu'), destination(2, '', 'eu')]), ['ES']), /Doppelte/);
  const bad = destination(1, '', 'eu'); bad.primary_cost.currency_code = 'USD'; assert.throws(() => planProfile(profile([bad]), ['ES']), /EUR/);
  const missing = destination(1, '', 'eu'); missing.min_delivery_days = null; assert.throws(() => planProfile(profile([missing]), ['ES']), /Lieferzeit/);
});
test('country catalogue is unique and contains all EU members', () => {
  assert.equal(new Set(COUNTRIES).size, COUNTRIES.length); assert.equal(COUNTRIES.length, 250); assert.equal(EU.size, 27);
  for (const c of EU) assert.ok(COUNTRIES.includes(c));
});

test('only exact HTTP 400 unsupported-country errors may be skipped', () => {
  const error = (country: string) => new Error(`Etsy 400 Bad Request: {"error":"The destination country '${country}' is not currently supported."}`);
  assert.equal(isUnsupportedCountry(error('BY'), 'BY'), true);
  assert.equal(isUnsupportedCountry(new Error(error('BY').message + '\n\n'), 'BY'), true);
  assert.equal(isUnsupportedCountry(error('RU'), 'BY'), false);
  assert.equal(isUnsupportedCountry(new Error('Etsy 400 Bad Request: {"error":"Value for destination_country_iso must be a valid ISO Country Code: CI."}'), 'CI'), true);
  assert.equal(isUnsupportedCountry(new Error('Etsy 400 Bad Request: {"error":"Value for destination_country_iso must be a valid ISO Country Code: ZZ."}'), 'ZZ'), false);
  assert.equal(isUnsupportedCountry(new Error('Etsy 400 Bad Request: {"error":"Invalid shipping rate"}'), 'BY'), false);
  assert.equal(isUnsupportedCountry(new Error('Etsy 403 Forbidden: {"error":"The destination country \'BY\' is not currently supported."}'), 'BY'), false);
});
test('unsupported destination is skipped, later supported destinations continue and retries share evidence', async () => {
  const unsupported = new Set<string>(); const calls: string[] = [];
  const rules = ['BY', 'DE', 'US'].map(country => ({ country, primary_cost: 4, secondary_cost: 1 }));
  const create = async (r: { country: string }) => { calls.push(r.country); if (r.country === 'BY') throw new Error(`Etsy 400 Bad Request: {"error":"The destination country 'BY' is not currently supported."}`); };
  const added = await addReplacementRules(rules, create, unsupported);
  assert.deepEqual(added.map(r => r.country), ['DE', 'US']); assert.deepEqual([...unsupported], ['BY']);
  calls.length = 0; await addReplacementRules(rules, create, unsupported); assert.deepEqual(calls, ['DE', 'US']);
});
test('other API and network errors abort immediately without attempting further additions', async () => {
  for (const message of ['Etsy 429 Too Many Requests: {}', 'Etsy 400 Bad Request: {"error":"Invalid shipping rate"}', 'fetch failed']) {
    const calls: string[] = [];
    await assert.rejects(addReplacementRules(['BY', 'DE'].map(country => ({ country, primary_cost: 4, secondary_cost: 1 })), async r => { calls.push(r.country); throw new Error(message); }), { message });
    assert.deepEqual(calls, ['BY']);
  }
});
