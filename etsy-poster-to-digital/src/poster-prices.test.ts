import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSize, planPrices, parsePriceOptions, type Inventory } from './poster-prices.js';
const fixture = (): Inventory => ({ products: ['30x40 cm / 12x16” - Vertical', '45 × 60 cm', '24x32 inches'].map((size, i) => ({ sku: `gelato-${i}`, property_values: [{ property_id: 513, property_name: 'Size', values: [size], value_ids: [i + 1] }], offerings: [{ quantity: 999, is_enabled: true, price: { amount: 1049, divisor: 100, currency_code: 'EUR' }, readiness_state_id: 123 }] })), price_on_property: [513], quantity_on_property: [], sku_on_property: [513], readiness_state_on_property: [] });
test('recognizes metric, inch and combined labels without partial matches', () => {
  assert.equal(detectSize('30 × 40 cm / 12x16” - Vertical'), '30x40');
  assert.equal(detectSize('18 x 24 inches'), '45x60');
  assert.equal(detectSize('60x80 cm'), '60x80');
  assert.equal(detectSize('130x40'), undefined);
  assert.throws(() => detectSize('30x40 / 18x24'), /Widersprüchlich/);
});
test('updates each size while retaining SKU, properties, stock and processing profiles', () => {
  const inv = fixture(); const original = structuredClone(inv); const { payload, rows } = planPrices(inv);
  assert.deepEqual(inv, original);
  assert.deepEqual(rows.map(r => r.after), [20.99, 24.99, 30.99]);
  assert.deepEqual(payload.products[0], { sku: 'gelato-0', property_values: [{ property_id: 513, property_name: 'Size', scale_id: null, value_ids: [1], values: ['30x40 cm / 12x16” - Vertical'] }], offerings: [{ quantity: 999, is_enabled: true, price: 20.99, readiness_state_id: 123 }] });
  assert.deepEqual(payload.sku_on_property, [513]);
  assert.deepEqual(payload.readiness_state_on_property, []);
});
test('unknown sizes and foreign currencies fail before writing', () => {
  const inv = fixture(); inv.products[1].property_values[0].values = ['50x70 cm']; assert.throws(() => planPrices(inv), /nicht eindeutig/);
  const usd = fixture(); (usd.products[0].offerings[0].price as { currency_code: string }).currency_code = 'USD'; assert.throws(() => planPrices(usd), /EUR/);
});
test('deleted variants stay excluded and size becomes a price property', () => {
  const inv = fixture(); inv.products[1].is_deleted = true; inv.price_on_property = [];
  assert.equal(planPrices(inv).payload.products.length, 2);
  assert.deepEqual(planPrices(inv).payload.price_on_property, [513]);
});

test('custom CLI prices reach all corresponding variant offerings', () => {
  const { prices, mode, state, confirm } = parsePriceOptions(['update', '--price-30x40', '21,49', '--price-45x60', '26.50', '--price-60x80', '34', '--state', 'all', '--confirm']);
  assert.equal(mode, 'update'); assert.equal(state, 'all'); assert.equal(confirm, true);
  assert.deepEqual(planPrices(fixture(), prices).payload.products.map(p => p.offerings[0].price), [21.49, 26.5, 34]);
  assert.deepEqual(parsePriceOptions(['preview']).prices, { '30x40': 20.99, '45x60': 24.99, '60x80': 30.99 });
});
test('invalid and missing price values and unknown flags are rejected', () => {
  for (const raw of ['0', '-1', 'NaN', 'Infinity', '12.345', '1e2', '']) assert.throws(() => parsePriceOptions(['preview', '--price-30x40', raw]));
  assert.throws(() => parsePriceOptions(['preview', '--price-30x40']));
  assert.throws(() => parsePriceOptions(['preview', '--price-30x4', '22']));
});
