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

test('explicit previous source permits authorized age removal, preserves all newlines and GPSR',()=>{
 const old='Intro.\n\nDesigned with ages 4–10 in mind.\n\nDetails.\n- One\n- Two';
 const target='Intro.\n\nDetails.\n- One\n- Two';
 const suffix='GPSR — Manufacturer contact\nContact';
 assert.equal(restorePosterParagraphs(old.replace(/\s+/g,' ')+'\n\n'+suffix,target,old),target+'\n\n'+suffix);
 assert.throws(()=>restorePosterParagraphs('Different prose.',target,old),/inhaltlich/);
 assert.equal(restorePosterParagraphs(target+'\n\n'+suffix,target),target+'\n\n'+suffix);
});

test('restore line breaks lost between adjacent bullet points',()=>{
 const source='Intro.\n\n- Soft fabric\n- Durable seams';
 assert.equal(restorePosterParagraphs('Intro. - Soft fabric- Durable seams',source),source);
});
