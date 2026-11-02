import { test } from 'node:test';
import assert from 'node:assert/strict';
import {latestMockupsByColor} from './shirt-mockup-selection.js';
test('selects the newest generation even when an old cropped mockup was republished later',()=>{
 const p={variants:[{id:'s',title:'Color Navy, Size S'},{id:'m',title:'Color Navy, Size M'}],productImages:[{id:'cropped',createdAt:'2026-10-31T08:00:00Z',updatedAt:'2026-10-31T12:00:00Z',productVariantIds:['s'],fileUrl:'old'},{id:'complete',createdAt:'2026-10-31T10:00:00Z',updatedAt:'2026-10-31T10:00:00Z',productVariantIds:['m'],fileUrl:'new'}]};
 assert.equal(latestMockupsByColor(p).get('Navy')?.id,'complete');
 assert.equal(latestMockupsByColor({...p,productImages:[...p.productImages].reverse()}).get('Navy')?.id,'complete');
});
test('does not substitute another color or silently omit a color',()=>{
 assert.throws(()=>latestMockupsByColor({variants:[{id:'s',title:'Color Red, Size S'}],productImages:[]}),/Missing/);
 assert.throws(()=>latestMockupsByColor({variants:[{id:'s',title:'Color Red, Size S'},{id:'m',title:'Color Blue, Size M'}],productImages:[{id:'mixed',createdAt:'2026-10-31T10:00:00Z',productVariantIds:['s','m'],fileUrl:'x'}]}),/unique/);
});
