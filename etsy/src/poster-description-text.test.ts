import {test} from 'node:test';
import assert from 'node:assert/strict';
import {restorePosterParagraphs} from './poster-description-text.js';
test('restore collapsed paragraphs and preserve GPSR without changing prose',()=>{
 const source='First paragraph.\n\nSecond paragraph.\n- Detail';
 const current='First paragraph. Second paragraph. - Detail\n\nGPSR — Manufacturer contact\nStefan Marx';
 assert.equal(restorePosterParagraphs(current,source),source+'\n\nGPSR — Manufacturer contact\nStefan Marx');
 assert.equal(restorePosterParagraphs(source,source),source);
 assert.throws(()=>restorePosterParagraphs('Manually changed.',source),/inhaltlich/);
});
