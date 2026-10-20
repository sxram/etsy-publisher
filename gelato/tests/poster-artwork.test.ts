import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preparePosterArtwork, validatePosterTemplate, posterSize } from '../src/poster-artwork.js';
import { buildGelatoPayload } from '../src/clients/gelato.js';
test('poster template maps actual German size values and rejects ambiguous layers', () => {
 const variants=['30x40','45x60','60x80'].map((size,i)=>({id:String(i),variantOptions:[{name:'Größe',value:`${size} cm / inches`}],imagePlaceholders:[{name:'Art'}]}));
 const t={id:'template',variants}; validatePosterTemplate(t);
 const p=buildGelatoPayload(t,{title:'Poster',description:'A\n\nB',tags:['art']},'', 'auto',v=>({url:`https://example.com/${posterSize(v)}.jpg`,placeholder:v.imagePlaceholders[0]!.name}));
 assert.deepEqual(p.variants.map(v=>v.imagePlaceholders[0]!.fileUrl),['30x40','45x60','60x80'].map(s=>`https://example.com/${s}.jpg`));
 assert.throws(()=>validatePosterTemplate({...t,variants:variants.slice(1)}));
 assert.throws(()=>validatePosterTemplate({...t,variants:variants.map(v=>({...v,imagePlaceholders:[{name:'Old'},{name:'New'}]}))}));
 assert.throws(()=>posterSize({...variants[0]!,variantOptions:[{name:'Size',value:'40x30 cm'}]}));
});
test('three print sizes have real pixels and 300 dpi, wrong ratio rejected', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'poster-print-'));
 try {
  const input=join(dir,'input.png'); await sharp({create:{width:60,height:80,channels:3,background:'blue'}}).png().toFile(input);
  const files=await preparePosterArtwork(input,join(dir,'out'));
  for(const [size,expected] of Object.entries({'30x40':[3543,4724],'45x60':[5315,7087],'60x80':[7087,9449]})) {
   const m=await sharp(files[size]).metadata(); assert.deepEqual([m.width,m.height],expected); assert.equal(m.density,300); assert.equal(m.format,'jpeg');
  }
  const square=join(dir,'square.png');await sharp({create:{width:50,height:50,channels:3,background:'white'}}).png().toFile(square);
  await assert.rejects(preparePosterArtwork(square,dir),/3:4/);
 } finally {await rm(dir,{recursive:true,force:true});}
});
