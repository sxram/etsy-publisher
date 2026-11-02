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

test('portrait artwork retains top and bottom bands inside a square print area', async () => {
 const band = async (color:string) => sharp({create:{width:80,height:20,channels:3,background:color}}).png().toBuffer();
 const art=await sharp({create:{width:80,height:160,channels:3,background:'#00aa00'}}).composite([{input:await band('#ff0000'),left:0,top:0},{input:await band('#0000ff'),left:0,top:140}]).png().toBuffer();
 const blank=await sharp({create:{width:200,height:200,channels:3,background:'white'}}).png().toBuffer();
 const output=await renderColorMockup(blank,art,{left:50,top:40,width:100,height:100});
 const {data,info}=await sharp(output).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const px=(x:number,y:number)=>[...data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3)];
 assert.ok(px(100,44)[0]!>220 && px(100,44)[2]!<30,'top title band retained');
 assert.ok(px(100,135)[2]!>220 && px(100,135)[0]!<30,'bottom band retained');
 assert.ok(px(55,80).every(v=>v>240),'aspect ratio preserved, not stretched to fill');
});
