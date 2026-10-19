import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manufacturerDescription, isPhysicalListing } from './gpsr-text.js';
const contact = { name: 'Stefan Marx', email: 'stefanmarx.de@gmail.com', addressLine1: 'Friedrichsberger Str. 5', postalCode: '10243', city: 'Berlin', country: 'Germany', gpsrRole: 'manufacturer', provider: 'gelato' };
test('manufacturer block preserves paragraphs, repeats safely and never invents safety claims', () => {
 const original = 'First paragraph.\n\nSecond paragraph.';
 const result = manufacturerDescription(original, contact);
 assert.ok(result.startsWith(original + '\n\n'));
 assert.equal(manufacturerDescription(result, contact), result);
 assert.ok(!result.includes('safe'));
 assert.throws(() => manufacturerDescription(result, { ...contact, name: 'Other' }), /Abweichender/);
});
test('unconfirmed roles and other providers are refused', () => {
 assert.throws(() => manufacturerDescription('', { ...contact, gpsrRole: 'unconfirmed' }));
 assert.throws(() => manufacturerDescription('', { ...contact, provider: 'printify' }));
});

test('Etsy listing_type identifies physical items and downloads or unknown types are refused', () => {
 assert.equal(isPhysicalListing({ listing_type: 'physical' }), true);
 assert.equal(isPhysicalListing({ type: 'physical' }), true);
 assert.equal(isPhysicalListing({ listing_type: 'download' }), false);
 assert.equal(isPhysicalListing({}), false);
 assert.equal(isPhysicalListing({ type: 'download', listing_type: 'physical' }), false);
});
