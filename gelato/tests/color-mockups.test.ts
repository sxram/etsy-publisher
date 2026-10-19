import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderColorMockup, overviewPages } from '../src/color-mockups.js';
test('overlay preserves opaque white margins, fits without cropping and leaves shirt outside print untouched', async () => {
 const blank = await sharp({create:{width:200,height:200,channels:3,background:'#002060'}}).png().toBuffer();
 const art = await sharp({create:{width:80,height:100,channels:3,background:'white'}}).composite([{input:await sharp({create:{width:40,height:60,channels:3,background:'red'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();
 const placement = {left:60,top:50,width:80,height:100,file:'blank.jpg',sha256:'metadata'};
 const out = await renderColorMockup(blank,art,placement);
 const {data,info}=await sharp(out).raw().toBuffer({resolveWithObject:true});
 const px=(x:number,y:number)=>[...data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3)];
 assert.ok(px(65,55).every(v=>v>240));
 assert.ok(px(90,90)[0]!>220 && px(90,90)[1]!<30);
 assert.ok(px(10,10)[2]!>70 && px(10,10)[0]!<15);
 await assert.rejects(renderColorMockup(blank,art,{left:190,top:10,width:30,height:30}),/Druckbereich/);
});

test('white stays separate and eleven colors yield six and five per overview', () => {
 const entries = ['white', ...Array.from({length:11}, (_, i) => `color-${i}`)].map(color=>({color}));
 const pages = overviewPages(entries); assert.deepEqual(pages.map(p=>p.length),[6,5]);assert.ok(pages.flat().every(e=>e.color!=='white'));
});
